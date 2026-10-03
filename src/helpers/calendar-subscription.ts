import ICalendar, { VAlarm, VEvent, VFreeBusy, type RuleDay } from 'ical-browser';
import { encodeTaskUid, isTaskId } from './task-uid.ts';

type BusyType = 'BUSY' | 'BUSY-TENTATIVE' | 'BUSY-UNAVAILABLE';

interface SubscriptionTask {
  id_task: number;
  name: string;
  description?: string;
  id_user?: string;
  category_name?: string;
  priority?: number;
  updated_at?: string;
  start_date: string;
  end_date?: string;
  latitude?: number;
  longitude?: number;
  location?: string;
  link_meeting?: string;
  i_cal_class_name?: string;
  task_status_name?: string;
  recurrence?: SubscriptionRecurrence | null;
  remind_before?: number;
  sequence?: number;
  attendee?: Array<{ name?: string; uri: string }>;
}

interface SubscriptionRecurrence {
  recurrence_type: number;
  interval: number;
  weekdays?: number | null;
  day_of_month?: number | null;
  month?: number | null;
  hour?: number | null;
  minute?: number | null;
  count?: number;
  until?: string;
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
  availabilityConflicts: unknown;
  start: Date;
  end: Date;
  language: string;
  userId: number;
}

const BUSY_TYPES = new Set<BusyType>(['BUSY', 'BUSY-TENTATIVE', 'BUSY-UNAVAILABLE']);
const EVENT_STATUSES = new Set(['TENTATIVE', 'CONFIRMED', 'CANCELLED']);
const EVENT_CLASSES = new Set(['PUBLIC', 'PRIVATE', 'CONFIDENTIAL']);
type EventInput = ConstructorParameters<typeof VEvent>[0];

/**
 * Возвращает годовой период subscription: три месяца вперёд и оставшийся
 * диапазон в прошлом.
 * @param referenceDate - текущая дата
 * @param timeZone - часовой пояс пользователя
 * @returns границы периода
 */
export function getSubscriptionPeriod(referenceDate: Date, timeZone: string): { start: Date; end: Date } {
  const reference = Temporal.Instant.from(referenceDate.toISOString()).toZonedDateTimeISO(timeZone);
  const end = reference.add({ months: 3 }).startOfDay();
  const start = end.subtract({ years: 1 });
  return {
    start: new Date(start.epochMilliseconds),
    end: new Date(end.epochMilliseconds),
  };
}

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
 * Преобразует необязательное RPC-значение в дату.
 * @param value - значение даты
 * @param field - имя поля для ошибки
 * @returns корректная дата или undefined
 */
function optionalDate(value: unknown, field: string): Date | undefined {
  return value === undefined || value === null ? undefined : toDate(value, field);
}

/**
 * Преобразует момент в формат iCalendar UTC DATE-TIME.
 * @param value - дата и время
 * @returns компактное UTC-значение
 */
function formatICalUtcDateTime(value: Date): string {
  const dateTime = Temporal.Instant.fromEpochMilliseconds(value.getTime()).toZonedDateTimeISO('UTC');
  const year = String(dateTime.year).padStart(4, '0');
  const month = String(dateTime.month).padStart(2, '0');
  const day = String(dateTime.day).padStart(2, '0');
  const hour = String(dateTime.hour).padStart(2, '0');
  const minute = String(dateTime.minute).padStart(2, '0');
  const second = String(dateTime.second).padStart(2, '0');
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

/**
 * Преобразует битовую маску дней недели в значения RRULE.
 * @param mask - битовая маска от понедельника до воскресенья
 * @returns дни недели RRULE
 */
function recurrenceWeekdays(mask: number | null | undefined): RuleDay[] {
  const days: RuleDay[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  return days.filter((_day, index) => {
    return (mask ?? 0) & (1 << index);
  });
}

/**
 * Преобразует внутренний тип повторения в частоту RRULE.
 * @param type - идентификатор типа повторения
 * @returns частота RRULE
 */
function recurrenceFrequency(type: number): string {
  switch (type) {
    case 1: {
      return 'SECONDLY';
    }
    case 2: {
      return 'MINUTELY';
    }
    case 3: {
      return 'HOURLY';
    }
    case 4: {
      return 'DAILY';
    }
    case 5: {
      return 'WEEKLY';
    }
    case 6: {
      return 'MONTHLY';
    }
    case 7: {
      return 'YEARLY';
    }
    default: {
      throw new TypeError(`Unknown recurrence type: ${type}`);
    }
  }
}

/**
 * Формирует RRULE из JSON-представления повторяемости.
 * @param recurrence - параметры повторяемости задачи
 * @returns параметры RRULE или undefined
 */
function toRecurrenceRule(recurrence: SubscriptionRecurrence | null | undefined): EventInput['rrule'] {
  if (!recurrence) return;
  if (!Number.isSafeInteger(recurrence.interval) || recurrence.interval < 1) {
    throw new TypeError('show result contains an invalid recurrence interval');
  }

  return {
    // Preserve sub-daily frequencies supported by the writer but absent from its types.
    freq: recurrenceFrequency(recurrence.recurrence_type) as NonNullable<EventInput['rrule']>['freq'],
    count: recurrence.count,
    interval: recurrence.interval,
    until: recurrence.until
      ? Temporal.Instant.fromEpochMilliseconds(toDate(recurrence.until, 'recurrence until').getTime())
      : undefined,
    wkst: 'MO',
    byday: recurrenceWeekdays(recurrence.weekdays),
    bymonthday: recurrence.day_of_month ?? undefined,
    bymonth: recurrence.month ?? undefined,
    byhour: recurrence.hour ?? undefined,
    byminute: recurrence.minute ?? undefined,
  };
}

/**
 * Преобразует необязательную ссылку задачи в URL.
 * @param value - значение ссылки
 * @returns URL или undefined
 */
function optionalUrl(value: unknown): URL | undefined {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string') {
    throw new TypeError('show result contains an invalid link_meeting');
  }
  try {
    return new URL(value);
  } catch {
    throw new TypeError('show result contains an invalid link_meeting');
  }
}

/**
 * Валидирует задачи из JSON-представления show.
 * @param value - JSON-результат RPC show
 * @returns проверенные задачи
 */
function parseTasks(value: unknown): SubscriptionTask[] {
  if (!Array.isArray(value)) {
    throw new TypeError('show result must be an array');
  }

  const tasks = value as SubscriptionTask[];
  for (const task of tasks) {
    if (!isTaskId(task?.id_task) || typeof task?.name !== 'string' || !task.name) {
      throw new TypeError('show result contains an invalid task');
    }
    toDate(task.start_date, 'start_date');
    if (task.end_date !== undefined) {
      toDate(task.end_date, 'end_date');
    }
  }

  return tasks;
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
 * Формирует VEVENT из JSON-представления задачи.
 * @param task - задача из RPC show
 * @returns событие календаря
 */
function toEvent(task: SubscriptionTask): VEvent {
  const start = toDate(task.start_date, 'start_date');
  const end = optionalDate(task.end_date, 'end_date');
  if (end && end < start) {
    throw new TypeError('show result contains an invalid task period');
  }
  const updatedAt = optionalDate(task.updated_at, 'updated_at');
  const event = new VEvent({
    uid: encodeTaskUid(task.id_task),
    summary: task.name,
    description: task.description,
    start: Temporal.Instant.fromEpochMilliseconds(start.getTime()),
    end: end ? Temporal.Instant.fromEpochMilliseconds(end.getTime()) : undefined,
    location: task.location,
    url: optionalUrl(task.link_meeting),
    geo: task.latitude === undefined || task.longitude === undefined ? undefined : [task.latitude, task.longitude],
    rrule: toRecurrenceRule(task.recurrence),
    klass: EVENT_CLASSES.has(task.i_cal_class_name ?? '') ? (task.i_cal_class_name as EventInput['klass']) : undefined,
    categories: task.category_name ? [task.category_name] : undefined,
    priority: task.priority,
    sequence: task.sequence,
    status: EVENT_STATUSES.has(task.task_status_name ?? '')
      ? (task.task_status_name as EventInput['status'])
      : undefined,
    lastModified: updatedAt ? Temporal.Instant.fromEpochMilliseconds(updatedAt.getTime()) : undefined,
    ['x-emotional']: 'neutral',
    ['X-MICROSOFT-DISALLOW-COUNTER']: true,
    ...(updatedAt ? { ['X-MOZ-LASTACK']: formatICalUtcDateTime(updatedAt) } : {}),
    transp: 'OPAQUE',
    organizer: task.id_user,
    attendee: task.attendee?.map(({ name, uri }) => {
      return { name: name ?? '', uri };
    }),
  });

  if (task.remind_before !== undefined) {
    event.addAlarm(
      new VAlarm({
        action: 'DISPLAY',
        trigger: `-PT${task.remind_before}S`,
        description: task.name,
      }),
    );
  }
  return event;
}

/**
 * Формирует конечный subscription calendar из существующих RPC-представлений.
 * @param input - результаты show и check-availability
 * @returns единый VCALENDAR с UUIDv8 и VFREEBUSY
 */
export function buildSubscriptionCalendar(input: BuildSubscriptionCalendarInput): string {
  const tasks = parseTasks(input.tasks);
  const taskBusyPeriods = tasks.flatMap((task): BusyPeriod[] => {
    if (!task.end_date) {
      return [];
    }
    const start = toDate(task.start_date, 'start_date');
    const end = toDate(task.end_date, 'end_date');
    if (end <= start) {
      return [];
    }
    if (!task.recurrence) {
      return end > input.start && start < input.end ? [{ start, end, type: 'BUSY' }] : [];
    }
    return getRecurringBusyPeriods(task.recurrence, start, end, input.start, input.end);
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
        start: Temporal.Instant.fromEpochMilliseconds(input.start.getTime()),
        end: Temporal.Instant.fromEpochMilliseconds(input.end.getTime()),
        freeBusy: busyPeriods.map(({ start, end, type }) => {
          return {
            start: Temporal.Instant.fromEpochMilliseconds(start.getTime()),
            end: Temporal.Instant.fromEpochMilliseconds(end.getTime()),
            type,
          };
        }),
      }),
    );
  }
  for (const task of tasks) {
    generatedCalendar.addEvent(toEvent(task));
  }
  return generatedCalendar.ics;
}

/**
 * Рассчитывает занятые периоды повторяющейся задачи в пределах окна.
 * @param recurrence - параметры повторения
 * @param eventStart - начало исходного события
 * @param eventEnd - конец исходного события
 * @param periodStart - начало окна
 * @param periodEnd - конец окна
 * @returns занятые периоды
 */
function getRecurringBusyPeriods(
  recurrence: SubscriptionRecurrence,
  eventStart: Date,
  eventEnd: Date,
  periodStart: Date,
  periodEnd: Date,
): BusyPeriod[] {
  if (!Number.isSafeInteger(recurrence.interval) || recurrence.interval < 1) {
    throw new TypeError('show result contains an invalid recurrence interval');
  }
  const duration = eventEnd.getTime() - eventStart.getTime();
  const frequency = recurrence.recurrence_type;
  const interval = recurrence.interval;
  const countLimit = recurrence.count;
  const until = recurrence.until ? toDate(recurrence.until, 'recurrence until').getTime() : undefined;
  const start = Temporal.Instant.fromEpochMilliseconds(eventStart.getTime());
  const startDateTime = start.toZonedDateTimeISO('UTC');
  const startDate = startDateTime.toPlainDate();
  const startDateMs = eventStart.getTime();
  const windowStartMs = periodStart.getTime();
  const windowEndMs = periodEnd.getTime();
  const earliestRelevantMs = windowStartMs - duration;
  const periods: BusyPeriod[] = [];
  let occurrenceCount = 0;

  const addOccurrence = (dateTime: Temporal.PlainDateTime): boolean => {
    const occurrence = dateTime.toZonedDateTime('UTC').toInstant();
    const occurrenceMs = occurrence.epochMilliseconds;
    if (occurrenceMs <= startDateMs) return true;
    if (until !== undefined && occurrenceMs > until) return false;
    if (countLimit !== undefined && occurrenceCount >= countLimit) return false;
    occurrenceCount++;
    if (occurrenceMs < windowEndMs && occurrenceMs + duration > windowStartMs) {
      periods.push({
        start: new Date(occurrenceMs),
        end: new Date(occurrenceMs + duration),
        type: 'BUSY',
      });
    }
    return countLimit === undefined || occurrenceCount < countLimit;
  };

  const initialOccurrenceIsValid = until === undefined || startDateMs <= until;
  if (initialOccurrenceIsValid && (countLimit === undefined || countLimit > 0)) {
    occurrenceCount = 1;
    if (startDateMs < windowEndMs && startDateMs + duration > windowStartMs) {
      periods.push({ start: eventStart, end: eventEnd, type: 'BUSY' });
    }
  }
  if (
    !initialOccurrenceIsValid ||
    eventStart >= periodEnd ||
    (countLimit !== undefined && countLimit <= occurrenceCount)
  ) {
    return periods;
  }

  const weekdayMask = recurrence.weekdays ?? 0;
  const dateMatches = (date: Temporal.PlainDate): boolean => {
    if (recurrence.month !== undefined && recurrence.month !== null && date.month !== recurrence.month) return false;
    if (weekdayMask !== 0 && !(weekdayMask & (1 << (date.dayOfWeek - 1)))) return false;

    if (recurrence.day_of_month !== undefined && recurrence.day_of_month !== null) {
      const monthDay =
        recurrence.day_of_month < 0 ? date.daysInMonth + recurrence.day_of_month + 1 : recurrence.day_of_month;
      if (date.day !== monthDay) return false;
    } else if ((frequency === 6 || frequency === 7) && weekdayMask === 0 && date.day !== startDate.day) {
      return false;
    }

    if (frequency === 5 && weekdayMask === 0 && date.dayOfWeek !== startDate.dayOfWeek) {
      return false;
    }
    if (
      frequency === 7 &&
      (recurrence.month === undefined || recurrence.month === null) &&
      weekdayMask === 0 &&
      (recurrence.day_of_month === undefined || recurrence.day_of_month === null) &&
      date.month !== startDate.month
    ) {
      return false;
    }
    return true;
  };

  if (frequency <= 3) {
    let step = 3_600_000;
    if (frequency === 1) step = 1000;
    if (frequency === 2) step = 60_000;
    const firstIndex =
      countLimit === undefined ? Math.max(1, Math.floor((earliestRelevantMs - startDateMs) / (step * interval))) : 1;
    const untilInstant = until === undefined ? undefined : Temporal.Instant.fromEpochMilliseconds(until);
    for (let index = firstIndex; ; index++) {
      const amount = interval * index;
      let candidate: Temporal.Instant;
      if (frequency === 1) {
        candidate = start.add({ seconds: amount });
      } else if (frequency === 2) {
        candidate = start.add({ minutes: amount });
      } else {
        candidate = start.add({ hours: amount });
      }
      const candidateDateTime = candidate.toZonedDateTimeISO('UTC');
      let minute = candidateDateTime.minute;
      if (frequency === 3) minute = recurrence.minute ?? startDateTime.minute;
      const occurrenceDateTime = new Temporal.PlainDateTime(
        candidateDateTime.year,
        candidateDateTime.month,
        candidateDateTime.day,
        candidateDateTime.hour,
        minute,
        candidateDateTime.second,
        candidateDateTime.millisecond,
      );
      const occurrence = occurrenceDateTime.toZonedDateTime('UTC').toInstant();
      if (
        occurrence.epochMilliseconds >= windowEndMs ||
        (untilInstant !== undefined && Temporal.Instant.compare(occurrence, untilInstant) > 0)
      ) {
        break;
      }
      const hourMatches =
        recurrence.hour === undefined || recurrence.hour === null || occurrenceDateTime.hour === recurrence.hour;
      const minuteMatches =
        frequency === 3 ||
        recurrence.minute === undefined ||
        recurrence.minute === null ||
        occurrenceDateTime.minute === recurrence.minute;
      if (
        hourMatches &&
        minuteMatches &&
        dateMatches(occurrenceDateTime.toPlainDate()) &&
        !addOccurrence(occurrenceDateTime)
      ) {
        break;
      }
    }
    return periods;
  }

  const targetStartDate =
    countLimit === undefined
      ? Temporal.Instant.fromEpochMilliseconds(earliestRelevantMs).toZonedDateTimeISO('UTC').toPlainDate()
      : startDate;
  const cursorStartDate = Temporal.PlainDate.compare(targetStartDate, startDate) < 0 ? startDate : targetStartDate;
  const targetEndDate = Temporal.Instant.fromEpochMilliseconds(windowEndMs).toZonedDateTimeISO('UTC').toPlainDate();
  for (let date = cursorStartDate; Temporal.PlainDate.compare(date, targetEndDate) <= 0; date = date.add({ days: 1 })) {
    const elapsedDays = startDate.until(date, { largestUnit: 'days' }).days;
    const elapsedMonths = (date.year - startDate.year) * 12 + date.month - startDate.month;
    let activePeriod = false;
    switch (frequency) {
      case 4: {
        activePeriod = elapsedDays % interval === 0;
        break;
      }
      case 5: {
        activePeriod = Math.floor((elapsedDays + startDate.dayOfWeek - 1) / 7) % interval === 0;
        break;
      }
      case 6: {
        activePeriod = elapsedMonths % interval === 0;
        break;
      }
      default: {
        activePeriod = (date.year - startDate.year) % interval === 0;
      }
    }
    if (!activePeriod || !dateMatches(date)) continue;

    const hour = recurrence.hour ?? startDateTime.hour;
    const minute = recurrence.minute ?? startDateTime.minute;
    const occurrence = new Temporal.PlainDateTime(
      date.year,
      date.month,
      date.day,
      hour,
      minute,
      startDateTime.second,
      startDateTime.millisecond,
    );
    const occurrenceMs = occurrence.toZonedDateTime('UTC').epochMilliseconds;
    if (occurrenceMs <= startDateMs) continue;
    if (until !== undefined && occurrenceMs > until) break;

    occurrenceCount++;
    if (occurrenceMs < windowEndMs && occurrenceMs + duration > windowStartMs) {
      periods.push({
        start: new Date(occurrenceMs),
        end: new Date(occurrenceMs + duration),
        type: 'BUSY',
      });
    }
    if (countLimit !== undefined && occurrenceCount >= countLimit) break;
  }
  return periods;
}
