import test from 'ava';
import type { NextFunction, Request, Response } from 'express';
import type { SecretaryGateway } from '../../src/infrastructure/secretary/secretary-gateway.ts';
import TelegramBot from 'node-telegram-bot-api';

let postEvent: typeof import('../../src/controllers/event/post.ts').default;
let secretaryGateway: SecretaryGateway;

test.before(async () => {
  process.env.NODE_ENV = 'development';
  process.env.YC_API_KEY = 'test-key';
  process.env.YC_IAM_TOKEN = 'test-folder';
  const { DATABASE } = await import('../../src/app/config.ts');
  DATABASE.USERS = ':memory:';
  DATABASE.SESSIONS = ':memory:';
  DATABASE.GROUPS = ':memory:';
  DATABASE.EVENTS = ':memory:';
  ({ secretaryGateway } = await import('../../src/app/container.ts'));
  const originalStartPolling = TelegramBot.prototype.startPolling;
  TelegramBot.prototype.startPolling = () => {
    return Promise.resolve();
  };
  try {
    ({ default: postEvent } = await import('../../src/controllers/event/post.ts'));
  } finally {
    TelegramBot.prototype.startPolling = originalStartPolling;
  }
});

async function createEvent(target: unknown, actorId?: string) {
  type RpcInput = Parameters<SecretaryGateway['call']>[0];
  const calls: RpcInput[] = [];
  const originalCall = secretaryGateway.call;
  secretaryGateway.call = ((input: RpcInput) => {
    calls.push(input);
    return Promise.resolve({
      jsonrpc: '2.0',
      id: input.method,
      result: input.method === 'create' ? { id_task: 42, start_date: '2026-10-04T10:00:00Z' } : {},
    });
  }) as SecretaryGateway['call'];
  let status = 200;
  let body: unknown;
  let nextError: unknown;
  const response = {
    status(code: number) {
      status = code;
      return this;
    },
    send(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;
  const request = {
    body: { name: 'PWA event', start_date: '2026-10-04T10:00:00Z', target },
    user: { id: 0, actor_id: actorId, access_token: 'test-token', auth_source: 'bff' },
    get: (name: string) => {
      return name === 'Timezone' ? 'Europe/Moscow' : undefined;
    },
  } as unknown as Request;
  try {
    await postEvent(request, response, ((error: unknown) => {
      nextError = error;
    }) as NextFunction);
  } finally {
    secretaryGateway.call = originalCall;
  }
  return { status, body, calls, nextError };
}

const actorId = 'https://example.com/actors/owner';
for (const [label, target] of [
  ['PWA self selection', [null]],
  ['empty selection', []],
  ['absent selection', undefined],
  ['duplicate self selection', [null, null]],
] as const) {
  test.serial(`event creation resolves ${label} to the authenticated actor`, async (t) => {
    const result = await createEvent(target, actorId);
    t.deepEqual(
      { status: result.status, body: result.body, error: result.nextError },
      {
        status: 200,
        body: 'OK',
        error: undefined,
      },
    );
    t.deepEqual(
      result.calls.map((call) => {
        return call.method;
      }),
      ['create', 'share'],
    );
    t.deepEqual(result.calls[1].params, { id_task: 42, acct: actorId });
    t.assert(
      result.calls.every((call) => {
        return call.accessToken === 'test-token';
      }),
    );
  });
}

test.serial('event creation rejects self selection without an actor before RPC side effects', async (t) => {
  const result = await createEvent([null]);
  t.deepEqual(
    { status: result.status, body: result.body, calls: result.calls },
    {
      status: 403,
      body: 'Unknown acct',
      calls: [],
    },
  );
});

test.serial('PWA identity without a Telegram id cannot create a group event', async (t) => {
  const result = await createEvent([null, { type: 'Group', id: -100, name: 'Team' }], actorId);
  t.assert(result.status === 403);
  t.deepEqual(result.calls, []);
});
