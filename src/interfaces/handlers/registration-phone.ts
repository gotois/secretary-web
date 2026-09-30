import { generateTelegramHash } from '../../libs/tg-crypto.ts';
import { SECRETARY } from '#env';

/**
 * @deprecated теперь новый FLOW — перенести отработку в интерактив OIDC
 * Ассистент детектирует пользователя
 * @param {unknown} activity - активность ActivityPub
 * @param {object} message - сообщение Telegram
 * @param {object} bot - экземпляр бота
 */
export default async (activity, message, bot) => {
  await bot.deleteMessage(message.chat.id, message.message_id);

  const body: {
    contact: { phoneNumber: unknown; firstName: unknown; lastName: unknown; userId: unknown };
    authDate: number;
    hash: string;
    photo_url?: string;
  } = {
    contact: {
      phoneNumber: message.contact.phone_number,
      firstName: message.contact.first_name,
      lastName: message.contact.last_name,
      userId: message.contact.user_id,
    },
    authDate: message.date * 1000,
    hash: generateTelegramHash({
      auth_date: message.date,
      contact: JSON.stringify(message.contact),
    }),
  };
  try {
    // пробуем добавить в запрос фото профиля
    const profilePhotos = await bot.getUserProfilePhotos(message.chat.id);
    if (profilePhotos.photos.length > 0) {
      body.photo_url = await bot.getFileLink(profilePhotos.photos[0][0].file_id);
    }
  } catch (error) {
    console.warn(error);
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Timezone', message.user.timezone);
  const response = await fetch(SECRETARY.HOST + '/auth/telegram/oauth', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Ошибка регистрации: ${response.statusText}`);
  }
};
