import { linkStartApp } from '../libs/tg-messages.ts';

export function getAssistantReply(content: unknown): string | undefined {
  if (!Array.isArray(content)) {
    return;
  }
  for (const item of content) {
    if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string' && item.text.trim()) {
      return item.text;
    }
  }
}

export function generateInlineKeyboard(artifact: unknown): unknown[][] {
  if (!Array.isArray(artifact)) {
    return [];
  }
  const inlineKeyboard: unknown[][] = [];
  for (const action of artifact) {
    if (!action || typeof action !== 'object') {
      continue;
    }
    const item = action as Record<string, unknown>;
    if (item['@type'] !== 'CreateAction') {
      continue;
    }
    const taskId = getTaskId(item.id);
    if (taskId === undefined) {
      continue;
    }
    inlineKeyboard.push([
      {
        text: 'Открыть',
        url: linkStartApp({ to: `/calendar/${taskId}/edit` }),
      },
    ]);
  }
  return inlineKeyboard;
}

function getTaskId(id: unknown): number | undefined {
  if (typeof id !== 'string') {
    return;
  }
  let url: URL;
  try {
    url = new URL(id);
  } catch {
    return;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  const result = segments.at(-1);
  const taskId = Number(result);
  if (result && Number.isSafeInteger(taskId) && taskId > 0) {
    return taskId;
  }
}
