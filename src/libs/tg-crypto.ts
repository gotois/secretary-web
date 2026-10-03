import crypto from 'node:crypto';
import { TELEGRAM } from '#env';

export const generateTelegramHash = (
  data: Record<string, string>,
  token: string | undefined = TELEGRAM.TOKEN,
): string => {
  if (!token) {
    throw new Error('TELEGRAM_TOKEN is required');
  }
  const checkString = Object.keys(data)
    .filter((key) => {
      return key !== 'hash';
    })
    .map((key) => {
      return `${key}=${data[key]}`;
    })
    .toSorted()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  return crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
};
