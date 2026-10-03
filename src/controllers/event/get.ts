import type { NextFunction, Request, Response } from 'express';
import { secretaryGateway, telegramEventRepository } from '../../app/container.ts';
import { decodeTaskUid, isTaskId } from '../../helpers/task-uid.ts';

/**
 * Преобразует числовой или UUIDv8 идентификатор события в id_task.
 * @param identifier - параметр маршрута события
 * @returns числовой id_task или undefined
 */
function getTaskId(identifier: string): number | undefined {
  const numericTaskId = Number(identifier);
  if (isTaskId(numericTaskId) && String(numericTaskId) === identifier) {
    return numericTaskId;
  }

  return decodeTaskUid(identifier);
}

export default async (
  request: Request<{ taskId: string }>,
  response: Response,
  next: NextFunction,
): Promise<Response> => {
  try {
    const taskId = getTaskId(request.params.taskId);
    if (taskId === undefined) {
      return response.status(400).send('Invalid event id');
    }

    const data = await secretaryGateway.getTask({
      taskId,
      accessToken: request.user?.access_token,
    });

    const telegramEvents = telegramEventRepository.getTelegramEventsByTaskId(taskId);
    const [telegramEvent] = telegramEvents;
    if (!telegramEvent) {
      return response.json(data);
    }

    return response.json({
      ...data,
      chatId: telegramEvent.chatId,
      messageId: telegramEvent.messageId,
      targetName: telegramEvent.name,
      targetType: telegramEvent.type,
      targets: telegramEvents.map((event) => {
        return {
          chatId: event.chatId,
          messageId: event.messageId,
          targetName: event.name,
          targetType: event.type,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};
