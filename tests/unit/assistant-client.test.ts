import test from 'ava';

import { AssistantGateway } from '../../src/infrastructure/secretary/assistant-client.ts';

test('configures SecretaryAI with the MCP server URL', (t) => {
  const model = {};
  const database = {};
  let options;
  class SecretaryAIClient {
    constructor(mcpServerUrl, serverName, clientModel, db) {
      options = { mcpServerUrl, serverName, model: clientModel, db };
    }
  }

  new AssistantGateway('http://localhost/mcp', model, database, SecretaryAIClient);

  t.deepEqual(options, {
    mcpServerUrl: 'http://localhost/mcp',
    serverName: 'virtual-secretary-mcp-server',
    model,
    db: database,
  });
});
