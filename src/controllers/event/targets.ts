export type EventTarget = {
  type: 'Group' | 'Person';
  id: number;
  name?: string;
  messageId?: number;
};

export function normalizeTargets(value: unknown): Array<EventTarget | null> | undefined {
  if (value === undefined || value === null) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  const valid = values.every((item) => {
    if (item === null) {
      return true;
    }
    if (typeof item !== 'object') {
      return false;
    }
    const target = item as Record<string, unknown>;
    return (
      (target.type === 'Group' || target.type === 'Person') &&
      typeof target.id === 'number' &&
      Number.isSafeInteger(target.id) &&
      target.id !== 0 &&
      (target.name === undefined || typeof target.name === 'string') &&
      (target.messageId === undefined ||
        (typeof target.messageId === 'number' && Number.isSafeInteger(target.messageId)))
    );
  });
  return valid ? (values as Array<EventTarget | null>) : undefined;
}

export function getGroupTargets(targets: Array<EventTarget | null>): EventTarget[] {
  return targets.filter((target): target is EventTarget => {
    return target?.type === 'Group';
  });
}

export async function canManageGroupTargets(
  targets: Array<EventTarget | null>,
  userId: number,
  bot: { getChatMember(chatId: number, userId: number): Promise<{ status: string }> },
  adminStatuses: ReadonlySet<string>,
): Promise<boolean> {
  for (const target of getGroupTargets(targets)) {
    const member = await bot.getChatMember(target.id, userId);
    if (!adminStatuses.has(member.status)) {
      return false;
    }
  }
  return true;
}
