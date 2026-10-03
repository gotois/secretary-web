import tzlookup from '@photostructure/tz-lookup';
import { container } from '../../app/container.ts';

export default async function locationAction(_activity, message, bot): Promise<void> {
  const latitude = message.location?.latitude;
  const longitude = message.location?.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new TypeError('Telegram не передал координаты');
  }
  const timezone = tzlookup(latitude, longitude);
  container.user.updateUserLocation({
    telegramId: message.chat.id,
    latitude,
    longitude,
    accuracy: message.location.horizontal_accuracy,
  });
  container.user.updateUserTimezone({ telegramId: message.chat.id, timezone });
  await bot.sendMessage(message.chat.id, `Геопозиция сохранена. Часовой пояс: ${timezone}`, {
    reply_to_message_id: message.message_id,
    reply_markup: { remove_keyboard: true },
  });
}
