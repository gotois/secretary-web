import { IS_DEV, SERVER } from '#env';
import { container } from '../../app/container.ts';

const getWelcomeText = (): string => {
  return (
    '**Привет\\! 👋**\n\n' +
    String.raw`Я \- ваш персональный календарный бот, ` +
    String.raw`и я здесь, чтобы помочь вам управлять своим временем и задачами\. ` +
    'Вот что я могу для вас сделать:\\.\n\n' +
    '📅 __Создание и управление событиями__\n\n' +
    '⏰ __Напоминания о важных встречах и делах__\n\n' +
    '🔄 __Синхронизация с другими календарями__\n\n' +
    '📊 __Анализ вашего расписания__\n\n' +
    'Пожалуйста, авторизуйтесь\\.\n\n'
  ).trim();
};

const getInstallAgainText = (): string => {
  return 'Установка не требуется\\.\n\nУзнай больше подробностей командой /help\\.'.trim();
};

/**
 * Начало работы с ботом
 * @param {unknown} activity - активность ActivityPub
 * @param {object} message - сообщение Telegram
 * @param {object} bot - экземпляр бота
 */
export default async (activity, message, bot) => {
  const state = container.getStartState.execute({
    accessToken: message.user?.accessToken,
    expiredAt: message.user?.expiredAt,
    timezone: message.user?.timezone,
  });

  if (state === 'authorized') {
    await bot.sendMessage(message.chat.id, getInstallAgainText(), {
      parse_mode: 'MarkdownV2',
      disable_notification: false,
      reply_to_message_id: message.message_id,
      reply_markup: {
        remove_keyboard: true,
        resize_keyboard: true,
        one_time_keyboard: true,
        keyboard: [],
      },
    });
    return;
  }

  if (state === 'needs-timezone') {
    await bot.sendMessage(message.chat.id, 'Требуется определить часовой пояс', {
      parse_mode: 'MarkdownV2',
      disable_notification: true,
      reply_to_message_id: message.message_id,
      reply_markup: {
        remove_keyboard: true,
        resize_keyboard: true,
        one_time_keyboard: true,
        keyboard: [
          [
            {
              text: '📍Определить автоматически',
              request_location: true,
            },
          ],
        ],
      },
    });
    return;
  }

  let webAppUrl = `${SERVER.HOST}/login?lang=${message.from?.language_code}`;

  if (IS_DEV) {
    webAppUrl += '&debug=1';
  }
  await bot.sendMessage(message.chat.id, getWelcomeText(), {
    parse_mode: 'MarkdownV2',
    disable_notification: true,
    reply_to_message_id: message.message_id,
    reply_markup: {
      remove_keyboard: true,
      resize_keyboard: true,
      one_time_keyboard: true,
      inline_keyboard: [
        [
          {
            text: 'Авторизоваться',
            web_app: {
              url: webAppUrl,
            },
          },
        ],
      ],
    },
  });
};
