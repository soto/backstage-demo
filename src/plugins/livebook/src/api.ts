import { createApiRef, DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';

export interface LivebookFile {
  path: string;
  name: string;
  title: string;
}

export interface LivebookContent {
  path: string;
  title: string;
  contentHtml: string;
  rawMarkdown: string;
}

export interface LivebookApi {
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
