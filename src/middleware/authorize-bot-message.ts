import type { User } from '../domain/entities/user.ts';
import { AuthorizationRequiredError, type UserAuthorization } from '../infrastructure/auth/user-authorization.ts';

export type BotMessage = {
  chat: { id: number };
  text?: string;
  user?: Partial<User>;
  [key: string]: unknown;
};

export type BotApi = {
  sendMessage(chatId: number, text: string): Promise<unknown>;
};

export async function authorizeBotMessage(
  message: BotMessage,
  bot: BotApi,
  authorizationService: Pick<UserAuthorization, 'ensureById'>,
): Promise<boolean> {
  const userId = message.user?.id;
  if (!userId) {
    await bot.sendMessage(message.chat.id, 'Сначала авторизуйтесь у бота через /start');
    return false;
  }

  try {
    const authorization = await authorizationService.ensureById(userId);
    message.user = authorization.user;
    return true;
  } catch (error) {
    if (!(error instanceof AuthorizationRequiredError)) {
      console.error('Ошибка обновления токена:', error);
    }
    await bot.sendMessage(message.chat.id, 'Сначала авторизуйтесь у бота через /start');
    return false;
  }
}
