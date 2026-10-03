import crypto from 'node:crypto';
import package_ from '../../../package.json' with { type: 'json' };

const getCheckSum = (
  buffer: Buffer | string,
  algorithm = 'md5',
  encoding: crypto.BinaryToTextEncoding = 'hex',
): string => {
  const hash = crypto.createHash(algorithm);
  return (typeof buffer === 'string' ? hash.update(buffer, 'utf8') : hash.update(buffer)).digest(encoding);
};

// Помощь
export default async (activity, message, bot) => {
  const helpEntries: Record<string, string> = {
    help: 'Помощь',
    ping: 'Проверка связи',
  };
  const helpData: Record<string, string> = {};
  for (const [command, description] of Object.entries(helpEntries)) {
    helpData['/' + command.toLowerCase()] = description;
  }
  let commandsText = '';
  for (const key of Object.keys(helpData)) {
    commandsText += `${key}: ${helpData[key]}\n`;
  }
  const commandsReadable =
    commandsText +
    '\n' +
    package_.name +
    ': ' +
    package_.version +
    '\nF.A.Q.: ' +
    package_.homepage +
    '/faq/' +
    '\nCHECKSUM: ' +
    getCheckSum(JSON.stringify(package_));
  const string_ = `Используйте команды:\n${commandsReadable}`;
  await bot.sendMessage(message.chat.id, string_, {
    disable_notification: true,
    disable_web_page_preview: true,
  });
};
