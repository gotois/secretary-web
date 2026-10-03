import type { NextFunction, Request, Response } from 'express';
import { secretaryGateway, telegramEventRepository } from '../../app/container.ts';
import { bot } from '../../interfaces/bot.ts';
import type { ChatId } from 'node-telegram-bot-api';
import { GROUP_ADMIN_STATUSES } from '../../helpers/telegram-user-statuses.ts';
import { decodeTaskUid, isTaskId } from '../../helpers/task-uid.ts';

/**
 * Нормализует совместимые id_tasks и новые uid_tasks до числовых id_task.
 * @param body - тело DELETE /event
 * @returns уникальные числовые id_task или undefined
 */
function getTaskIds(body: unknown): number[] | undefined {
  if (typeof body !== 'object' || body === null) {
    return;
  }

  const parameters = body as Record<string, unknown>;
  const idTasks = parameters.id_tasks === undefined ? [] : parameters.id_tasks;
  const uidTasks = parameters.uid_tasks === undefined ? [] : parameters.uid_tasks;
  if (!Array.isArray(idTasks) || !Array.isArray(uidTasks) || (idTasks.length === 0 && uidTasks.length === 0)) {
    return;
  }

  if (!idTasks.every(isTaskId)) {
    return;
  }

  const decodedUidTasks = uidTasks.map((uid) => {
    return decodeTaskUid(uid);
  });
  if (decodedUidTasks.includes(undefined)) {
    return;
  }

  return [...new Set([...idTasks, ...(decodedUidTasks as number[])])];
}

export default async (request: Request, response: Response, next: NextFunction): Promise<Response> => {
  try {
    const taskIds = getTaskIds(request.body);
    if (!taskIds) {
      return response.status(400).send('Event id is missing or invalid');
    }

    const chatIds = [
      ...new Set(
        taskIds
          .flatMap((taskId: number) => {
            return telegramEventRepository.getTelegramEventsByTaskId(taskId).map((event) => {
              return event.chatId;
            });
          })
          .filter((chatId: number | undefined): chatId is number => {
            return chatId !== undefined;
          }),
      ),
    ] as ChatId[];
    for (const chatId of chatIds) {
      const chatMember = await bot.getChatMember(chatId, request.user?.id);
      if (!GROUP_ADMIN_STATUSES.has(chatMember.status)) {
        return response.status(403).send('Настраивать встречу могут только админы группы.');
      }
    }

    const rpcResponse = await secretaryGateway.call({
      method: 'remove',
      params: {
        id_tasks: taskIds,
      },
      accessToken: request.user?.access_token,
      geolocation: request.get('Geolocation'),
    });
    if (rpcResponse.error) {
      return response.status(400).send('Created event id is missing');
    }

    return response.send('OK');
  } catch (error) {
    next(error);
  }
};
