import type { Request, Response } from 'express';
import { bot } from '../../interfaces/bot.ts';
import { userRepository } from '../../app/container.ts';
import { getTaskIdFromReference } from '../../helpers/approval.ts';
import { linkPayload } from '../../libs/tg-messages.ts';
import { SECRETARY } from '#env';

export default async (request: Request, response: Response): Promise<Response> => {
  const activity = request.body?.credentialSubject;
  // TODO: валидировать ActivityPub payload и экранировать поля перед HTML/MarkdownV2.
  // Сейчас код предполагает форму `actor`, `to`, `summaryMap` и может упасть или разметить
  // пользовательский текст как Telegram-разметку.
  if (!activity) {
    return response.status(400).send('Validation Body Failed');
  }

  switch (activity.type) {
    case 'Create': {
      const taskId = getTaskIdFromReference(activity.object);
      const keyboardEdit = {
        text: 'Изменить',
        web_app: {
          url: linkPayload({ to: `/calendar/${taskId}/edit` }),
        },
      };
      for (const to of activity.to) {
        const user = userRepository.findByActorId(to);
        if (!user) {
          console.warn(`User from ${to} not found!`);
          continue;
        }

        // todo - данные нужно брать из тела activity.object.summaryMap.ru
        await bot.sendMessage(user.id, `<a href="${activity.target}">Задача</a> создана`, {
          parse_mode: 'HTML',
          reply_markup: {
            /* eslint-disable prettier/prettier */
            inline_keyboard: [
              [keyboardEdit],
            ],
            /* eslint-enable */
          },
        });
      }
      break;
    }
    case 'Accept': {
      const actor = userRepository.findByActorId(activity.actor);
      for (const to of activity.to) {
        const user = userRepository.findByActorId(to);
        if (!user) {
          continue;
        }
        await bot.sendMessage(user.id, `<a href="tg://user?id=${actor.id}">Пользователь</a> принял ваше предложение`, {
          parse_mode: 'HTML',
        });
      }
      break;
    }
    case 'Reject': {
      const actor = userRepository.findByActorId(activity.actor);
      for (const to of activity.to) {
        const user = userRepository.findByActorId(to);
        if (!user) {
          continue;
        }
        await bot.sendMessage(
          user.id,
          `<a href="tg://user?id=${actor.id}">Пользователь</a> отклонил ваше предложение`,
          {
            parse_mode: 'HTML',
          },
        );
      }
      break;
    }
    case 'Announce': {
      if (new URL(activity.object).origin !== new URL(SECRETARY.HOST).origin) {
        throw new Error(`Пока поддерживается только анонс внутри сети "${SECRETARY.HOST}"`);
      }

      /*
      const keyboardLater = {
        text: 'Напомнить позже',
        callback_data: 'notify_calendar--later',
      };
      const keyboardLater60 = {
        text: 'Напомнить через 1 час',
        callback_data: 'notify_calendar--60',
      };
      const keyboardLaterTomorrow = {
        text: 'Напомнить завтра',
        callback_data: 'notify_calendar--next-day',
      };
      */
      for (const to of activity.to) {
        const user = userRepository.findByActorId(to);
        if (!user) {
          console.warn(`User from ${to} not found!`);
          continue;
        }
        const taskId = getTaskIdFromReference(activity.object);
        const keyboardOpen = {
          text: 'Посмотреть',
          web_app: {
            url: linkPayload({ to: `/calendar/${taskId}/view` }),
          },
        };

        await bot.sendMessage(user.id, activity.summaryMap.ru, {
          protect_content: true,
          parse_mode: 'Markdown',
          reply_markup: {
            /* eslint-disable prettier/prettier */
            inline_keyboard: [
              [keyboardOpen],
              // todo починить возможность напоминания на позже
              // [keyboardLater, keyboardLater60],
              // [keyboardLaterTomorrow],
            ],
            /* eslint-enable */
          },
        });
      }
      break;
    }
    case 'Offer': {
      const taskId = getTaskIdFromReference(activity.object);
      const keyboardOpen = {
        text: 'Посмотреть',
        web_app: {
          url: linkPayload({ to: `/calendar/${taskId}/view` }),
        },
      };
      const keyboardReject = {
        text: 'Отменить',
        callback_data: `reject:${taskId}`,
      };
      const keyboardAccept = {
        text: 'Принять',
        callback_data: `accept:${taskId}`,
      };
      for (const to of activity.to) {
        if (activity.target?.type === 'Group' && activity.target.id === to) {
          continue;
        }
        const user = userRepository.findByActorId(to);
        if (!user) {
          console.warn(`User from ${to} not found!`);
          continue;
        }
        await bot.sendMessage(user.id, activity.summaryMap.ru, {
          protect_content: true,
          parse_mode: 'MarkdownV2',
          reply_markup: {
            /* eslint-disable prettier/prettier */
            inline_keyboard: [
              [keyboardOpen],
              [keyboardReject, keyboardAccept],
            ],
            /* eslint-enable */
          },
        });
      }
      break;
    }
    case 'Add':
    case 'Invite':
    case 'Update':
    case 'Remove':
    case 'Delete':
    case 'Read':
    case 'Note':
    case 'Follow':
    case 'Like':
    case 'Dislike':
    case 'Arrive':
    case 'Leave': {
      break;
    }
    default: {
      return response.status(422).send(`Validation Type ${activity.type} Failed`);
    }
  }

  return response.status(202).send('Accepted');
};
