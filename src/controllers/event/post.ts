import type { NextFunction, Request, Response } from 'express';
import { secretaryGateway, telegramEventRepository } from '../../app/container.ts';
import { bot } from '../../interfaces/bot.ts';
import { formatTelegramGroupMeeting, getTelegramGroupMeetingReplyMarkup } from '../../helpers/telegram-markup.ts';
import { GROUP_ADMIN_STATUSES } from '../../helpers/telegram-user-statuses.ts';
import { canManageGroupTargets, getGroupTargets, normalizeTargets } from './targets.ts';

interface CreatedEvent {
  id_task: number;
  name?: string;
  start_date: string;
  end_date?: string;
  location?: string;
  description?: string;
}

function parseCreatedEvent(value: unknown): CreatedEvent | undefined {
  if (!value || typeof value !== 'object') {
    return;
  }
  const event = value as Partial<CreatedEvent>;
  if (!Number.isSafeInteger(event.id_task) || typeof event.start_date !== 'string') {
    return;
  }
  return event as CreatedEvent;
}

/**
 * Формирует URL Telegram группы по id чата
 * @param id - id Telegram чата
 * @returns URL Telegram группы
 */
function getTgGroupId(id: number) {
  return `https://t.me/c/${Math.abs(id)}`;
}

export default async (request: Request, response: Response, next: NextFunction): Promise<Response> => {
  try {
    const { remind_before: remindBefore, target, ...event } = request.body;
    if (
      remindBefore !== undefined &&
      remindBefore !== null &&
      (typeof remindBefore !== 'number' || !Number.isFinite(remindBefore) || remindBefore < 0)
    ) {
      return response.status(400).send('Invalid remind_before');
    }
    const targets = normalizeTargets(target);
    if (!targets) {
      return response.status(400).send('Invalid event target');
    }
    const groupTargets = getGroupTargets(targets);
    const telegramUserId = request.user?.id;
    if (
      groupTargets.length > 0 &&
      (!Number.isSafeInteger(telegramUserId) ||
        telegramUserId === 0 ||
        !(await canManageGroupTargets(targets, telegramUserId, bot, GROUP_ADMIN_STATUSES)))
    ) {
      return response.status(403).send('Настраивать встречу могут только админы группы.');
    }
    const actorId = request.user?.actor_id;
    const needsActor =
      targets.length === 0 ||
      targets.some((item) => {
        return item?.type === 'Person';
      });
    if (needsActor && typeof actorId !== 'string') {
      return response.status(403).send('Unknown acct');
    }
    const accounts = [
      ...new Set(
        targets.length === 0
          ? [actorId]
          : targets.flatMap((item) => {
              if (item?.type === 'Group') {
                return [getTgGroupId(item.id)];
              }
              return item?.type === 'Person' && actorId ? [actorId] : [];
            }),
      ),
    ];

    if (
      accounts.length === 0 ||
      accounts.some((account) => {
        return typeof account !== 'string';
      })
    ) {
      return response.status(403).send('Unknown acct');
    }
    const tz = request.get('Timezone');

    const rpcResponse = await secretaryGateway.call({
      method: 'create',
      params: event,
      accessToken: request.user?.access_token,
      geolocation: request.get('Geolocation'),
      timezone: tz,
    });

    if (rpcResponse.error) {
      return response.status(400).send('Created event id is missing');
    }
    const createdEvent = parseCreatedEvent(rpcResponse.result as unknown);
    if (!createdEvent) {
      return response.status(400).send('Created event is invalid');
    }

    for (const acct of accounts) {
      const shareResponse = await secretaryGateway.call({
        method: 'share',
        params: { id_task: createdEvent.id_task, acct },
        accessToken: request.user?.access_token,
        geolocation: request.get('Geolocation'),
        timezone: tz,
      });
      if (shareResponse.error) {
        return response.status(400).send('Unable to share event with Telegram group');
      }
    }

    if (typeof remindBefore === 'number' && Number.isFinite(remindBefore) && remindBefore >= 0) {
      const reminderDate = new Date(event.start_date);
      if (Number.isNaN(reminderDate.getTime())) {
        return response.status(400).send('Дата начала события указана неверно');
      }
      const remindResponse = await secretaryGateway.call({
        method: 'remind-once',
        params: {
          id_task: createdEvent.id_task,
          name: event.name,
          description: event.description,
          year: reminderDate.getFullYear(),
          month: (reminderDate.getMonth() + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12,
          day_of_month: reminderDate.getDate(),
          hour: reminderDate.getHours(),
          minute: reminderDate.getMinutes(),
          remind_before: remindBefore * 60,
        },
        accessToken: request.user?.access_token,
        geolocation: request.get('Geolocation'),
        timezone: tz,
      });
      if (remindResponse.error) {
        return response.status(400).send('Unable to set event reminder');
      }
    }

    for (const target of groupTargets) {
      if (target.id) {
        const message = await bot.sendMessage(target.id, formatTelegramGroupMeeting(createdEvent, tz));

        telegramEventRepository.saveTelegramEvent({
          chatId: target.id,
          messageId: message.message_id,
          taskId: createdEvent.id_task,
          name: String(target.name ?? ''),
          type: String(target.type ?? ''),
        });

        await bot.editMessageReplyMarkup(
          getTelegramGroupMeetingReplyMarkup({
            chatId: String(target.id),
            messageId: String(message.message_id),
            taskId: createdEvent.id_task,
          }),
          {
            chat_id: target.id,
            message_id: message.message_id,
          },
        );
      }
    }

    return response.send('OK');
  } catch (error) {
    next(error);
  }
};
