import botController, {
  type EventHandler,
  type ExtendedMessage,
  type ForwardMessagesHandler,
} from 'telegram-bot-api-express';
import channelPostAction from './handlers/channel-post.ts';
import documentAction from './handlers/document.ts';
import voiceAction from './handlers/voice.ts';
import audioAction from './handlers/audio.ts';
import locationAction from './handlers/location.ts';
import photoAction from './handlers/photo.ts';
import videoAction from './handlers/video.ts';
import groupChatCreatedAction from './handlers/group-chat-created.ts';
import chatMembers from './handlers/new-chat-members.ts';
import migrateFromChat from './handlers/migrate-from-chat.ts';
import leftChatMember from './handlers/left-chat-members.ts';
import channelChatCreated from './handlers/channel-chat-created.ts';
import supergroupChatCreated from './handlers/supergroup-chat-created.ts';
import stickerAction from './handlers/sticker.ts';
import animationAction from './handlers/animation.ts';
import inlineAction from './handlers/inline.ts';
import privateTextAction from './handlers/private-text.ts';
import forwards from './handlers/text-forwards.ts';
import checkAuth, { type BotApi, type BotMessage } from '../middleware/check-auth.ts';
import { authorizeBotMessage } from '../middleware/authorize-bot-message.ts';
import errorHandler from '../middleware/error-handler.ts';
import replyToMessageAction from './handlers/reply-to-message.ts';
import webAppDataAction from './handlers/web-app-data.ts';
import { TELEGRAM } from '#env';
import { container, userRepository } from '../app/container.ts';
import { registerCallbackQueryHandlers } from './callback-query.ts';
import type { User } from '../domain/entities/user.ts';

const asEventHandler = (handler: unknown): EventHandler => {
  return handler as EventHandler;
};

function attachUser(message: ExtendedMessage & { user?: User }): User | undefined {
  const telegramId = message.chat.id;
  const user =
    userRepository.findById(telegramId) ??
    container.user.ensureUser({
      telegramId,
      language: message.from?.language_code,
    });
  message.user = user;
  return user;
}

const withUser = (handler: EventHandler): EventHandler => {
  return async (activity, eventMessage, eventBot) => {
    attachUser(eventMessage as ExtendedMessage & { user?: User });
    await handler(activity, eventMessage, eventBot);
  };
};

const authenticatedForwards: ForwardMessagesHandler = async (activities, messages) => {
  const firstMessage = messages[0] as (ExtendedMessage & { user?: Partial<User> }) | undefined;
  if (!firstMessage) {
    return;
  }
  attachUser(firstMessage as ExtendedMessage & { user?: User });
  if (!(await authorizeBotMessage(firstMessage as BotMessage, bot as unknown as BotApi, container.authorization))) {
    return;
  }
  for (const message of messages as Array<ExtendedMessage & { user?: Partial<User> }>) {
    message.user = firstMessage.user;
  }
  await forwards(activities, messages, bot);
};

const { middleware, bot } = botController({
  token: TELEGRAM.TOKEN,
  // domain: TELEGRAM.DOMAIN,

  // Персональные команды
  privateEvents: {
    /* MY COMMANDS */

    ['bot_command']: withUser(asEventHandler(errorHandler(privateTextAction))),

    /* NATIVE COMMANDS */

    ['location']: withUser(asEventHandler(checkAuth(locationAction))),
    ['sticker']: withUser(asEventHandler(checkAuth(stickerAction))),
    ['animation']: withUser(asEventHandler(checkAuth(animationAction))),
    // ['poll']: checkAuth(pollAction),
    // ['mention']: checkAuth(mentionAction),
    // ['edited_message_text']: checkAuth(editedMessageTextAction),
    ['text']: withUser(asEventHandler(errorHandler(privateTextAction))),
    ['photo']: withUser(asEventHandler(checkAuth(photoAction))),
    ['voice']: withUser(asEventHandler(checkAuth(voiceAction))),
    ['audio']: withUser(asEventHandler(checkAuth(audioAction))),
    ['video']: withUser(asEventHandler(checkAuth(videoAction))),
    ['video_note']: withUser(asEventHandler(checkAuth(videoAction))),
    ['document']: withUser(asEventHandler(checkAuth(documentAction))),
    // ['contact']: checkAuth(contactAction),
    ['inline_query']: inlineAction,
    ['message_forwards']: authenticatedForwards,
    ['reply_to_message']: withUser(asEventHandler(checkAuth(replyToMessageAction))),
    // TODO: подключить pinned_message после определения полезного действия для закреплённого сообщения.

    /* CALLBACK */
    ['web_app_data']: withUser(asEventHandler(errorHandler(webAppDataAction))),

    // TODO: вернуть notify_calendar callbacks после появления постоянного планировщика с taskId и timezone пользователя.
    // ['notify_calendar--later']: checkAuth(notifyDice),
    // ['notify_calendar--60']: checkAuth(notifyNextHour),
    // ['notify_calendar--next-day']: checkAuth(notifyNextDay),

    // ['business_message']: () => {
    //   console.log('business_message');
    // },
    // ['edited_business_message']: () => {
    //   console.log('edited_business_message');
    // },
    // ['deleted_business_messages']: () => {
    //   console.log('deleted_business_messages');
    // },
  },
  // Групповые команды
  publicEvents: {
    ['bot_command']: () => {
      // ignore any commands
    },

    /* TEXT */

    ['channel_post']: channelPostAction,
    ['inline_query']: inlineAction,
    // TODO: подключить mention после определения прав доступа и формата прямого вызова ассистента в группе.
    // TODO: подключить group text после определения условий ответа бота и изоляции истории группового чата.
    // TODO: подключить reply_to_message в группе после определения маршрутизации ответа и прав участников.

    /* GROUP COMMANDS */

    ['supergroup_chat_created']: supergroupChatCreated,
    ['channel_chat_created']: channelChatCreated,
    ['group_chat_created']: groupChatCreatedAction,
    ['new_chat_members']: chatMembers,
    ['migrate_from_chat_id']: migrateFromChat,
    ['left_chat_member']: leftChatMember,

    ['video_chat_started']: () => {
      console.log('video_chat_started');
    },
    ['video_chat_ended']: () => {
      console.log('video_chat_ended');
    },
  },

  onError(bot, error) {
    console.error(error);
  },
});

registerCallbackQueryHandlers(bot);

export { bot };
export default middleware;
