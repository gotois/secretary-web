import test from 'ava';

import { AssistantGateway } from '../../src/infrastructure/secretary/assistant-client.ts';

const commonInput = {
  text: 'hello',
  chatId: 1,
  tenantId: 1,
  language: 'ru',
};

test('configures a scoped SecretaryAI client with the MCP server URL', async (t) => {
  const model = {};
  const database = {};
  let options;
  let closed = false;
  class SecretaryAIClient {
    client = {
      close() {
        closed = true;
        return Promise.resolve();
      },
    };

    constructor(mcpServerUrl, serverName, clientModel, databaseClient) {
      options = { mcpServerUrl, serverName, model: clientModel, db: databaseClient };
    }

    connect() {
      return Promise.resolve();
    }

    chat() {
      return Promise.resolve({ content: [{ text: 'ok' }] });
    }
  }

  const gateway = new AssistantGateway('http://localhost/mcp', model, database, SecretaryAIClient);
  await gateway.processText({ ...commonInput, accessToken: 'token' });

  t.deepEqual(options, {
    mcpServerUrl: 'http://localhost/mcp',
    serverName: 'virtual-secretary-mcp-server',
    model,
    db: database,
  });
  t.assert(closed);
});

test('isolates the MCP authorization header between assistant requests', async (t) => {
  const connections: string[] = [];
  const chats: string[] = [];
  class SecretaryAIClient {
    authorization = '';
    client = {
      close: () => {
        return Promise.resolve();
      },
    };

    connect(headers) {
      this.authorization = headers.get('Authorization');
      connections.push(this.authorization);
      return Promise.resolve();
    }

    chat() {
      chats.push(this.authorization);
      return Promise.resolve({ content: [{ text: 'ok' }] });
    }
  }
  const gateway = new AssistantGateway('http://localhost/mcp', {}, {}, SecretaryAIClient);

  await Promise.all([
    gateway.processText({ ...commonInput, accessToken: 'first' }),
    gateway.processText({ ...commonInput, accessToken: 'second' }),
  ]);

  t.deepEqual(connections.toSorted(), ['Bearer first', 'Bearer second']);
  t.deepEqual(chats.toSorted(), ['Bearer first', 'Bearer second']);
});

test('analyzes external text and images through the configured model', async (t) => {
  let prompt: unknown;
  const model = {
    invoke(input) {
      prompt = input;
      return Promise.resolve({ content: 'Краткое содержание' });
    },
  };
  const fetcher = (() => {
    return Promise.resolve(
      new Response('Содержимое документа', {
        headers: {
          'content-length': '42',
          'content-type': 'text/plain; charset=utf-8',
        },
      }),
    );
  }) as typeof fetch;
  const gateway = new AssistantGateway('http://localhost/mcp', model, {}, class {}, fetcher);

  const result = await gateway.process({ url: 'https://api.telegram.org/file', mediaType: 'text/plain' });

  t.assert(typeof prompt === 'string' && prompt.includes('Содержимое документа'));
  t.deepEqual(result, { content: 'Краткое содержание', mediaType: 'text/plain' });

  const imageFetcher = (() => {
    return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }));
  }) as typeof fetch;
  const imageGateway = new AssistantGateway('http://localhost/mcp', model, {}, class {}, imageFetcher);
  await imageGateway.process({ url: 'https://api.telegram.org/file', mediaType: 'image/jpeg' });
  t.assert(Array.isArray(prompt));
});
