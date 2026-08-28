import { randomUUID } from 'node:crypto';
import {
  EVENTS,
  Session,
  getSessionFromStorage,
  refreshSession,
  type SessionTokenSet,
} from '@inrupt/solid-client-authn-node';

import { OIDC, SECRETARY } from '#env';
import type { UserRepository } from '../../domain/repositories/user-repository.ts';
import {
  type OidcClientRegistration,
  type SolidAuthorization,
  SqliteSolidAuthRepository,
} from '../database/sqlite-solid-auth-repository.ts';

const LOGIN_TRANSACTION_TTL_SECONDS = 10 * 60;
const SESSION_REFRESH_RETRY_DELAYS_MS = [250, 500, 1000, 2000];

export class SolidAuthorizationRequiredError extends Error {
  constructor() {
    super('Solid authorization required');
    this.name = 'SolidAuthorizationRequiredError';
  }
}

export interface ActiveSolidAuthorization {
  authorization: SolidAuthorization;
  session: Session;
}

type StartAuthorizationInput = {
  issuer: string;
  bffSessionId: string;
  isTma: boolean;
  initData?: string;
  telegramId?: number;
};

type CompleteAuthorizationResult = ActiveSolidAuthorization & {
  isTma: boolean;
  telegramId?: number;
  timezone: string;
};

type ProviderMetadata = {
  registration_endpoint?: string;
  pushed_authorization_request_endpoint?: string;
};

function normalizeIssuer(value: string): string {
  const issuer = new URL(value);
  if (issuer.protocol !== 'https:' && !(issuer.protocol === 'http:' && issuer.hostname === 'localhost')) {
    throw new TypeError('Solid OIDC issuer must use HTTPS');
  }
  issuer.hash = '';
  issuer.search = '';
  return issuer.toString().replace(/\/$/, '');
}

function metadataUrl(issuer: string): URL {
  const url = new URL(issuer);
  const issuerPath = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
  url.pathname = `/.well-known/openid-configuration${issuerPath}`;
  url.search = '';
  url.hash = '';
  return url;
}

/**
 * Проверяет терминальную OAuth-ошибку, после которой refresh token больше нельзя использовать.
 * @param error - Ошибка обновления Solid-сессии
 * @returns `true` для OAuth `invalid_grant`
 */
function isInvalidGrant(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'error' in error && error.error === 'invalid_grant';
}

/**
 * Повторяет OIDC-операцию только после временных серверных ошибок.
 * @param operation - OIDC-операция
 * @param retryDelays - Задержки перед повторными попытками
 * @returns Результат OIDC-операции
 */
export async function retryTransientOidcOperation<T>(
  operation: () => Promise<T>,
  retryDelays: readonly number[] = SESSION_REFRESH_RETRY_DELAYS_MS,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      const response =
        typeof error === 'object' && error !== null && 'response' in error && typeof error.response === 'object'
          ? error.response
          : undefined;
      const statusCode =
        response !== null && response !== undefined && 'statusCode' in response ? response.statusCode : undefined;
      const retryDelay = retryDelays[attempt];
      if (typeof statusCode !== 'number' || statusCode < 500 || retryDelay === undefined) {
        throw error;
      }
      attempt += 1;
      await new Promise((resolve) => {
        setTimeout(resolve, retryDelay);
      });
    }
  }
}

export class SolidSessionManager {
  readonly #repository: SqliteSolidAuthRepository;
  readonly #users: UserRepository;
  readonly #sessions = new Map<string, Session>();
  readonly #sessionLoads = new Map<string, Promise<ActiveSolidAuthorization>>();
  readonly #listenedSessions = new WeakSet<Session>();

  constructor(repository: SqliteSolidAuthRepository, users: UserRepository) {
    this.#repository = repository;
    this.#users = users;
  }

  async startAuthorization(input: StartAuthorizationInput): Promise<string> {
    const issuer = normalizeIssuer(input.issuer);
    const client = await this.#getClient(issuer);
    const solidSessionId = randomUUID();
    const solidSession = new Session({ storage: this.#repository, keepAlive: false }, solidSessionId);
    let authorizationUrl: string | undefined;

    solidSession.events.on(EVENTS.AUTHORIZATION_REQUEST, (authorizationRequest) => {
      this.#repository.saveTransaction({
        state: authorizationRequest.state,
        solidSessionId,
        bffSessionId: input.bffSessionId,
        issuer,
        isTma: input.isTma,
        telegramId: input.telegramId,
        expiresAt: Math.floor(Date.now() / 1000) + LOGIN_TRANSACTION_TTL_SECONDS,
      });
    });
    this.#listenForTokens(solidSessionId, solidSession);

    await solidSession.login({
      oidcIssuer: issuer,
      redirectUrl: OIDC.CLIENT_REDIRECT,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      clientName: 'Secretary',
      tokenType: 'Bearer',
      customScopes: ['profile'],
      handleRedirect(url) {
        authorizationUrl = url;
      },
    });

    if (!authorizationUrl) {
      throw new Error('Solid OIDC provider did not return an authorization URL');
    }
    if (input.isTma && input.initData && issuer === normalizeIssuer(SECRETARY.HOST)) {
      authorizationUrl = await this.#pushTmaAuthorizationRequest(authorizationUrl, input.initData, client);
    }
    return authorizationUrl;
  }

  async completeAuthorization(callbackUrl: URL, bffSessionId: string): Promise<CompleteAuthorizationResult> {
    const state = callbackUrl.searchParams.get('state');
    if (!state) {
      throw new TypeError('OAuth callback state is missing');
    }
    const transaction = this.#repository.findTransaction(state);
    if (!transaction) {
      throw new TypeError('OAuth transaction is missing or expired');
    }
    // Telegram may reopen the OAuth callback outside the Mini App cookie context.
    // Only TMA transactions bound to a verified Telegram user may cross that boundary;
    // browser transactions must remain bound to the BFF session that started them.
    const isVerifiedTmaTransaction = transaction.isTma && transaction.telegramId !== undefined;
    if (!isVerifiedTmaTransaction && transaction.bffSessionId !== bffSessionId) {
      throw new TypeError('OAuth transaction does not belong to this BFF session');
    }
    this.#repository.consumeTransaction(state);

    const solidSession = new Session({ storage: this.#repository, keepAlive: false }, transaction.solidSessionId);
    let issuedTokens: SessionTokenSet | undefined;
    solidSession.events.on(EVENTS.NEW_TOKENS, (tokens) => {
      issuedTokens = tokens;
    });
    this.#listenForTokens(transaction.solidSessionId, solidSession);

    const info = await solidSession.handleIncomingRedirect(callbackUrl.toString());
    if (!info?.isLoggedIn || !info.webId || !issuedTokens?.accessToken) {
      throw new Error('Solid OIDC callback did not create an authenticated session');
    }

    const identity = await this.#loadSecretaryIdentity(transaction.issuer, solidSession);
    const telegramId = transaction.telegramId ?? identity.telegramId;
    const authorization = this.#repository.saveAuthorization({
      id: transaction.solidSessionId,
      issuer: transaction.issuer,
      webId: info.webId,
      telegramId,
      tokens: issuedTokens,
      tokenType: 'Bearer',
    });
    this.#sessions.set(transaction.solidSessionId, solidSession);
    this.#updateLegacyUser(authorization, issuedTokens, identity.timezone);

    return {
      authorization,
      session: solidSession,
      isTma: transaction.isTma,
      telegramId,
      timezone: identity.timezone,
    };
  }

  getById(id: string): Promise<ActiveSolidAuthorization> {
    const authorization = this.#repository.findAuthorizationById(id);
    if (!authorization) {
      return Promise.reject(new SolidAuthorizationRequiredError());
    }
    return this.#loadSession(authorization);
  }

  getByTelegramId(telegramId: number): Promise<ActiveSolidAuthorization> {
    const authorization = this.#repository.findAuthorizationByTelegramId(telegramId, normalizeIssuer(SECRETARY.HOST));
    if (!authorization) {
      return Promise.reject(new SolidAuthorizationRequiredError());
    }
    return this.#loadSession(authorization);
  }

  #loadSession(authorization: SolidAuthorization): Promise<ActiveSolidAuthorization> {
    const cached = this.#sessions.get(authorization.id);
    if (
      cached?.info.isLoggedIn &&
      authorization.expiresAt !== undefined &&
      authorization.expiresAt > Math.floor(Date.now() / 1000) + 60
    ) {
      return Promise.resolve({ authorization, session: cached });
    }

    const activeLoad = this.#sessionLoads.get(authorization.id);
    if (activeLoad) {
      return activeLoad;
    }
    const load = this.#restoreSession(authorization).finally(() => {
      this.#sessionLoads.delete(authorization.id);
    });
    this.#sessionLoads.set(authorization.id, load);
    return load;
  }

  async #restoreSession(authorization: SolidAuthorization): Promise<ActiveSolidAuthorization> {
    const solidSession =
      this.#sessions.get(authorization.id) ??
      (await getSessionFromStorage(authorization.id, {
        storage: this.#repository,
        refreshSession: false,
      }));
    if (!solidSession) {
      throw new SolidAuthorizationRequiredError();
    }
    this.#listenForTokens(authorization.id, solidSession);
    try {
      await retryTransientOidcOperation(() => {
        return refreshSession(solidSession, { storage: this.#repository });
      });
    } catch (error) {
      if (!isInvalidGrant(error)) {
        throw error;
      }
      await solidSession.logout({ logoutType: 'app' });
      this.#sessions.delete(authorization.id);
      throw new SolidAuthorizationRequiredError();
    }
    if (!solidSession.info.isLoggedIn) {
      throw new SolidAuthorizationRequiredError();
    }
    this.#sessions.set(authorization.id, solidSession);
    return {
      authorization: this.#repository.findAuthorizationById(authorization.id) ?? authorization,
      session: solidSession,
    };
  }

  #listenForTokens(id: string, solidSession: Session): void {
    if (this.#listenedSessions.has(solidSession)) {
      return;
    }
    this.#listenedSessions.add(solidSession);
    solidSession.events.on(EVENTS.NEW_TOKENS, (tokens) => {
      this.#repository.updateAuthorizationTokens(id, tokens);
      const authorization = this.#repository.findAuthorizationById(id);
      if (authorization) {
        this.#updateLegacyUser(authorization, tokens);
      }
    });
  }

  async #getClient(issuer: string): Promise<OidcClientRegistration> {
    if (issuer === normalizeIssuer(SECRETARY.HOST)) {
      if (!OIDC.CLIENT_ID || !OIDC.CLIENT_SECRET) {
        throw new TypeError('Secretary OIDC client is not configured');
      }
      return {
        issuer,
        clientId: OIDC.CLIENT_ID,
        clientSecret: OIDC.CLIENT_SECRET,
      };
    }
    const stored = this.#repository.findClient(issuer);
    if (stored) {
      return stored;
    }
    const metadata = await this.#getMetadata(issuer);
    if (!metadata.registration_endpoint) {
      throw new TypeError('Solid OIDC provider does not support dynamic client registration');
    }
    const response = await fetch(metadata.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Secretary',
        redirect_uris: [OIDC.CLIENT_REDIRECT],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_basic',
      }),
    });
    if (!response.ok) {
      throw new Error(`Solid OIDC dynamic client registration failed: ${response.status}`);
    }
    const registration = (await response.json()) as { client_id?: unknown; client_secret?: unknown };
    if (typeof registration.client_id !== 'string') {
      throw new TypeError('Solid OIDC dynamic registration response has no client_id');
    }
    const client: OidcClientRegistration = {
      issuer,
      clientId: registration.client_id,
      clientSecret: typeof registration.client_secret === 'string' ? registration.client_secret : undefined,
    };
    this.#repository.saveClient(client);
    return client;
  }

  async #getMetadata(issuer: string): Promise<ProviderMetadata> {
    const response = await fetch(metadataUrl(issuer), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Solid OIDC discovery failed: ${response.status}`);
    }
    return (await response.json()) as ProviderMetadata;
  }

  async #pushTmaAuthorizationRequest(
    authorizationUrl: string,
    initData: string,
    client: OidcClientRegistration,
  ): Promise<string> {
    if (!client.clientSecret) {
      throw new TypeError('TMA PAR requires a confidential Secretary client');
    }
    const url = new URL(authorizationUrl);
    const metadata = await this.#getMetadata(normalizeIssuer(SECRETARY.HOST));
    if (!metadata.pushed_authorization_request_endpoint) {
      throw new TypeError('Secretary OIDC provider does not support PAR');
    }
    const parameters = new URLSearchParams(url.searchParams);
    parameters.set('tma_init_data', initData);
    const response = await fetch(metadata.pushed_authorization_request_endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: parameters,
    });
    if (!response.ok) {
      throw new Error(`Secretary PAR failed: ${response.status}`);
    }
    const pushed = (await response.json()) as { request_uri?: unknown };
    if (typeof pushed.request_uri !== 'string') {
      throw new TypeError('Secretary PAR response has no request_uri');
    }
    const pushedUrl = new URL(url.pathname, url.origin);
    pushedUrl.searchParams.set('client_id', client.clientId);
    pushedUrl.searchParams.set('request_uri', pushed.request_uri);
    return pushedUrl.toString();
  }

  async #loadSecretaryIdentity(
    issuer: string,
    solidSession: Session,
  ): Promise<{ telegramId?: number; timezone: string }> {
    if (issuer !== normalizeIssuer(SECRETARY.HOST)) {
      return { timezone: 'UTC' };
    }
    const response = await solidSession.fetch(`${issuer}/me`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return { timezone: 'UTC' };
    }
    const profile = (await response.json()) as { tid?: unknown; tz?: unknown };
    const telegramId =
      typeof profile.tid === 'string' || typeof profile.tid === 'number' ? Number(profile.tid) : undefined;
    return {
      telegramId: Number.isSafeInteger(telegramId) ? telegramId : undefined,
      timezone: typeof profile.tz === 'string' ? profile.tz : 'UTC',
    };
  }

  #updateLegacyUser(authorization: SolidAuthorization, tokens: SessionTokenSet, timezone?: string): void {
    const existingUser =
      authorization.telegramId === undefined ? undefined : this.#users.findById(authorization.telegramId);
    const idToken = tokens.idToken ?? authorization.idToken ?? existingUser?.idToken;
    const refreshToken = tokens.refreshToken ?? existingUser?.refreshToken;
    if (
      authorization.telegramId === undefined ||
      !tokens.accessToken ||
      !idToken ||
      !refreshToken ||
      !tokens.expiresAt
    ) {
      return;
    }
    this.#users.create(authorization.telegramId);
    this.#users.saveTokens(authorization.telegramId, authorization.webId, {
      accessToken: tokens.accessToken,
      idToken,
      refreshToken,
      expiresAt: tokens.expiresAt,
    });
    if (timezone !== undefined) {
      this.#users.updateTimezone(authorization.telegramId, timezone);
    }
  }
}
