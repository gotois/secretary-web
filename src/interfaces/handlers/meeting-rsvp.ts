import { secretaryGateway } from '../../app/container.ts';

const ANSWERS = {
  accept: 'Готово: иду',
  reject: 'Готово: не иду',
};

/**
 *
 * @param _activity - активность ActivityPub
 * @param message - callback query Telegram
 * @param bot - экземпляр Telegram bot
 */
export default async function (_activity, message, bot): Promise<void> {
  const [, taskId, type] = message.data.split(':');
  const numericTaskId = Number(taskId);
  if (!Number.isSafeInteger(numericTaskId) || (type !== 'accept' && type !== 'reject')) {
    await bot.answerCallbackQuery(message.id, {
      text: 'Некорректный ответ на приглашение',
      show_alert: true,
    });
    return;
  }

  try {
    const rpcResponse = await secretaryGateway.call({
      method: 'approval',
      params: { id_task: numericTaskId, type },
      accessToken: message.user.accessToken,
    });

    if (rpcResponse.error) {
      throw new Error(rpcResponse.error.message ?? 'Не удалось сохранить ответ');
    }

    await bot.answerCallbackQuery(message.id, {
      text: ANSWERS[type] ?? 'Готово',
      show_alert: false,
    });
  } catch (error) {
    console.error(error);
    await bot.answerCallbackQuery(message.id, {
      text: error instanceof Error ? error.message : 'Не удалось сохранить ответ',
      show_alert: true,
    });
  }
}
