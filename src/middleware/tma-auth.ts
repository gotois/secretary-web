import { timingSafeEqual } from 'node:crypto';
import { generateTelegramHash } from '../libs/tg-crypto.ts';

/**
 * Проверяет подпись и время жизни Telegram Mini App initData.
 * @param initData - строка инициализации Telegram Mini App
 * @param options - переопределения времени и токена для проверки
 * @param options.nowSeconds - текущее Unix-время для проверки срока действия
 * @param options.token - Telegram bot token для проверки подписи
 * @returns Telegram user id при валидных данных
 */
export function getTmaUserId(
  initData: string,
  options: { nowSeconds?: number; token?: string } = {},
): number | undefined {
  const parameters = Object.fromEntries(new URLSearchParams(initData));
  const hash = parameters.hash;
  const isHexHash =
    hash?.length === 64 &&
    [...hash].every((character) => {
      const normalized = character.toLowerCase();
      return (normalized >= '0' && normalized <= '9') || (normalized >= 'a' && normalized <= 'f');
    });
  if (!isHexHash) {
    return;
  }

  const expectedHash = generateTelegramHash(parameters, options.token);
  if (!timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'))) {
    return;
  }

  const authDate = Number(parameters.auth_date);
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAge = 5 * 60;
  if (!Number.isSafeInteger(authDate) || authDate > now || now - authDate > maxAge) {
    return;
  }

  try {
    const user = JSON.parse(parameters.user ?? 'null');
    return typeof user?.id === 'number' ? user.id : undefined;
  } catch {
    return;
  }
}
