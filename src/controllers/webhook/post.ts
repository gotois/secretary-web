import type { Request, Response } from 'express';
import { bot } from '../../interfaces/bot.ts';
import { userRepository } from '../../app/container.ts';
import { getTaskIdFromReference } from '../../helpers/approval.ts';
import { linkPayload } from '../../libs/tg-messages.ts';
import { SECRETARY } from '#env';
import { getActivity } from '../../helpers/activity.ts';

export default async (request: Request, response: Response): Promise<Response> => {
  const activity = getActivity(request.body);
  if (!activity) {
    return response.status(400).send('Validation Body Failed');
  }

  switch (activity.type) {
    case 'Create': {
      if (!activity.object) {
        return response.status(400).send('Validation Object Failed');
      }
      const taskId = getTaskIdFromReference(activity.object);
      if (!Number.isSafeInteger(taskId) || taskId <= 0) {
        return response.status(400).send('Validation Task Failed');
      }
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
        await bot.sendMessage(user.id, 'Задача создана', {
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
      if (!activity.actor) {
        return response.status(400).send('Validation Actor Failed');
      }
      const actor = userRepository.findByActorId(activity.actor);
      if (!actor) {
        return response.status(400).send('Unknown Actor');
      }
      for (const to of activity.to) {
        const user = userRepository.findByActorId(to);
        if (!user) {
          continue;
        }
        await bot.sendMessage(user.id, `Пользователь ${actor.id} принял ваше предложение`);
      }
      break;
    }
    case 'Reject': {
      if (!activity.actor) {
        return response.status(400).send('Validation Actor Failed');
      }
      const actor = userRepository.findByActorId(activity.actor);
      if (!actor) {
        return response.status(400).send('Unknown Actor');
      }
      for (const to of activity.to) {
        const user = userRepository.findByActorId(to);
        if (!user) {
          continue;
        }
        await bot.sendMessage(user.id, `Пользователь ${actor.id} отклонил ваше предложение`);
      }
      break;
    }
    case 'Announce': {
      if (!activity.object || !activity.summaryMap?.ru) {
        return response.status(400).send('Validation Announce Failed');
      }
      let objectUrl: URL;
      try {
        objectUrl = new URL(activity.object);
      } catch {
        return response.status(400).send('Validation Object Failed');
      }
      if (objectUrl.origin !== new URL(SECRETARY.HOST).origin) {
        throw new Error(`Пока поддерживается только анонс внутри сети "${SECRETARY.HOST}"`);
      }
      const taskId = getTaskIdFromReference(activity.object);
      if (!Number.isSafeInteger(taskId) || taskId <= 0) {
        return response.status(400).send('Validation Task Failed');
      }

      // TODO: вернуть кнопки напоминаний после появления постоянного планировщика с taskId и timezone пользователя.
      for (const to of activity.to) {
        const user = userRepository.findByActorId(to);
        if (!user) {
          console.warn(`User from ${to} not found!`);
          continue;
        }
        const keyboardOpen = {
          text: 'Посмотреть',
          web_app: {
            url: linkPayload({ to: `/calendar/${taskId}/view` }),
          },
        };

        await bot.sendMessage(user.id, activity.summaryMap.ru, {
          protect_content: true,
          reply_markup: {
            /* eslint-disable prettier/prettier */
            inline_keyboard: [
              [keyboardOpen],
            ],
            /* eslint-enable */
          },
        });
      }
      break;
    }
    case 'Offer': {
      if (!activity.object || !activity.summaryMap?.ru) {
        return response.status(400).send('Validation Offer Failed');
      }
      const taskId = getTaskIdFromReference(activity.object);
      if (!Number.isSafeInteger(taskId) || taskId <= 0) {
        return response.status(400).send('Validation Task Failed');
      }
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
