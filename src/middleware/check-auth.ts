import errorHandler from './error-handler.ts';
import { container } from '../app/container.ts';
import type { UserAuthorization } from '../infrastructure/auth/user-authorization.ts';
import { authorizeBotMessage, type BotApi, type BotMessage } from './authorize-bot-message.ts';

export type { BotApi, BotMessage } from './authorize-bot-message.ts';

type Handler = (activity: unknown, message: BotMessage, bot: BotApi) => Promise<void>;

/**
 * Middleware проверки авторизации пользователя с автообновлением токена
 * @param {Function} callback - обработчик действия бота
 * @param authorizationService - сервис обновления пользовательской авторизации
 * @returns {Function} Обёрнутый обработчик с проверкой токена
 */
export default function (
  callback: Handler,
  authorizationService: Pick<UserAuthorization, 'ensureById'> = container.authorization,
): Handler {
  return async (activity, message, bot) => {
    if (!(await authorizeBotMessage(message, bot, authorizationService))) {
      return;
    }
    await errorHandler(callback)(activity, message, bot);
  };
}
