import fs from 'node:fs';
import https from 'node:https';
import express, { type Express, type RequestHandler } from 'express';
import session from 'express-session';
import cors from 'cors';
import { SESSION, SERVER, IS_DEV } from '#env';
import botController from '../interfaces/bot.ts';
import vcLdJsonParser from '../middleware/vc-ld-json-parser.ts';
import verifyCredential from '../middleware/verify-credentials.ts';
import getUserMiddleware from '../middleware/get-user.ts';
import pingController from '#controllers/ping/get';
import calendarSubscriptionController from '#controllers/tasks/subscription/get';
import groupEventGetController from '#controllers/event/get';
import eventQueryController from '#controllers/event/query';
import groupEventPostController from '#controllers/event/post';
import groupEventUpdateController from '#controllers/event/put';
import groupEventRemoveController from '#controllers/event/delete';
import groupsController from '#controllers/groups/get';
import calendarGooglePostController from '#controllers/calendar-google/post';
import tokenController from '#controllers/token/get';
import loginController from '#controllers/login/get';
import loginControllerPost from '#controllers/login/post';
import sessionGetController from '#controllers/session/get';
import sessionDeleteController from '#controllers/session/delete';
import {
  deletePodContracts,
  getPodContract,
  getPodContracts,
  getPodProfile,
  initializePod,
  updatePodCalendar,
  updatePodProfile,
} from '#controllers/pod/index';
import webhookController from '#controllers/webhook/post';
import { sessionStore } from './container.ts';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Создаёт Express-приложение Telegram сервера
 * @returns Express-приложение
 */
export function createServer(): Express {
  const app = express();
  app.set('trust proxy', true);
  const allowedOrigins = new Set([new URL(SERVER.APP_URL).origin]);
  if (IS_DEV) {
    allowedOrigins.add('https://localhost:8080');
  }

  app.use(
    cors({
      origin(url: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) {
        if (!url) {
          return callback(undefined, true);
        }
        const parsedUrl = URL.parse(url);
        callback(undefined, Boolean(parsedUrl && allowedOrigins.has(parsedUrl.origin)));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'DPoP', 'Content-Type', 'Geolocation', 'Timezone'],
    }),
  );
  app.use(
    session({
      store: sessionStore,
      secret: SESSION.secret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        maxAge: SESSION_TTL_MS,
        sameSite: 'lax',
        secure: true,
      },
    }),
  );
  app.use(botController as unknown as RequestHandler);
  app.get('/', pingController);
  app.get('/event/query', getUserMiddleware, eventQueryController);
  app.get('/event/:taskId', getUserMiddleware, groupEventGetController);
  app.post('/event', express.json(), getUserMiddleware, groupEventPostController);
  app.put('/event', express.json(), getUserMiddleware, groupEventUpdateController);
  app.delete('/event', express.json(), getUserMiddleware, groupEventRemoveController);
  app.get('/groups', getUserMiddleware, groupsController);
  app.post('/calendar/google', express.json(), getUserMiddleware, calendarGooglePostController);
  app.get('/calendar/subscription', getUserMiddleware, calendarSubscriptionController);
  app.get('/login', loginController);
  app.post('/login', express.json(), express.urlencoded({ extended: false }), loginControllerPost);
  app.get('/session', sessionGetController);
  app.delete('/session', sessionDeleteController);
  app.get('/token', tokenController);
  app.post('/pod', getUserMiddleware, initializePod);
  app.get('/pod/profile', getUserMiddleware, getPodProfile);
  app.put('/pod/profile', express.json(), getUserMiddleware, updatePodProfile);
  app.get('/pod/contracts', getUserMiddleware, getPodContracts);
  app.get('/pod/contracts/:name', getUserMiddleware, getPodContract);
  app.delete('/pod/contracts', getUserMiddleware, deletePodContracts);
  app.put('/pod/calendar', express.json(), getUserMiddleware, updatePodCalendar);
  app.post('/webhook', vcLdJsonParser, verifyCredential, webhookController);
  return app;
}

/**
 * @description Запускает Telegram сервер
 * @param root - параметры запуска сервера
 * @param root.port - порт для прослушивания
 * @param root.local - использовать локальный HTTPS-сервер
 */
export function startServer({ port, local }: { port: number; local: boolean }): void {
  const app = createServer();
  if (local) {
    const keyPath = 'certs/server/bot-key.pem';
    const certPath = 'certs/server/bot-cert.pem';
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath))
      throw new Error(`Missing TLS files: ${keyPath} or ${certPath}`);
    https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app).listen(port, () => {
      console.log(
        `🔒 Telegram Server listening on: ${new URL(SERVER.HOST).protocol}//${new URL(SERVER.HOST).hostname}:${port}`,
      );
    });
    return;
  }
  app.listen(port, () => {
    console.log(`🚀 Telegram Server is listening http://localhost:${port}`);
  });
}
