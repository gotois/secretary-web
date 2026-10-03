import { DatabaseSync } from 'node:sqlite';
import { LangChainYandexGPT } from 'langchain-yandexgpt';
import { ChatOpenAI } from '@langchain/openai';
import { DATABASE, SECRETARY, AGENT, LLM, VOSK } from '#env';
import { SecretaryUser } from '../domain/usecases/ensure-user.ts';
import { SecretaryGroup } from '../domain/usecases/register-group.ts';
import { SqliteUserRepository } from '../infrastructure/database/sqlite-user-repository.ts';
import { SqliteGroupRepository } from '../infrastructure/database/sqlite-group-repository.ts';
import { SqliteTelegramEventRepository } from '../infrastructure/database/sqlite-telegram-event-repository.ts';
import { SecretaryGateway } from '../infrastructure/secretary/secretary-gateway.ts';
import { GetStartState } from '../domain/usecases/get-start-state.ts';
import { AssistantGateway } from '../infrastructure/secretary/assistant-client.ts';
import { ProcessDocument } from '../domain/usecases/process-document.ts';
import { ProcessVoiceMessage } from '../domain/usecases/process-voice-message.ts';
import { VoskTranscriptionGateway } from '../infrastructure/secretary/vosk-transcription-gateway.ts';

import { SecretaryPostAuthorizationGateway } from '../infrastructure/secretary/post-authorization-gateway.ts';
import { PrepareAuthorizationWelcome } from '../domain/usecases/prepare-authorization-welcome.ts';
import { UserAuthorization } from '../infrastructure/auth/user-authorization.ts';
import { SolidGateway } from '../infrastructure/solid/solid-gateway.ts';
import { SqliteSessionStore } from '../infrastructure/database/sqlite-session-store.ts';
import { SqliteSolidAuthRepository } from '../infrastructure/database/sqlite-solid-auth-repository.ts';
import { SolidSessionManager } from '../infrastructure/solid/solid-session-manager.ts';

const model = createModel();

function createModel() {
  if (AGENT.MODEL.startsWith('yandex')) {
    return new LangChainYandexGPT({
      temperature: 0,
      apiKey: AGENT.YC_API_KEY,
      folderID: AGENT.YC_IAM_TOKEN,
      model: AGENT.MODEL,
    });
  }
  return new ChatOpenAI({
    configuration: {
      baseURL: LLM.URL,
    },
    openAIApiKey: 'shit',
    model: LLM.MODEL,
  });
}

export const userRepository = new SqliteUserRepository(new DatabaseSync(DATABASE.USERS));
export const groupRepository = new SqliteGroupRepository(new DatabaseSync(DATABASE.GROUPS));
export const telegramEventRepository = new SqliteTelegramEventRepository(new DatabaseSync(DATABASE.EVENTS));
const sessionDatabase = new DatabaseSync(DATABASE.SESSIONS);
export const sessionStore = new SqliteSessionStore(sessionDatabase);
export const solidAuthRepository = new SqliteSolidAuthRepository(sessionDatabase);
export const solidSessions = new SolidSessionManager(solidAuthRepository, userRepository);

export const secretaryGateway = new SecretaryGateway(SECRETARY.HOST);
export const userAuthorization = new UserAuthorization(userRepository, solidSessions);
export const solidGateway = new SolidGateway();
export const assistantGateway = new AssistantGateway(SECRETARY.MCP, model, new DatabaseSync(AGENT.MEMORY));
export const transcriptionGateway = new VoskTranscriptionGateway(VOSK.URL, VOSK.TIMEOUT_MS);

export const postAuthorizationGateway = new SecretaryPostAuthorizationGateway(SECRETARY.HOST);

export const container = {
  user: new SecretaryUser(userRepository),
  group: new SecretaryGroup(groupRepository),
  authorization: userAuthorization,
  solidSessions,
  solid: solidGateway,
  processDocument: new ProcessDocument(assistantGateway),
  processVoiceMessage: new ProcessVoiceMessage(transcriptionGateway, assistantGateway),

  // ???
  getStartState: new GetStartState(),
  prepareAuthorizationWelcome: new PrepareAuthorizationWelcome(postAuthorizationGateway),
};
