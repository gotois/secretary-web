import { container } from '../../app/container.ts';

export default (activity, message) => {
  container.group.delete({ groupId: message.migrate_from_chat_id });
  container.group.save({
    id: message.chat.id,
    title: message.chat.title ?? '',
  });
  console.log('migrate from chat', message);
};
