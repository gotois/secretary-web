export interface TranscriptionGateway {
  transcribe(input: { url: string; duration: number; mediaType: string; timeoutMs?: number }): Promise<string>;
}

export interface AssistantTextGateway {
  processText(input: {
    text: string;
    chatId: number;
    tenantId: number;
    userId?: string;
    language: string;
    accessToken: string;
    location?: string | null;
    timezone?: string | null;
  }): Promise<{ content: Array<{ text: string }>; artifact?: unknown[] }>;
}
