import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { createServer, get } from 'node:http';
import { mock, test } from 'node:test';

const events: string[] = [];
const pools: Pool[] = [];
let finishWorker: () => Promise<void> = async () => {};
// MSSQL ConnectionPool uses EventEmitter; the mock preserves that interface.
// eslint-disable-next-line unicorn/prefer-event-target
class Pool extends EventEmitter {
  connected = true;
  connecting = false;
  finish: () => Promise<void> = async () => {};
  constructor() {
    super();
    pools.push(this);
  }
  async close() {
    events.push(`pool:${pools.indexOf(this)}`);
    await this.finish();
  }
}
const root = new URL('../../../web/', import.meta.url);
const moduleUrl = (path: string) => {
  return new URL(path, root).href;
};
mock.module('mssql', { defaultExport: { ConnectionPool: Pool, on() {} } });
mock.module(moduleUrl('lib/logger.ts'), { defaultExport: { info() {}, error() {} } });
mock.module(moduleUrl('queues/send-activity-mq.ts'), {
  namedExports: {
    async closeActivityQueue() {
      events.push('activity');
      await finishWorker();
    },
  },
});
mock.module(moduleUrl('db/redis/index.ts'), {
  defaultExport: {
    quit() {
      events.push('redis');
      return Promise.resolve();
    },
  },
});
const { createShutdown } = await import('../../../web/services/platform/shutdown.ts');

test(
  'shutdown keeps stores available until a real HTTP request and activity worker finish',
  { timeout: 10_000 },
  async () => {
    events.length = 0;
    const received = Promise.withResolvers<void>();
    const releaseHttp = Promise.withResolvers<void>();
    const workerStarted = Promise.withResolvers<void>();
    const releaseWorker = Promise.withResolvers<void>();
    finishWorker = async () => {
      workerStarted.resolve();
      await releaseWorker.promise;
    };
    const server = createServer(async (_request, response) => {
      received.resolve();
      await releaseHttp.promise;
      response.end('saved');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address() as { port: number };
    const response = new Promise<string>((resolve, reject) => {
      get(`http://127.0.0.1:${address.port}`, { agent: false }, (incomingResponse) => {
        let body = '';
        incomingResponse.on('data', (chunk) => {
          body += chunk;
        });
        incomingResponse.on('end', () => {
          return resolve(body);
        });
        incomingResponse.on('error', reject);
      }).on('error', reject);
    });
    try {
      await received.promise;
      const stop = createShutdown(server);
      const completion = stop();
      assert.equal(stop(), completion);
      assert.deepEqual(events, []);
      releaseHttp.resolve();
      assert.equal(await response, 'saved');
      await workerStarted.promise;
      assert.deepEqual(events, ['activity']);
      releaseWorker.resolve();
      await completion;
      assert.deepEqual(events, ['activity', 'pool:0', 'redis']);
    } finally {
      releaseHttp.resolve();
      releaseWorker.resolve();
      server.closeAllConnections();
      server.close();
    }
  },
);
