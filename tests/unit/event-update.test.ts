import test from 'ava';
import type { NextFunction, Request, Response } from 'express';
import type { SecretaryGateway } from '../../src/infrastructure/secretary/secretary-gateway.ts';
import TelegramBot from 'node-telegram-bot-api';
import { encodeTaskUid } from '../../src/helpers/task-uid.ts';

let putEvent: typeof import('../../src/controllers/event/put.ts').default;
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
    ({ default: putEvent } = await import('../../src/controllers/event/put.ts'));
  } finally {
    TelegramBot.prototype.startPolling = originalStartPolling;
  }
});

async function updateEvent(identifier: Record<string, unknown>, remindBefore?: number) {
  type RpcInput = Parameters<SecretaryGateway['call']>[0];
  const calls: RpcInput[] = [];
  const originalCall = secretaryGateway.call;
  secretaryGateway.call = ((input: RpcInput) => {
    calls.push(input);
    return Promise.resolve({ jsonrpc: '2.0', id: input.method, result: {} });
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
    body: {
      ...identifier,
      name: 'Calendar event',
      start_date: new Date(Date.now() + 86_400_000).toISOString(),
      target: [],
      remind_before: remindBefore,
    },
    user: { id: 0, access_token: 'test-token' },
    get: () => {
      return undefined;
    },
  } as unknown as Request;
  try {
    await putEvent(request, response, ((error: unknown) => {
      nextError = error;
    }) as NextFunction);
  } finally {
    secretaryGateway.call = originalCall;
  }
  return { status, body, calls, nextError };
}

for (const [label, identifier] of [
  ['calendar UID', { uid_task: encodeTaskUid(42) }],
  ['numeric task ID', { id_task: 42 }],
  ['matching UID and task ID', { uid_task: encodeTaskUid(42), id_task: 42 }],
] as const) {
  test.serial(`event update accepts ${label} and sends a numeric ID to core`, async (t) => {
    const result = await updateEvent(identifier, 15);
    t.deepEqual(
      { status: result.status, body: result.body, error: result.nextError },
      { status: 200, body: 'OK', error: undefined },
    );
    t.deepEqual(
      result.calls.map((call) => {
        return { method: call.method, id: call.params.id_task };
      }),
      [
        { method: 'edit', id: 42 },
        { method: 'remind-once', id: 42 },
      ],
    );
    t.assert(
      result.calls.every((call) => {
        return !('uid_task' in call.params) && call.accessToken === 'test-token';
      }),
    );
  });
}

for (const [label, identifier] of [
  ['missing identifier', {}],
  ['invalid UID', { uid_task: 'unknown' }],
  ['foreign UUID', { uid_task: '4ab25c3d-00cf-4c0a-8c72-4b59f2dd2007' }],
  ['conflicting identifiers', { uid_task: encodeTaskUid(42), id_task: 43 }],
  ['invalid UID alongside a numeric ID', { uid_task: 'unknown', id_task: 42 }],
  ['null numeric ID', { id_task: null }],
] as const) {
  test.serial(`event update rejects ${label} before RPC side effects`, async (t) => {
    const result = await updateEvent(identifier);
    t.deepEqual(
      { status: result.status, calls: result.calls, error: result.nextError },
      { status: 400, calls: [], error: undefined },
    );
  });
}
