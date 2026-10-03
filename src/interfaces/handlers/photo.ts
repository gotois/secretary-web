import { assistantGateway } from '../../app/container.ts';
import { sendPrepareMessage } from '../../libs/tg-messages.ts';

export default async function photoAction(activity, message, bot): Promise<void> {
  await sendPrepareMessage(activity, message, bot);
  const photo = Array.isArray(message.photo) ? message.photo.at(-1) : undefined;
  const url = photo?.file?.url;
  if (typeof url !== 'string') {
    throw new TypeError('Telegram не вернул ссылку на изображение');
  }
  const result = await assistantGateway.process({ url, mediaType: 'image/jpeg' });
  await bot.sendMessage(message.chat.id, result.content, {
    reply_to_message_id: message.message_id,
    protect_content: true,
  });
}
