import { container } from '../../app/container.ts';

export default async (activity, message, bot) => {
  try {
    const botInfo = await bot.getMe();
    if (message.new_chat_member.id !== botInfo.id) {
      return;
    }
  } catch (error) {
    console.log(error);
    return;
  }

  container.group.save({
    id: message.chat.id,
    title: message.chat.title ?? '',
  });
  const string_ = String.raw`Всем привет\!
Меня зовут ${message.new_chat_member.first_name}\.
Буду помогать создавать события в ${message.chat.title}\.`;
  await bot.sendMessage(message.chat.id, string_, {
    parse_mode: 'MarkdownV2',
  });
};
