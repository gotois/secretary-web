import { secretaryGateway } from '../../app/container.ts';
import { parseApprovalCallback } from '../../helpers/approval.ts';

export default async (activity, message, bot) => {
  const { type, taskId } = parseApprovalCallback(message.data);

  await bot.answerCallbackQuery(message.id, {
    text: 'Идет обработка...',
    show_alert: false,
  });

  const { result } = await secretaryGateway.call({
    method: 'approval',
    params: { id_task: taskId, type },
    accessToken: message.user.accessToken,
  });
  if (!result) {
    return;
  }

  await bot.editMessageText(`${message.text}\n\nПриглашение отклонено`, {
    chat_id: message.chat.id,
    message_id: message.message_id,
    reply_markup: {
      inline_keyboard: [],
    },
  });
};
