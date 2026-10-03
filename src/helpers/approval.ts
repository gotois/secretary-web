export type ApprovalType = 'accept' | 'reject';
export type BotCallback =
  | { kind: 'meeting-rsvp'; taskId: number; type: ApprovalType }
  | { kind: 'approval'; taskId: number; type: ApprovalType };

/**
 * @description Extracts a numeric task id from an id or task URL.
 * @param taskReference - Numeric task id or task URL.
 * @returns Numeric task id.
 */
export function getTaskIdFromReference(taskReference: string): number {
  return Number(taskReference.split('/').pop());
}

/**
 * @description Extracts approval type and task id from a Telegram callback.
 * @param data - Telegram callback data.
 * @returns Parsed approval data.
 */
export function parseApprovalCallback(data: string): { type: ApprovalType; taskId: number } {
  const separatorIndex = data.indexOf(':');
  const type = data.slice(0, separatorIndex) as ApprovalType;
  const taskReference = data.slice(separatorIndex + 1);

  if (!['accept', 'reject'].includes(type)) {
    throw new Error('Некорректный ответ на приглашение');
  }

  const taskId = getTaskIdFromReference(taskReference);
  if (!Number.isSafeInteger(taskId) || taskId <= 0) {
    throw new Error('Некорректный идентификатор приглашения');
  }
  return {
    type,
    taskId,
  };
}

export function parseBotCallback(data: string): BotCallback | undefined {
  const [action, taskId, decision, extra] = data.split(':');
  const numericTaskId = Number(taskId);
  if (!Number.isSafeInteger(numericTaskId) || numericTaskId <= 0 || extra !== undefined) {
    return;
  }
  if (action === 'meeting_rsvp' && (decision === 'accept' || decision === 'reject')) {
    return { kind: 'meeting-rsvp', taskId: numericTaskId, type: decision };
  }
  if (decision === undefined && (action === 'accept' || action === 'reject')) {
    return { kind: 'approval', taskId: numericTaskId, type: action };
  }
}
