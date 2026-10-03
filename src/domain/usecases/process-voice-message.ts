import type { AssistantTextGateway, TranscriptionGateway } from '../repositories/transcription-gateway.ts';

export class ProcessVoiceMessage {
  readonly #transcription: TranscriptionGateway;
  readonly #assistant: AssistantTextGateway;

  constructor(transcription: TranscriptionGateway, assistant: AssistantTextGateway) {
    this.#transcription = transcription;
    this.#assistant = assistant;
  }

  async execute(input: {
    url: string;
    duration: number;
    mediaType: string;
    timeoutMs?: number;
    chatId: number;
    tenantId: number;
    userId?: string;
    language: string;
    accessToken: string;
    location?: string | null;
    timezone?: string | null;
  }): Promise<{ content: Array<{ text: string }>; artifact?: unknown[] }> {
    const text = await this.#transcription.transcribe({
      url: input.url,
      duration: input.duration,
      mediaType: input.mediaType,
      timeoutMs: input.timeoutMs,
    });
    if (!text.trim()) {
      throw new Error('Не удалось распознать голосовое сообщение');
    }
    return this.#assistant.processText({ ...input, text });
  }
}
