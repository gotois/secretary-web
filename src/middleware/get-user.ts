import { container, userRepository } from '../app/container.ts';
import {
  SolidAuthorizationRequiredError,
  type ActiveSolidAuthorization,
} from '../infrastructure/solid/solid-session-manager.ts';
import { SERVER } from '#env';
import type { Request, Response, NextFunction } from 'express';
import { getTmaUserId } from './tma-auth.ts';

export { getTmaUserId } from './tma-auth.ts';

/**
 * @description Проверяет TMA авторизацию и добавляет пользователя в request
 * @param {Request} request - Express request
 * @param {Response} response - Express response
 * @param {NextFunction} next - следующий middleware
 * @returns HTTP response или переход к следующему middleware
 */
export default async function (request: Request, response: Response, next: NextFunction): Promise<Response | void> {
  const sessionTelegramId = request.session.telegram_id;
  const sessionAuthorizationId = request.session.authorization_id;
  const [scheme, initData] = (request.get('Authorization') ?? '').split(' ', 2);
  const isTmaRequest = scheme?.toUpperCase() === 'TMA';
  const authSource: 'bff' | 'tma' = isTmaRequest ? 'tma' : 'bff';
  let active: ActiveSolidAuthorization | undefined;
  let telegramId: number | undefined;

  if (isTmaRequest) {
    if (!initData) {
      return response.status(401).send('Unauthorized');
    }
    telegramId = getTmaUserId(initData);
    if (!telegramId) {
      return response.status(401).send('Invalid TMA data');
    }
    try {
      active = await container.solidSessions.getByTelegramId(telegramId);
    } catch (error) {
      if (!(error instanceof SolidAuthorizationRequiredError)) {
        return next(error);
      }
    }
  } else {
    telegramId = typeof sessionTelegramId === 'number' ? sessionTelegramId : undefined;
    if (typeof sessionAuthorizationId === 'string') {
      try {
        active = await container.solidSessions.getById(sessionAuthorizationId);
      } catch (error) {
        if (!(error instanceof SolidAuthorizationRequiredError)) {
          return next(error);
        }
      }
    }
  }

  if (!active) {
    if (authSource === 'bff') {
      return response.status(401).json({
        error: 'authentication_required',
        loginUrl: `${SERVER.HOST}/login`,
      });
    }
    return response.status(404).send('User not found');
  }

  const authorization = active.authorization;
  telegramId ??= authorization.telegramId;
  const user = telegramId === undefined ? undefined : userRepository.findById(telegramId);
  if (authSource === 'bff' || request.session.authorization_id !== authorization.id) {
    request.session.authorization_id = authorization.id;
    request.session.telegram_id = telegramId;
    request.session.token_type = authorization.tokenType;
  }
  request.solidSession = active.session;
  request.user = {
    // TODO Remarks: External Solid identities need an actor-first principal before legacy Telegram endpoints can use them.
    // Until that identity contract exists, zero remains a compatibility sentinel and must not be treated as a Telegram id.
    id: telegramId ?? 0,
    actor_id: authorization.webId,
    location: user?.location ?? null,
    language: user?.language ?? 'en',
    timezone: user?.timezone ?? null,
    access_token: authorization.accessToken,
    id_token: authorization.idToken ?? null,
    refresh_token: user?.refreshToken ?? null,
    token_type: authorization.tokenType,
    created_at: user?.createdAt ?? Math.floor(Date.now() / 1000),
    expired_at: authorization.expiresAt ?? null,
    auth_source: authSource,
  };

  next();
}
