import { TELEGRAM } from '#env';
import checkAuth, { type BotApi, type BotMessage } from '../../middleware/check-auth.ts';
import dbclearAction from './dbclear.ts';
import helpAction from './help.ts';
import pingAction from './ping.ts';
import startAction from './start.ts';
import textAction from './text.ts';
import { normalizeBotCommand } from '../../helpers/bot-command.ts';

type Handler = (activity: unknown, message: BotMessage, bot: BotApi) => Promise<void>;

const authenticatedText = checkAuth(textAction as Handler);
const authenticatedExit = checkAuth(dbclearAction as Handler);

export default async function privateTextAction(activity: unknown, message: BotMessage, bot: BotApi): Promise<void> {
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  const command = normalizeBotCommand(text, TELEGRAM.BOT_NAME);
  switch (command) {
    case '/ping':
    case 'пинг': {
      await pingAction(activity, message, bot);
      return;
    }
    case '/exit':
    case 'выйти': {
      await authenticatedExit(activity, message, bot);
      return;
    }
    case '/start':
    case 'начать': {
      await startAction(activity, message, bot);
      return;
    }
    case '/help':
    case 'man':
    case 'помощь': {
      await helpAction(activity, message, bot);
      return;
    }
    case '/new': {
      // TODO: подключить очистку истории после определения пользовательского ответа и обработки ошибки AssistantGateway.clearConversation.
      console.warn('Команда /new пока не поддерживается');
      return;
    }
    default: {
      await authenticatedText(activity, message, bot);
    }
  }
}
