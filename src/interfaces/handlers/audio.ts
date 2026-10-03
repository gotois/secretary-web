import { assistantGateway } from '../../app/container.ts';
import { sendPrepareMessage } from '../../libs/tg-messages.ts';

export default async function audioAction(activity, message, bot): Promise<void> {
  await sendPrepareMessage(activity, message, bot);
  const url = message.audio?.file?.url;
  if (typeof url !== 'string') {
    throw new TypeError('Telegram не вернул ссылку на аудиофайл');
  }
  const result = await assistantGateway.process({ url, mediaType: message.audio.mime_type });
  await bot.sendMessage(message.chat.id, result.content, {
    reply_to_message_id: message.message_id,
    protect_content: true,
  });
}
