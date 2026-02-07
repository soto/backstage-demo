import { createApiRef, DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';

export interface LivebookFile {
  path: string;
  name: string;
  title: string;
  /** URL to import this file into a running Livebook instance */
  importUrl?: string;
}

export interface LivebookContent {
  path: string;
  title: string;
  contentHtml: string;
  rawMarkdown: string;
  /** URL to import this notebook into the configured Livebook instance */
  importUrl?: string;
  /** livebook.dev/run badge URL for sharing */
  runBadgeUrl?: string;
}

export interface LivebookInstanceConfig {
  /** Base URL of the Livebook instance (e.g. https://livebook.mycompany.com) */
  baseUrl: string;
  iframe: {
    /** Whether iframe embedding is enabled */
    enabled: boolean;
    /** URL to use for iframe (may differ from baseUrl for HTTPS) */
    url: string;
  };
  /** Whether a Livebook instance is configured */
  available: boolean;
}

export interface LivebookInstanceStatus {
  connected: boolean;
  status?: number;
  reason?: string;
  url?: string;
}

export interface LivebookApi {
  getConfig(): Promise<LivebookInstanceConfig>;
  getInstanceStatus(): Promise<LivebookInstanceStatus>;
  getFiles(entityRef: string): Promise<LivebookFile[]>;
  getContent(entityRef: string, filePath: string): Promise<LivebookContent>;
}

export const livebookApiRef = createApiRef<LivebookApi>({
  id: 'plugin.livebook.api',
});

export class LivebookClient implements LivebookApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  async getConfig(): Promise<LivebookInstanceConfig> {
    const baseUrl = await this.discoveryApi.getBaseUrl('livebook');
    const resp = await this.fetchApi.fetch(`${baseUrl}/config`);
    if (!resp.ok) {
      throw new Error(`Failed to fetch livebook config: ${resp.statusText}`);
    }
    return resp.json();
  }

  async getInstanceStatus(): Promise<LivebookInstanceStatus> {
    const baseUrl = await this.discoveryApi.getBaseUrl('livebook');
    const resp = await this.fetchApi.fetch(`${baseUrl}/instance/status`);
    if (!resp.ok) {
      throw new Error(`Failed to check livebook instance: ${resp.statusText}`);
    }
    return resp.json();
  }

  async getFiles(entityRef: string): Promise<LivebookFile[]> {
    const baseUrl = await this.discoveryApi.getBaseUrl('livebook');
    const resp = await this.fetchApi.fetch(
      `${baseUrl}/files?entityRef=${encodeURIComponent(entityRef)}`,
    );
    if (!resp.ok) {
      throw new Error(`Failed to fetch livebook files: ${resp.statusText}`);
    }
    return resp.json();
  }

  async getContent(
    entityRef: string,
    filePath: string,
  ): Promise<LivebookContent> {
    const baseUrl = await this.discoveryApi.getBaseUrl('livebook');
    const resp = await this.fetchApi.fetch(
      `${baseUrl}/content?entityRef=${encodeURIComponent(entityRef)}&path=${encodeURIComponent(filePath)}`,
    );
    if (!resp.ok) {
      throw new Error(`Failed to fetch livebook content: ${resp.statusText}`);
    }
    return resp.json();
  }
}
