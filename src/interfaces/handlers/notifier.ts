export const notifyDice = async (activity, message, bot) => {
  const diceMessage = await bot.sendDice(message.chat.id, {
    emoji: '🎰',
  });
  const {
    dice: { value },
  } = diceMessage;

  setTimeout(async () => {
    await bot.sendMessage(message.chat.id, 'Напоминаю.', {
      message_id: message.message_id,
    });
  }, value * 1000);
};

export const notifyNextHour = (activity, message, bot) => {
  // TODO: вынести напоминания в постоянную очередь с id исходного события. setTimeout
  // теряется при рестарте, а callback не связывает напоминание с конкретной задачей.
  setTimeout(async () => {
    await bot.sendMessage(message.chat.id, 'Напоминаю.', {
      message_id: message.message_id,
    });
  }, 60_000); // TODO: notifyNextHour срабатывает через минуту; рассчитывать задержку в один час.
};

export const notifyNextDay = (activity, message, bot) => {
  setTimeout(async () => {
    await bot.sendMessage(message.chat.id, 'Напоминаю.', {
      message_id: message.message_id,
    });
  }, 1000); // TODO: notifyNextDay срабатывает через секунду; рассчитывать следующее утро в timezone пользователя.
};
