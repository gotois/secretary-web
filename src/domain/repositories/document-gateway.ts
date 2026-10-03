export interface DocumentGateway {
  process(input: {
    url: string;
    mediaType?: string;
  }): Promise<{ content: string; mediaType: 'text/markdown' | 'text/plain' }>;
}
