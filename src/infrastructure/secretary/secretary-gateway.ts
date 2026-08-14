import { randomUUID } from 'node:crypto';
import jsonRpc, { type JSONRPCResponse } from 'request-json-rpc2';
import { unpack } from 'zip-pack-unpack';
import { assistantGateway } from '../../app/container.ts';

export class SecretaryGateway {
  host: string;

  constructor(host: string) {
    this.host = host;
  }

  async getTask(input: { taskId: string; accessToken: string }): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.host}/tasks/${encodeURIComponent(input.taskId)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${input.accessToken}`,
      },
    });
    if (!response.ok) {
      const error = new Error('Ошибка Task') as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async queryEvents({
    query,
    accessToken,
    limit = 5,
  }: {
    query: string;
    accessToken: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    const url = new URL(`${this.host}/tasks/query`);
    url.searchParams.set('query', query);
    url.searchParams.set('limit', String(limit));
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      throw new Error('Ошибка поиска событий');
    }
    return response.json();
  }

  async transcribe(input: { fileId: string }): Promise<string> {
    const response = await fetch(`${this.host}/transcription/${input.fileId}`);
    if (!response.ok) {
      throw new Error('Ошибка Voice');
    }

    const text = await response.text();

    return assistantGateway.vzor(text);
  }

  async process(input: { fileId: string }): Promise<{ url: string }> {
    const url = `${this.host}/file/${input.fileId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Ошибка File');
    }
    await (response.headers.get('content-type') === 'application/zip'
      ? unpack(Buffer.from(await response.arrayBuffer()))
      : assistantGateway.vzor(response));
    return { url };
  }

  call(input: {
    method: string;
    params: Record<string, unknown>;
    accessToken: string;
    geolocation?: string;
    timezone?: string;
    accept?: string;
  }): Promise<JSONRPCResponse> {
    return jsonRpc({
      url: `${this.host}/rpc`,
      body: {
        jsonrpc: '2.0',
        id: randomUUID(),
        method: input.method,
        params: input.params,
      },
      headers: {
        Accept: input.accept ?? 'application/json',
        Authorization: `Bearer ${input.accessToken}`,
        Geolocation: input.geolocation,
        Timezone: input.timezone,
      },
    });
  }
}
