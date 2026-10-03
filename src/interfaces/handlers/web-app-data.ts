import { container } from '../../app/container.ts';
import { parseWebAppData } from '../../helpers/web-app-data.ts';

type WebAppDataMessage = {
  chat: { id: number };
  web_app_data?: { data?: string };
};

export default async function webAppDataAction(_activity: unknown, message: WebAppDataMessage): Promise<void> {
  const actions = parseWebAppData(message.web_app_data?.data);
  for (const action of actions) {
    if (action.type === 'tz') {
      await container.user.updateUserTimezone({ telegramId: message.chat.id, timezone: action.data as string });
      continue;
    }
    if (action.type === 'location') {
      await container.user.updateUserLocation({
        telegramId: message.chat.id,
        ...(action.data as { latitude: number; longitude: number; accuracy?: number }),
      });
      continue;
    }
    console.warn('Unknown web_app_data type:', action.type);
  }
}
