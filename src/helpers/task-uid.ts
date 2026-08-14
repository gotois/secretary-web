const TASK_UID_PREFIX = '53454352-4554-8000-8000-0000';
const TASK_UID_PATTERN = /^53454352-4554-8000-8000-0000([\da-f]{8})$/i;

export const MAX_TASK_ID = 2_147_483_647;

/**
 * Проверяет диапазон идентификатора задачи MSSQL.
 * @param value - проверяемое значение
 * @returns true для допустимого id_task
 */
export function isTaskId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= MAX_TASK_ID;
}

/**
 * Кодирует числовой id_task в UUIDv8 Secretary.
 * @param taskId - числовой идентификатор задачи
 * @returns UUIDv8 с обратимым id_task
 */
export function encodeTaskUid(taskId: number): string {
  if (!isTaskId(taskId)) {
    throw new TypeError(`taskId must be an integer between 1 and ${MAX_TASK_ID}`);
  }

  return `${TASK_UID_PREFIX}${taskId.toString(16).padStart(8, '0')}`;
}

/**
 * Извлекает id_task только из UUIDv8 формата Secretary.
 * @param uid - проверяемый UUID
 * @returns id_task или undefined для чужого формата
 */
export function decodeTaskUid(uid: unknown): number | undefined {
  if (typeof uid !== 'string') {
    return;
  }

  const match = TASK_UID_PATTERN.exec(uid);
  if (!match) {
    return;
  }

  const taskId = Number.parseInt(match[1], 16);
  return isTaskId(taskId) ? taskId : undefined;
}
