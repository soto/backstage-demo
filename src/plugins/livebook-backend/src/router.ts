import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import express from 'express';
import Router from 'express-promise-router';
import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { CatalogApi } from '@backstage/catalog-client';
import {
  getGithubFileFetchUrl,
  ScmIntegrations,
} from '@backstage/integration';
import { parseEntityRef } from '@backstage/catalog-model';
import { parseLivemd, extractTitle } from './LivebookParser';
import fetch from 'node-fetch';

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  catalogApi: CatalogApi;
}

interface ResolvedSource {
  type: 'github' | 'url' | 'dir';
  baseUrl: string;
  token?: string;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config, catalogApi } = options;
  const integrations = ScmIntegrations.fromConfig(config);

  const router = Router();
  router.use(express.json());

  // GET /files?entityRef=component:default/my-service
  // Returns list of .livemd files for the given entity
  router.get('/files', async (req, res) => {
    const entityRef = req.query.entityRef as string;
    if (!entityRef) {
      res.status(400).json({ error: 'entityRef query parameter is required' });
      return;
    }

    try {
      const { kind, namespace, name } = parseEntityRef(entityRef);
      const entity = await catalogApi.getEntityByRef({
        kind,
        namespace: namespace || 'default',
        name,
      });

      if (!entity) {
        res.status(404).json({ error: `Entity not found: ${entityRef}` });
        return;
      }

      const livebookRef =
        entity.metadata.annotations?.['livebook.dev/ref'];
      if (!livebookRef) {
        res.status(404).json({
          error: `Entity ${entityRef} has no livebook.dev/ref annotation`,
        });
        return;
      }

      const files = await discoverLivebookFiles(
        livebookRef,
        entity.metadata.annotations?.['backstage.io/source-location'] || '',
        integrations,
        logger,
      );

      res.json(files);
    } catch (err: any) {
      logger.error(`Error fetching livebook files for ${entityRef}`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /content?entityRef=component:default/my-service&path=notebooks/guide.livemd
  // Returns parsed HTML content for a specific .livemd file
  router.get('/content', async (req, res) => {
    const entityRef = req.query.entityRef as string;
    const filePath = req.query.path as string;

    if (!entityRef || !filePath) {
      res.status(400).json({
        error: 'entityRef and path query parameters are required',
      });
      return;
    }

    try {
      const { kind, namespace, name } = parseEntityRef(entityRef);
      const entity = await catalogApi.getEntityByRef({
        kind,
        namespace: namespace || 'default',
        name,
      });

      if (!entity) {
        res.status(404).json({ error: `Entity not found: ${entityRef}` });
        return;
      }

      const livebookRef =
        entity.metadata.annotations?.['livebook.dev/ref'];
      if (!livebookRef) {
        res.status(404).json({
          error: `Entity ${entityRef} has no livebook.dev/ref annotation`,
        });
        return;
      }

      const rawContent = await fetchLivebookFile(
        livebookRef,
        filePath,
        entity.metadata.annotations?.['backstage.io/source-location'] || '',
        integrations,
        logger,
      );

      const parsed = parseLivemd(rawContent);

      res.json({
        path: filePath,
        title: parsed.title,
        contentHtml: parsed.html,
        rawMarkdown: parsed.rawMarkdown,
      });
    } catch (err: any) {
      logger.error(
        `Error fetching livebook content for ${entityRef}:${filePath}`,
        err,
      );
      res.status(500).json({ error: err.message });
    }
  });

  // Health check
  router.get('/health', async (_req, res) => {
    res.json({ status: 'ok' });
  });

  const middleware = MiddlewareFactory.create({ logger, config });
  router.use(middleware.error());
  return router;
}

/**
 * Discover .livemd files for an entity.
 *
 * The `livebook.dev/ref` annotation can be:
 *   - "dir:." or "dir:./notebooks"  -> relative to the entity source location
 *   - "url:https://github.com/org/repo/tree/main/notebooks" -> absolute URL to a directory
 *   - A comma-separated list of .livemd file paths relative to the source
 */
async function discoverLivebookFiles(
  livebookRef: string,
  sourceLocation: string,
  integrations: ScmIntegrations,
  logger: LoggerService,
): Promise<Array<{ path: string; name: string; title: string }>> {
  // If livebookRef is a comma-separated list of file paths
  if (
    !livebookRef.startsWith('dir:') &&
    !livebookRef.startsWith('url:')
  ) {
    const paths = livebookRef.split(',').map(p => p.trim());
    const files = [];
    for (const p of paths) {
      const fileName = p.split('/').pop() || p;
      files.push({
        path: p,
        name: fileName,
        title: fileName.replace(/\.livemd$/, ''),
      });
    }
    return files;
  }

  // For dir: references, try to use GitHub API to list files
  if (livebookRef.startsWith('dir:')) {
    const dir = livebookRef.slice(4);
    return discoverFromDirectory(dir, sourceLocation, integrations, logger);
  }

  // For url: references
  if (livebookRef.startsWith('url:')) {
    const url = livebookRef.slice(4);
    return discoverFromUrl(url, integrations, logger);
  }

  return [];
}

async function discoverFromDirectory(
  dir: string,
  sourceLocation: string,
  integrations: ScmIntegrations,
  logger: LoggerService,
): Promise<Array<{ path: string; name: string; title: string }>> {
  // Try to resolve the source location to a GitHub repo
  // sourceLocation format: "url:https://github.com/org/repo/tree/main/"
  let baseUrl = sourceLocation;
  if (baseUrl.startsWith('url:')) {
    baseUrl = baseUrl.slice(4);
  }

  if (!baseUrl) {
    logger.warn('No source location available to resolve directory reference');
    return [];
  }

  // Construct the directory URL
  let dirUrl = baseUrl;
  if (dir !== '.' && dir !== './') {
    // Remove trailing slash and append dir
    dirUrl = baseUrl.replace(/\/$/, '') + '/' + dir.replace(/^\.\//, '');
  }

  return discoverFromUrl(dirUrl, integrations, logger);
}

async function discoverFromUrl(
  url: string,
  integrations: ScmIntegrations,
  logger: LoggerService,
): Promise<Array<{ path: string; name: string; title: string }>> {
  // For GitHub URLs, use the GitHub API to list directory contents
  const ghMatch = url.match(
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/?(.*)/,
  );
  if (ghMatch) {
    const [, owner, repo, branch, path] = ghMatch;
    const ghIntegration = integrations.github.byUrl(url);
    const token = ghIntegration?.config.token;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path || ''}?ref=${branch}`;

    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
      };
      if (token) {
        headers.Authorization = `token ${token}`;
      }

      const resp = await fetch(apiUrl, { headers });
      if (!resp.ok) {
        logger.warn(
          `GitHub API returned ${resp.status} for ${apiUrl}`,
        );
        return [];
      }

      const items: any[] = await resp.json();
      const livemdFiles = items.filter(
        (item: any) =>
          item.type === 'file' && item.name.endsWith('.livemd'),
      );

      const files = [];
      for (const file of livemdFiles) {
        const filePath = file.path;
        files.push({
          path: filePath,
          name: file.name,
          title: file.name.replace(/\.livemd$/, ''),
        });
      }

      // Also scan subdirectories (one level deep)
      const dirs = items.filter((item: any) => item.type === 'dir');
      for (const d of dirs) {
        const subUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${d.path}?ref=${branch}`;
        try {
          const subResp = await fetch(subUrl, { headers });
          if (subResp.ok) {
            const subItems: any[] = await subResp.json();
            const subFiles = subItems.filter(
              (item: any) =>
                item.type === 'file' && item.name.endsWith('.livemd'),
            );
            for (const sf of subFiles) {
              files.push({
                path: sf.path,
                name: sf.name,
                title: `${d.name}/${sf.name.replace(/\.livemd$/, '')}`,
              });
            }
          }
        } catch {
          // Skip subdirectories that fail
        }
      }

      return files;
    } catch (err) {
      logger.error(`Failed to discover livebook files from GitHub: ${url}`, err as Error);
      return [];
    }
  }

  // Fallback: treat the URL as a base and try common paths
  logger.info(
    `Non-GitHub URL for livebook discovery, returning empty: ${url}`,
  );
  return [];
}

async function fetchLivebookFile(
  livebookRef: string,
  filePath: string,
  sourceLocation: string,
  integrations: ScmIntegrations,
  logger: LoggerService,
): Promise<string> {
  // Determine the raw content URL
  let baseUrl = sourceLocation;
  if (baseUrl.startsWith('url:')) {
    baseUrl = baseUrl.slice(4);
  }

  // For GitHub: convert to raw content URL
  const ghMatch = baseUrl.match(
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/?(.*)/,
  );
  if (ghMatch) {
    const [, owner, repo, branch] = ghMatch;
    const ghIntegration = integrations.github.byUrl(baseUrl);
    const token = ghIntegration?.config.token;

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `token ${token}`;
    }

    const resp = await fetch(rawUrl, { headers });
    if (!resp.ok) {
      throw new Error(
        `Failed to fetch ${rawUrl}: ${resp.status} ${resp.statusText}`,
      );
    }
    return resp.text();
  }

  // For direct URL references in livebookRef
  if (livebookRef.startsWith('url:')) {
    const livebookBaseUrl = livebookRef.slice(4);
    const fileUrl = `${livebookBaseUrl.replace(/\/$/, '')}/${filePath}`;
    const resp = await fetch(fileUrl);
    if (!resp.ok) {
      throw new Error(
        `Failed to fetch ${fileUrl}: ${resp.status} ${resp.statusText}`,
      );
    }
    return resp.text();
  }

  // Try to construct a URL from the source location and file path
  if (baseUrl) {
    // Try raw GitHub content for any GitHub URL
    const anyGhMatch = baseUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (anyGhMatch) {
      const [, owner, repo] = anyGhMatch;
      const ghIntegration = integrations.github.byUrl(baseUrl);
      const token = ghIntegration?.config.token;
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${filePath}`;
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `token ${token}`;
      }

      const resp = await fetch(rawUrl, { headers });
      if (!resp.ok) {
        throw new Error(
          `Failed to fetch ${rawUrl}: ${resp.status} ${resp.statusText}`,
        );
      }
      return resp.text();
    }
  }

  throw new Error(
    `Unable to resolve file location for ${filePath} (ref: ${livebookRef})`,
  );
}
