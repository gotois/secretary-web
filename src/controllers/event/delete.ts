import type { NextFunction, Request, Response } from 'express';
import { secretaryGateway, telegramEventRepository } from '../../app/container.ts';
import { bot } from '../../interfaces/bot.ts';
import type { ChatId } from 'node-telegram-bot-api';
import { GROUP_ADMIN_STATUSES } from '../../helpers/telegram-user-statuses.ts';

export default async (request: Request, response: Response, next: NextFunction): Promise<Response> => {
  try {
    if (!Array.isArray(request.body.id_tasks) || request.body.id_tasks.length === 0) {
      return response.status(400).send('Updated event id is missing');
    }

    const chatIds = [
      ...new Set(
        request.body.id_tasks
          .map((taskId: number) => {
            return telegramEventRepository.getTelegramEventByTaskId(Number(taskId))?.chatId;
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
        id_tasks: request.body.id_tasks,
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
