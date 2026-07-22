import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DATABASE } from '#env';

mkdirSync(path.dirname(DATABASE.USERS), { recursive: true });
export const userDB = new DatabaseSync(DATABASE.USERS);

mkdirSync(path.dirname(DATABASE.GROUPS), { recursive: true });
export const groupDB = new DatabaseSync(DATABASE.GROUPS);

mkdirSync(path.dirname(DATABASE.EVENTS), { recursive: true });
export const eventsDB = new DatabaseSync(DATABASE.EVENTS);

groupDB.function('unicode_lower', (value: string): string => {
  return value.toLowerCase();
});
