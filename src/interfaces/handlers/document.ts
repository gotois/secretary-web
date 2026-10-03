import { parseMode, sendPrepareMessage } from '../../libs/tg-messages.ts';
import { container } from '../../app/container.ts';

export default async (activity, message, bot) => {
  await sendPrepareMessage(activity, message, bot);
  const url = message.document?.file?.url;
  if (typeof url !== 'string') {
    throw new TypeError('Telegram не вернул ссылку на документ');
  }
  const result = await container.processDocument.execute({
    url,
    mediaType: message.document.mime_type,
  });
  if (!result.content.trim()) {
    throw new Error('Ассистент не вернул результат обработки документа');
  }

  await bot.sendMessage(message.chat.id, result.content, {
    parse_mode: parseMode(result.mediaType),
    reply_to_message_id: message.message_id,
    protect_content: true,
  });
};
