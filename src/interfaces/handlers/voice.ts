import { RECORD_AUDIO, parseMode, sendPrepareAction } from '../../libs/tg-messages.ts';
import { container } from '../../app/container.ts';
import { generateInlineKeyboard, getAssistantReply } from '../../helpers/assistant-response.ts';

export default async (_activity, message, bot) => {
  await sendPrepareAction(bot, message.chat.id, RECORD_AUDIO);

  const url = message.voice?.file?.url;
  if (typeof url !== 'string') {
    throw new TypeError('Telegram не вернул ссылку на голосовое сообщение');
  }
  if (!message.user.accessToken) {
    throw new Error('Пользователь не авторизован');
  }
  const secretaryData = await container.processVoiceMessage.execute({
    url,
    duration: message.voice.duration,
    mediaType: message.voice.mime_type,
    chatId: message.chat.id,
    tenantId: message.from.id,
    userId: message.user.actorId ?? undefined,
    language: message.user.language,
    accessToken: message.user.accessToken,
    location: message.user.location,
    timezone: message.user.timezone,
  });
  const { content, artifact } = secretaryData;
  const reply = getAssistantReply(content);
  if (!reply) {
    throw new Error('Ассистент не вернул ответ на голосовое сообщение');
  }

  await bot.sendMessage(message.chat.id, reply, {
    parse_mode: parseMode('text/plain'),
    reply_to_message_id: message.message_id,
    protect_content: true,
    disable_notification: true,
    reply_markup: {
      remove_keyboard: true,
      inline_keyboard: generateInlineKeyboard(artifact),
    },
  });
};
