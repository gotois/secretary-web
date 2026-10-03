import { DatabaseSync } from 'node:sqlite';
import test from 'ava';

import { canManageGroupTargets, normalizeTargets } from '../../src/controllers/event/targets.ts';
import { ProcessVoiceMessage } from '../../src/domain/usecases/process-voice-message.ts';
import { ProcessDocument } from '../../src/domain/usecases/process-document.ts';
import { SqliteTelegramEventRepository } from '../../src/infrastructure/database/sqlite-telegram-event-repository.ts';
import { VoskTranscriptionGateway } from '../../src/infrastructure/secretary/vosk-transcription-gateway.ts';
import { generateTelegramHash } from '../../src/libs/tg-crypto.ts';
import { parseBotCallback } from '../../src/helpers/approval.ts';
import { normalizeBotCommand } from '../../src/helpers/bot-command.ts';
import { parseWebAppData } from '../../src/helpers/web-app-data.ts';
import { getTmaUserId } from '../../src/middleware/tma-auth.ts';
import { getActivity } from '../../src/helpers/activity.ts';
import { generateInlineKeyboard, getAssistantReply } from '../../src/helpers/assistant-response.ts';
import { parseMode } from '../../src/libs/tg-messages.ts';

const telegramToken = 'test-telegram-token';

function signedInitData(authDate: number): string {
  const parameters = {
    auth_date: String(authDate),
    query_id: 'query-1',
    user: JSON.stringify({ id: 42 }),
  };
  return new URLSearchParams({
    ...parameters,
    hash: generateTelegramHash(parameters, telegramToken),
  }).toString();
}

test('TMA rejects expired and future signed initData', (t) => {
  const now = 2_000_000_000;
  t.assert(getTmaUserId(signedInitData(now), { nowSeconds: now, token: telegramToken }) === 42);
  t.assert(getTmaUserId(signedInitData(now - 301), { nowSeconds: now, token: telegramToken }) === undefined);
  t.assert(getTmaUserId(signedInitData(now + 1), { nowSeconds: now, token: telegramToken }) === undefined);
});

test('event targets accept absent, scalar and array values and reject malformed groups', (t) => {
  t.deepEqual(normalizeTargets(undefined), []);
  t.deepEqual(normalizeTargets({ type: 'Group', id: -100, name: 'Team' }), [{ type: 'Group', id: -100, name: 'Team' }]);
  t.deepEqual(normalizeTargets([null, { type: 'Person', id: 42 }]), [null, { type: 'Person', id: 42 }]);
  t.assert(normalizeTargets({ type: 'Group', id: 'wrong' }) === undefined);
});

test('group authorization rejects a non-admin before controller side effects', async (t) => {
  const checked: number[] = [];
  const allowed = await canManageGroupTargets(
    [{ type: 'Group', id: -100 }],
    42,
    {
      getChatMember(chatId) {
        checked.push(chatId);
        return Promise.resolve({ status: 'member' });
      },
    },
    new Set(['creator', 'administrator']),
  );
  t.assert(!allowed);
  t.deepEqual(checked, [-100]);
});

test('callback parser keeps existing dynamic payloads without regular expressions', (t) => {
  t.deepEqual(parseBotCallback('meeting_rsvp:42:accept'), { kind: 'meeting-rsvp', taskId: 42, type: 'accept' });
  t.deepEqual(parseBotCallback('reject:42'), { kind: 'approval', taskId: 42, type: 'reject' });
  t.assert(parseBotCallback('meeting_rsvp:wrong:accept') === undefined);
  t.assert(parseBotCallback('accept:42:extra') === undefined);
});

test('command parser matches exact commands and the configured bot suffix', (t) => {
  t.assert(normalizeBotCommand('/help', 'secretary_bot') === '/help');
  t.assert(normalizeBotCommand('/help@secretary_bot', 'secretary_bot') === '/help');
  t.assert(normalizeBotCommand('/help@another_bot', 'secretary_bot') === '/help@another_bot');
  t.assert(normalizeBotCommand('/exitAnything', 'secretary_bot') === '/exitAnything');
});

test('assistant response helpers reject malformed data', (t) => {
  t.assert(getAssistantReply([{ text: '' }, { text: 'Ответ' }]) === 'Ответ');
  t.assert(getAssistantReply({ text: 'Ответ' }) === undefined);
  t.deepEqual(generateInlineKeyboard([{ '@type': 'CreateAction', 'id': 'not a URL' }]), []);
  const keyboard = generateInlineKeyboard([{ '@type': 'CreateAction', 'id': 'https://example.com/tasks/42' }]);
  t.assert(keyboard.length === 1 && keyboard[0].length === 1);
});

test('Telegram parse modes use MarkdownV1 for text/plain', (t) => {
  t.assert(parseMode('text/plain') === 'Markdown');
  t.assert(parseMode('text/markdown') === 'MarkdownV2');
  t.assert(parseMode('text/html') === 'HTML');
  t.assert(parseMode('text/xhtml') === 'HTML');
});

test('web app data and ActivityPub credentials are validated as complete inputs', (t) => {
  t.deepEqual(parseWebAppData('[{"type":"tz","data":"Europe/Moscow"},{"type":"future"}]'), [
    { type: 'tz', data: 'Europe/Moscow' },
    { type: 'future' },
  ]);
  t.throws(
    () => {
      return parseWebAppData('[{"type":"future"},{"type":"location","data":null}]');
    },
    {
      message: 'Некорректная геопозиция в web_app_data',
    },
  );
  t.assert(getActivity({ credentialSubject: { type: 'Create', to: [] } }) === undefined);
  t.assert(
    getActivity({ credentialSubject: { type: 'Offer', to: ['actor'], target: { type: 'Group' } } }) === undefined,
  );
});

test('telegram event repository keeps all task destinations and resolves a message', (t) => {
  const repository = new SqliteTelegramEventRepository(new DatabaseSync(':memory:'));
  repository.saveTelegramEvent({ chatId: -1, messageId: 10, taskId: 7, name: 'One', type: 'Group' });
  repository.saveTelegramEvent({ chatId: -2, messageId: 20, taskId: 7, name: 'Two', type: 'Group' });

  t.deepEqual(
    repository.getTelegramEventsByTaskId(7).map((event) => {
      return event.chatId;
    }),
    [-1, -2],
  );
  t.assert(repository.getTelegramEvent(-2, 20)?.taskId === 7);
});

test('voice use case sends transcription to the assistant with current authorization', async (t) => {
  let assistantInput;
  const useCase = new ProcessVoiceMessage(
    {
      transcribe: () => {
        return Promise.resolve('Создай задачу');
      },
    },
    {
      processText: (input) => {
        assistantInput = input;
        return Promise.resolve({ content: [{ text: 'Готово' }] });
      },
    },
  );
  const result = await useCase.execute({
    url: 'https://api.telegram.org/file',
    duration: 5,
    mediaType: 'audio/ogg',
    chatId: 10,
    tenantId: 42,
    userId: 'https://example.com/actors/42',
    language: 'ru',
    accessToken: 'fresh-token',
  });

  t.assert(assistantInput.text === 'Создай задачу');
  t.deepEqual(result, { content: [{ text: 'Готово' }] });
});

test('voice gateway rejects unknown duration, MIME and an expired deadline', async (t) => {
  const timeoutFetch = ((_input, init) => {
    return new Promise((_resolve, reject) => {
      const keepAlive = setTimeout(() => {
        reject(new Error('deadline did not abort the request'));
      }, 100);
      init?.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(keepAlive);
          reject(init.signal?.reason);
        },
        { once: true },
      );
    });
  }) as typeof fetch;
  const gateway = new VoskTranscriptionGateway('https://vosk.example/recognize', 10, timeoutFetch);

  await t.throwsAsync(
    gateway.transcribe({ url: 'https://api.telegram.org/file', duration: Number.NaN, mediaType: 'audio/ogg' }),
    { message: 'Допустимая длительность аудио — до 60 секунд' },
  );
  await t.throwsAsync(
    gateway.transcribe({ url: 'https://api.telegram.org/file', duration: 5, mediaType: 'audio/unknown' }),
    { message: 'Неподдерживаемый тип аудио: audio/unknown' },
  );
  const oversizedFetch = (() => {
    return Promise.resolve(
      new Response(null, {
        headers: {
          'content-length': String(20 * 1024 * 1024 + 1),
          'content-type': 'audio/ogg',
        },
      }),
    );
  }) as typeof fetch;
  const sizeGateway = new VoskTranscriptionGateway('https://vosk.example/recognize', 10, oversizedFetch);
  await t.throwsAsync(
    sizeGateway.transcribe({ url: 'https://api.telegram.org/file', duration: 5, mediaType: 'audio/ogg' }),
    { message: 'Размер аудио выходит за допустимый предел' },
  );
  await t.throwsAsync(
    gateway.transcribe({
      url: 'https://api.telegram.org/file',
      duration: 5,
      mediaType: 'audio/ogg',
      timeoutMs: 1,
    }),
  );
});

test('document use case keeps supported binary MIME and rejects unknown MIME', async (t) => {
  let called = false;
  const useCase = new ProcessDocument({
    process() {
      called = true;
      return Promise.resolve({ content: 'ok', mediaType: 'text/plain' });
    },
  });

  t.throws(
    () => {
      return useCase.execute({ url: 'https://api.telegram.org/file', mediaType: 'application/x-unknown' });
    },
    { message: 'Неподдерживаемый тип документа: application/x-unknown' },
  );
  t.assert(!called);
  for (const mediaType of [
    'application/pdf',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]) {
    await useCase.execute({ url: 'https://api.telegram.org/file', mediaType });
  }
  t.assert(called);
});
