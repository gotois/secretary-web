import type { NextFunction, Request, Response } from 'express';
import { secretaryGateway, telegramEventRepository } from '../../app/container.ts';
import { bot } from '../../interfaces/bot.ts';
import { formatTelegramGroupMeeting, getTelegramGroupMeetingReplyMarkup } from '../../helpers/telegram-markup.ts';
import { GROUP_ADMIN_STATUSES } from '../../helpers/telegram-user-statuses.ts';
import { canManageGroupTargets, getGroupTargets, normalizeTargets } from './targets.ts';
import { decodeTaskUid, isTaskId } from '../../helpers/task-uid.ts';

export default async (request: Request, response: Response, next: NextFunction): Promise<Response> => {
  try {
    const { remind_before: remindBefore, target, messageId, uid_task: taskUid, ...event } = request.body;
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
    const taskId = taskUid === undefined ? event.id_task : decodeTaskUid(taskUid);
    if (!isTaskId(taskId) || (taskUid !== undefined && event.id_task !== undefined && event.id_task !== taskId)) {
      return response.status(400).send('Updated event id is missing');
    }
    event.id_task = taskId;
    const startDate = new Date(event.start_date);
    if (Number.isNaN(startDate.getTime())) {
      return response.status(400).send('Дата начала события указана неверно');
    }
    if (startDate.getTime() <= Date.now()) {
      return response.status(400).send('Нельзя обновить событие: время начала уже прошло');
    }
    const tz = request.get('Timezone');
    const storedGroupTargets = telegramEventRepository
      .getTelegramEventsByTaskId(event.id_task)
      .filter((telegramEvent) => {
        return telegramEvent.type === 'Group';
      })
      .map((telegramEvent) => {
        return {
          type: 'Group' as const,
          id: telegramEvent.chatId,
          messageId: telegramEvent.messageId,
          name: telegramEvent.name,
        };
      });
    const groupTargets = [
      ...new Map(
        [...getGroupTargets(targets), ...storedGroupTargets].map((groupTarget) => {
          return [`${groupTarget.id}:${groupTarget.messageId ?? ''}`, groupTarget];
        }),
      ).values(),
    ];
    const groupsToAuthorize = [
      ...new Map(
        groupTargets.map((groupTarget) => {
          return [groupTarget.id, groupTarget];
        }),
      ).values(),
    ];
    const telegramUserId = request.user?.id;
    if (
      groupsToAuthorize.length > 0 &&
      (!Number.isSafeInteger(telegramUserId) ||
        telegramUserId === 0 ||
        !(await canManageGroupTargets(groupsToAuthorize, telegramUserId, bot, GROUP_ADMIN_STATUSES)))
    ) {
      return response.status(403).send('Настраивать встречу могут только админы группы.');
    }

    const rpcResponse = await secretaryGateway.call({
      method: 'edit',
      params: event,
      accessToken: request.user?.access_token,
      geolocation: request.get('Geolocation'),
      timezone: tz,
    });
    if (rpcResponse.error) {
      return response.status(400).send('Server error occurred');
    }
    if (typeof remindBefore === 'number' || remindBefore === null) {
      const reminderDate = remindBefore === null ? new Date(0) : startDate;
      const remindResponse = await secretaryGateway.call({
        method: 'remind-once',
        params: {
          id_task: event.id_task,
          name: event.name,
          description: event.description,
          year: reminderDate.getFullYear(),
          month: (reminderDate.getMonth() + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12,
          day_of_month: reminderDate.getDate(),
          hour: reminderDate.getHours(),
          minute: reminderDate.getMinutes(),
          remind_before: remindBefore === null ? 0 : remindBefore * 60,
        },
        accessToken: request.user?.access_token,
        geolocation: request.get('Geolocation'),
        timezone: tz,
      });
      if (remindResponse.error) {
        return response.status(400).send('Unable to set event reminder');
      }
    }

    for (const t of groupTargets) {
      if (t.messageId) {
        try {
          await bot.editMessageText(formatTelegramGroupMeeting(event, tz), {
            chat_id: t.id,
            message_id: t.messageId,
            reply_markup: getTelegramGroupMeetingReplyMarkup({
              chatId: String(t.id),
              messageId: String(t.messageId),
              taskId: event.id_task,
            }),
          });
        } catch (error) {
          const isMessageNotModified =
            error instanceof Error &&
            'code' in error &&
            error.code === 'ETELEGRAM' &&
            error.message.includes('message is not modified');

          if (!isMessageNotModified) {
            throw error;
          }
        }
      }
    }

    return response.send('OK');
  } catch (error) {
    next(error);
  }
};
