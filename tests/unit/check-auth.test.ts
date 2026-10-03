import test from 'ava';
import { authorizeBotMessage } from '../../src/middleware/authorize-bot-message.ts';

test('checkAuth rejects missing user and replaces stale user after refresh', async (t) => {
  const sent: string[] = [];
  const bot = {
    sendMessage(_chatId: number, text: string) {
      sent.push(text);
      return Promise.resolve();
    },
  };
  const refreshedUser = {
    id: 42,
    actorId: 'https://example.com/actors/42',
    location: null,
    language: 'ru',
    timezone: 'Europe/Moscow',
    accessToken: 'fresh-token',
    idToken: 'id-token',
    refreshToken: 'refresh-token',
    createdAt: 1,
    expiredAt: 2,
  };
  const authorization = {
    ensureById: () => {
      return Promise.resolve({ user: refreshedUser, tokenType: 'Bearer' });
    },
  };
  const missingUserMessage = { chat: { id: 42 } };
  t.assert(!(await authorizeBotMessage(missingUserMessage, bot, authorization)));
  t.deepEqual(sent, ['Сначала авторизуйтесь у бота через /start']);

  const message = { chat: { id: 42 }, user: { id: 42, accessToken: 'stale-token' } };
  t.assert(await authorizeBotMessage(message, bot, authorization));
  const handledUser = message.user;
  t.deepEqual(message.user, refreshedUser);
  t.deepEqual(handledUser, refreshedUser);
});
