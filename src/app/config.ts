import path from 'node:path';

const environment = process.env;

export const IS_DEV = String(environment.NODE_ENV)?.toLowerCase()?.startsWith('dev');
export const OIDC = {
  CLIENT_ID: environment.CLIENT_ID,
  CLIENT_SECRET: environment.CLIENT_SECRET,
  CLIENT_REDIRECT: `${environment.HOST}/token`,
};
export const SESSION = {
  get secret(): string {
    if (!environment.SESSION_SECRET) {
      throw new Error('SESSION_SECRET is required');
    }
    return environment.SESSION_SECRET;
  },
};
export const DATABASE = {
  USERS: path.join(import.meta.dirname, '../../database/users.sqlite'),
  SESSIONS: path.join(import.meta.dirname, '../../database/sessions.sqlite'),
  GROUPS: path.join(import.meta.dirname, '../../database/groups.sqlite'),
  EVENTS: path.join(import.meta.dirname, '../../database/events.sqlite'),
  AGENT: IS_DEV ? ':memory:' : path.resolve('./database/agent.sqlite'),
};
export const LLM = {
  MODEL: environment.LLM_MODEL ?? 'ai/gemma4:E2B',
  URL: environment.LLM_URL ?? 'http://localhost:12434/engines/v1',
  API_KEY: environment.LLM_API_KEY,
};
export const AGENT = {
  MODEL: environment.AGENT_MODEL ?? 'yandexgpt-lite',
  MEMORY: DATABASE.AGENT,
  YC_API_KEY: environment.YC_API_KEY,
  YC_IAM_TOKEN: environment.YC_IAM_TOKEN,
};
export const SERVER = {
  HOST: environment.HOST,
  APP_URL: environment.APP_URL,
};
export const VOSK = {
  URL: environment.VOSK_RECOGNIZE_URL,
  TIMEOUT_MS: Number(environment.VOSK_TIMEOUT_MS ?? 30_000),
};
export const SECRETARY = {
  MCP: `${environment.SECRETARY_HOST}/mcp`,
  RPC: `${environment.SECRETARY_HOST}/rpc`,
  HOST: environment.SECRETARY_HOST,
};
export const TELEGRAM = {
  TOKEN: environment.TELEGRAM_TOKEN,
  DOMAIN: environment.TELEGRAM_DOMAIN,
  BOT_NAME: environment.TELEGRAM_BOT_NAME,
  BOT_LINK: IS_DEV ? 'https://t.me/secretary_dev_bot/Contracts' : 'https://t.me/gotois_bot/App',
  APP_URL: environment.APP_URL,
};
export const GOOGLE = {
  CALENDAR: {
    CLIENT_ID: environment.GOOGLE_CALENDAR_CLIENT_ID,
    CLIENT_SECRET: environment.GOOGLE_CALENDAR_CLIENT_SECRET,
  },
};
