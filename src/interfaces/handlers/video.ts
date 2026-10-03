import { assistantGateway } from '../../app/container.ts';
import { sendPrepareMessage } from '../../libs/tg-messages.ts';

export default async function videoAction(activity, message, bot): Promise<void> {
  console.log('video, activity', message);
  await sendPrepareMessage(activity, message, bot);
  const video = message.video ?? message.video_note;
  const url = video?.file?.url;
  if (typeof url !== 'string') {
    throw new TypeError('Telegram не вернул ссылку на видео');
  }
  const result = await assistantGateway.process({ url, mediaType: video.mime_type ?? 'video/mp4' });
  await bot.sendMessage(message.chat.id, result.content, {
    reply_to_message_id: message.message_id,
    protect_content: true,
  });
}
