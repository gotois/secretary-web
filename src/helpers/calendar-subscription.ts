import ICalendar, { VFreeBusy } from 'ical-browser';
import ICAL from 'ical.js';
import { encodeTaskUid, isTaskId } from './task-uid.ts';

type BusyType = 'BUSY' | 'BUSY-TENTATIVE' | 'BUSY-UNAVAILABLE';

interface SubscriptionTask {
  id_task: number;
  uid_task: string;
  start_date: string;
  end_date?: string;
}

interface AvailabilityConflict {
  start_date: string;
  end_date: string;
  type: BusyType;
}

interface BusyPeriod {
  start: Date;
  end: Date;
  type: BusyType;
}

interface BuildSubscriptionCalendarInput {
  tasks: unknown;
  eventCalendars: unknown;
  availabilityConflicts: unknown;
  start: Date;
  end: Date;
  language: string;
  userId: number;
}

const BUSY_TYPES = new Set<BusyType>(['BUSY', 'BUSY-TENTATIVE', 'BUSY-UNAVAILABLE']);

/**
 * Преобразует значение RPC в дату.
 * @param value - значение даты
 * @param field - имя поля для ошибки
 * @returns корректная дата
 */
function toDate(value: unknown, field: string): Date {
  const date = typeof value === 'string' ? new Date(value) : undefined;
  if (!date || Number.isNaN(date.getTime())) {
    throw new TypeError(`${field} must be a valid date`);
  }
  return date;
}

/**
 * Валидирует задачи и строит индекс исходных UID.
 * @param value - JSON-результат RPC show
 * @returns задачи и соответствие UID в id_task
 */
function parseTasks(value: unknown): { tasks: SubscriptionTask[]; taskIdsByUid: Map<string, number> } {
  if (!Array.isArray(value)) {
    throw new TypeError('show result must be an array');
  }

  const tasks = value as SubscriptionTask[];
  const taskIdsByUid = new Map<string, number>();
  for (const task of tasks) {
    if (!isTaskId(task?.id_task) || typeof task?.uid_task !== 'string' || !task.uid_task) {
      throw new TypeError('show result contains an invalid task');
    }
    toDate(task.start_date, 'start_date');
    if (task.end_date !== undefined) {
      toDate(task.end_date, 'end_date');
    }

    const uid = task.uid_task.toLowerCase();
    const existingTaskId = taskIdsByUid.get(uid);
    if (existingTaskId !== undefined && existingTaskId !== task.id_task) {
      throw new TypeError('show result contains duplicate task UID');
    }
    taskIdsByUid.set(uid, task.id_task);
  }

  return { tasks, taskIdsByUid };
}

/**
 * Валидирует интервалы RPC check-availability.
 * @param value - результат check-availability
 * @returns занятые интервалы
 */
function parseAvailabilityConflicts(value: unknown): BusyPeriod[] {
  if (!Array.isArray(value)) {
    throw new TypeError('check-availability result must be an array');
  }

  return (value as AvailabilityConflict[]).map((conflict) => {
    if (!BUSY_TYPES.has(conflict?.type)) {
      throw new TypeError('check-availability result contains an invalid busy type');
    }
    const start = toDate(conflict.start_date, 'start_date');
    const end = toDate(conflict.end_date, 'end_date');
    if (end <= start) {
      throw new TypeError('check-availability result contains an invalid period');
    }
    return { start, end, type: conflict.type };
  });
}

/**
 * Добавляет VEVENT из calendar-представления show и заменяет UID.
 * @param calendar - итоговый календарь
 * @param value - массив ICS из RPC show
 * @param taskIdsByUid - соответствие исходных UID в id_task
 */
function addTaskEvents(calendar: ICAL.Component, value: unknown, taskIdsByUid: Map<string, number>): void {
  if (
    !Array.isArray(value) ||
    !value.every((item) => {
      return typeof item === 'string';
    })
  ) {
    throw new TypeError('calendar show result must be an array of ICS strings');
  }

  const mappedTaskIds = new Set<number>();
  const timezoneIds = new Set(
    calendar.getAllSubcomponents('vtimezone').map((timezone) => {
      return String(timezone.getFirstPropertyValue('tzid'));
    }),
  );

  for (const ics of value as string[]) {
    const source = new ICAL.Component(ICAL.parse(ics));
    for (const timezone of source.getAllSubcomponents('vtimezone')) {
      const timezoneId = String(timezone.getFirstPropertyValue('tzid'));
      if (!timezoneIds.has(timezoneId)) {
        timezoneIds.add(timezoneId);
        calendar.addSubcomponent(timezone);
      }
    }

    for (const event of source.getAllSubcomponents('vevent')) {
      const uid = event.getFirstPropertyValue('uid');
      if (typeof uid !== 'string') {
        throw new TypeError('calendar show result contains VEVENT without UID');
      }
      const taskId = taskIdsByUid.get(uid.toLowerCase());
      if (taskId === undefined) {
        throw new TypeError('calendar show event does not match JSON show result');
      }
      event.updatePropertyWithValue('uid', encodeTaskUid(taskId));
      mappedTaskIds.add(taskId);
      calendar.addSubcomponent(event);
    }
  }

  if (mappedTaskIds.size !== taskIdsByUid.size) {
    throw new TypeError('JSON show task does not match calendar show result');
  }
}

/**
 * Формирует конечный subscription calendar из существующих RPC-представлений.
 * @param input - результаты show и check-availability
 * @returns единый VCALENDAR с UUIDv8 и VFREEBUSY
 */
export function buildSubscriptionCalendar(input: BuildSubscriptionCalendarInput): string {
  const { tasks, taskIdsByUid } = parseTasks(input.tasks);
  const taskBusyPeriods = tasks.flatMap((task): BusyPeriod[] => {
    if (!task.end_date) {
      return [];
    }
    const start = toDate(task.start_date, 'start_date');
    const end = toDate(task.end_date, 'end_date');
    return end > start ? [{ start, end, type: 'BUSY' }] : [];
  });
  const busyPeriods = [...taskBusyPeriods, ...parseAvailabilityConflicts(input.availabilityConflicts)];

  const generatedCalendar = new ICalendar({
    id: `-//Secretary//Secretary Calendar TG//${input.language}`,
    method: 'PUBLISH',
  });
  if (busyPeriods.length > 0) {
    generatedCalendar.addFreeBusy(
      new VFreeBusy({
        uid: `freebusy-${input.userId}`,
        start: input.start,
        end: input.end,
        freeBusy: busyPeriods,
      }),
    );
  }

  const calendar = new ICAL.Component(ICAL.parse(generatedCalendar.ics));
  addTaskEvents(calendar, input.eventCalendars, taskIdsByUid);
  return calendar.toString();
}
