import type { NextFunction, Request, Response } from 'express';
import { secretaryGateway, telegramEventRepository } from '../../app/container.ts';
import { bot } from '../../interfaces/bot.ts';
import { formatTelegramGroupMeeting, getTelegramGroupMeetingReplyMarkup } from '../../helpers/telegram-markup.ts';

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
    const targets = Array.isArray(target) ? target : [target];
    const accounts =
      targets.length > 0
        ? [
            ...new Set(
              targets.map((item) => {
                return item?.type === 'Group' ? getTgGroupId(item.id) : request.user.actor_id;
              }),
            ),
          ]
        : [request.user.actor_id];

    if (accounts.length === 0) {
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

    for (const acct of accounts) {
      const shareResponse = await secretaryGateway.call({
        method: 'share',
        params: { id_task: rpcResponse.result?.id_task, acct },
        accessToken: request.user?.access_token,
        geolocation: request.get('Geolocation'),
        timezone: tz,
      });
      if (shareResponse.error) {
        return response.status(400).send('Unable to share event with Telegram group');
      }
    }

    if (remindBefore) {
      const reminderDate = new Date(event.start_date);
      const remindResponse = await secretaryGateway.call({
        method: 'remind-once',
        params: {
          id_task: rpcResponse.result?.id_task,
          name: event.name,
          description: event.description,
          year: reminderDate.getFullYear(),
          month: reminderDate.getMonth() + 1,
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

    for (const target of targets) {
      if (target?.id) {
        const message = await bot.sendMessage(target.id, formatTelegramGroupMeeting(rpcResponse.result, tz), {
          parse_mode: 'HTML',
        });

        telegramEventRepository.saveTelegramEvent({
          chatId: target.id,
          messageId: message.message_id,
          taskId: rpcResponse.result.id_task,
          name: String(target.name ?? ''),
          type: String(target.type ?? ''),
        });

        await bot.editMessageReplyMarkup(
          getTelegramGroupMeetingReplyMarkup({
            chatId: String(target.id),
            messageId: String(message.message_id),
            taskId: rpcResponse.result?.id_task,
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
