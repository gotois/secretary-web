import { userRepository, secretaryGateway } from '../../app/container.ts';
import { parseApprovalCallback } from '../../helpers/approval.ts';

export default async (activity, message, bot) => {
  const user = userRepository.findById(message.chat.id);
  const { type, taskId } = parseApprovalCallback(message.data);

  await bot.answerCallbackQuery(message.id, {
    text: 'Идет обработка...',
    show_alert: false,
  });

  const { result } = await secretaryGateway.call({
    method: 'approval',
    params: { id_task: taskId, type },
    accessToken: user.accessToken,
  });
  if (!result) {
    return;
  }

  await bot.editMessageText(`<s>${message.text}</s>\n\nПриглашение отправлено`, {
    chat_id: message.chat.id,
    message_id: message.message_id,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [],
    },
  });
};
