import SecretaryAI from 'secretary-ai';

export class AssistantGateway {
  constructor(mcp, model, database, SecretaryAIClient = SecretaryAI) {
    this.ai = new SecretaryAIClient(mcp, 'virtual-secretary-mcp-server', model, database);
  }

  async clearConversation(input: { chatId: number; tenantId: number }): Promise<void> {
    await this.ai.clear({ configurable: { thread_id: input.chatId, tenant_id: input.tenantId } });
  }

  vzor(request: unknown): Promise<string> {
    return this.ai.vzor(request);
  }

  async processText(input: {
    text: string;
    chatId: number;
    tenantId: number;
    userId?: string;
    language: string;
    accessToken: string;
    location?: string | null;
    timezone?: string | null;
  }): Promise<{ content: Array<{ text: string }>; artifact?: unknown[] }> {
    const headers = new Headers({
      Accept: 'text/markdown',
      Authorization: `Bearer ${input.accessToken}`,
    });
    if (input.location) {
      headers.set('Geolocation', input.location);
    } else if (input.timezone) {
      headers.set('Timezone', input.timezone);
    }

    if (!this.ai.isConnected) {
      await this.ai.connect(headers);
    }

    return this.ai.chat(input.text, {
      configurable: {
        thread_id: input.chatId,
        tenant_id: input.tenantId,
      },
      metadata: {
        user_id: input.userId,
        locale: input.language,
      },
      headers,
    });
  }
}
