import { DatabaseSync } from 'node:sqlite';

export interface TelegramEvent {
  chatId: number;
  messageId: number;
  taskId: number;
  name: string;
  type: string;
}

type TelegramEventRow = { chat_id: number; message_id: number; task_id: number; name: string; type: string };

export class SqliteTelegramEventRepository {
  #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
    database.exec(
      "CREATE TABLE if not exists telegram_events(chat_id INTEGER NOT NULL, message_id INTEGER NOT NULL, task_id INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '', PRIMARY KEY(chat_id, message_id)) STRICT",
    );
    const columns = database.prepare('PRAGMA table_info(telegram_events)').all() as Array<{ name: string }>;
    if (
      !columns.some((column) => {
        return column.name === 'name';
      })
    ) {
      database.exec("ALTER TABLE telegram_events ADD COLUMN name TEXT NOT NULL DEFAULT ''");
    }
    if (
      !columns.some((column) => {
        return column.name === 'type';
      })
    ) {
      database.exec("ALTER TABLE telegram_events ADD COLUMN type TEXT NOT NULL DEFAULT ''");
    }
  }

  saveTelegramEvent(event: TelegramEvent): void {
    this.#database
      .prepare(
        'INSERT INTO telegram_events (chat_id, message_id, task_id, name, type) VALUES (?, ?, ?, ?, ?) ON CONFLICT(chat_id, message_id) DO UPDATE SET task_id = excluded.task_id, name = excluded.name, type = excluded.type',
      )
      .run(event.chatId, event.messageId, event.taskId, event.name, event.type);
  }

  getTelegramEventsByTaskId(taskId: number): TelegramEvent[] {
    const events = this.#database
      .prepare('SELECT chat_id, message_id, task_id, name, type FROM telegram_events WHERE task_id = ?')
      .all(taskId) as TelegramEventRow[];
    return events.map((event) => {
      return toTelegramEvent(event);
    });
  }

  getTelegramEvent(chatId: number, messageId: number): TelegramEvent | undefined {
    const event = this.#database
      .prepare(
        'SELECT chat_id, message_id, task_id, name, type FROM telegram_events WHERE chat_id = ? AND message_id = ?',
      )
      .get(chatId, messageId) as TelegramEventRow | undefined;
    return event ? toTelegramEvent(event) : undefined;
  }
}

function toTelegramEvent(event: TelegramEventRow): TelegramEvent {
  return {
    chatId: event.chat_id,
    messageId: event.message_id,
    taskId: event.task_id,
    name: event.name,
    type: event.type,
  };
}
