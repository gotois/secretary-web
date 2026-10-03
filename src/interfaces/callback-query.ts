import acceptCallback from './handlers/accept.ts';
import meetingRsvpAction from './handlers/meeting-rsvp.ts';
import rejectCallback from './handlers/reject.ts';
import errorHandler from '../middleware/error-handler.ts';
import { parseBotCallback } from '../helpers/approval.ts';
import { container } from '../app/container.ts';
import { AuthorizationRequiredError } from '../infrastructure/auth/user-authorization.ts';
import type { User } from '../domain/entities/user.ts';

type CallbackQuery = {
  id: string;
  data?: string;
  from: { id: number };
  message?: { chat: { id: number }; message_id: number; text?: string };
  inline_message_id?: string;
};

type CallbackBot = {
  on(event: 'callback_query', listener: (query: CallbackQuery) => Promise<void>): void;
  answerCallbackQuery(id: string, options: { text: string; show_alert: boolean }): Promise<unknown>;
};

export function registerCallbackQueryHandlers(bot: CallbackBot): void {
  bot.on('callback_query', async (query) => {
    const data = query.data;
    if (!data || !query.message) {
      return;
    }
    const callback = parseBotCallback(data);
    if (!callback) {
      return;
    }
    let user: User;
    try {
      const authorization = await container.authorization.ensureById(query.from.id);
      if (!authorization.user.accessToken) {
        throw new AuthorizationRequiredError();
      }
      user = authorization.user;
    } catch (error) {
      if (!(error instanceof AuthorizationRequiredError)) {
        console.error(error);
      }
      await bot.answerCallbackQuery(query.id, {
        text: 'Сначала авторизуйтесь у бота через /start',
        show_alert: true,
      });
      return;
    }
    let handler = meetingRsvpAction;
    if (callback.kind === 'approval') {
      handler = callback.type === 'accept' ? acceptCallback : rejectCallback;
    }
    const message = {
      ...query.message,
      id: query.id,
      data,
      from: query.from,
      inline_message_id: query.inline_message_id,
      user,
    };
    await errorHandler(handler)(undefined, message, bot);
  });
}
