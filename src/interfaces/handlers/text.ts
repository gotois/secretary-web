import { TYPING, parseMode, sendPrepareAction } from '../../libs/tg-messages.ts';
import { assistantGateway } from '../../app/container.ts';
import { generateInlineKeyboard, getAssistantReply } from '../../helpers/assistant-response.ts';

export default async (_activity, message, bot) => {
  await sendPrepareAction(bot, message.chat.id, TYPING);

  let secretaryData;
  try {
    if (!message.user.accessToken) {
      throw new Error('Пользователь не авторизован');
    }
    secretaryData = await assistantGateway.processText({
      text: message.text,
      chatId: message.chat.id,
      tenantId: message.from.id,
      userId: message.user.actorId ?? undefined,
      language: message.user.language,
      accessToken: message.user.accessToken,
      location: message.user.location,
      timezone: message.user.timezone,
    });
  } catch (error) {
    if (error?.code === 401) {
      await bot.sendMessage(message.chat.id, 'Пройдите авторизацию заново /start');
      return;
    }
    throw error;
  }
  const { content, artifact } = secretaryData;
  const reply = getAssistantReply(content);
  if (!reply) {
    throw new Error('Ассистент не вернул ответ');
  }

  await bot.sendMessage(message.chat.id, reply, {
    parse_mode: parseMode('text/plain'),
    reply_to_message_id: message.message_id,
    protect_content: true,
    disable_notification: true,
    reply_markup: {
      remove_keyboard: true,
      inline_keyboard: generateInlineKeyboard(artifact),
      force_reply: true,
    },
  });
};
