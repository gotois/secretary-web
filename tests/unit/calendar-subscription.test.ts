import test from 'ava';
import ICAL from 'ical.js';
import type { NextFunction, Request, Response } from 'express';

import { buildSubscriptionCalendar, getSubscriptionPeriod } from '../../src/helpers/calendar-subscription.ts';
import { encodeTaskUid } from '../../src/helpers/task-uid.ts';
import type { SecretaryGateway } from '../../src/infrastructure/secretary/secretary-gateway.ts';

const task = {
  id_task: 42,
  name: 'Review',
  updated_at: '2026-08-17T12:34:56.789+03:00',
  start_date: '2026-08-17T09:00:00.000Z',
  end_date: '2026-08-17T10:00:00.000Z',
  recurrence: {
    recurrence_type: 5,
    interval: 1,
    weekdays: 5,
  },
  remind_before: 900,
};

test('buildSubscriptionCalendar combines RPC events and availability', (t) => {
  const calendar = buildSubscriptionCalendar({
    tasks: [task],
    availabilityConflicts: [
      {
        start_date: '2026-08-18T09:00:00.000Z',
        end_date: '2026-08-18T10:00:00.000Z',
        type: 'BUSY-TENTATIVE',
      },
    ],
    start: new Date('2026-01-01T00:00:00.000Z'),
    end: new Date('2027-01-01T00:00:00.000Z'),
    language: 'ru',
    userId: 7,
  });

  t.notThrows(() => {
    return ICAL.parse(calendar);
  });
  t.assert(
    [
      `UID:${encodeTaskUid(task.id_task)}`,
      'X-MOZ-LASTACK:20260817T093456Z',
      'RRULE:FREQ=WEEKLY;INTERVAL=1;WKST=MO;BYDAY=MO,WE',
      'BEGIN:VALARM\r\nTRIGGER:-PT900S\r\nACTION:DISPLAY',
      'FREEBUSY;FBTYPE=BUSY:20260817T090000Z/20260817T100000Z',
      'FREEBUSY;FBTYPE=BUSY-TENTATIVE:20260818T090000Z/20260818T100000Z',
    ].every((fragment) => {
      return calendar.includes(fragment);
    }),
  );
  t.assert(!calendar.includes('undefined') && !calendar.includes('CATEGORIES:\r\n'));
  t.assert(calendar.split('FREEBUSY;FBTYPE=BUSY:').length > 2);
});

test('getSubscriptionPeriod returns one calendar year ending three months ahead', (t) => {
  const { start, end } = getSubscriptionPeriod(new Date('2026-08-17T12:00:00.000Z'), 'Europe/Moscow');

  t.deepEqual(
    {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    {
      start: '2025-11-16T21:00:00.000Z',
      end: '2026-11-16T21:00:00.000Z',
    },
  );
});

test('getSubscriptionPeriod keeps local midnight across a DST offset change', (t) => {
  const { start, end } = getSubscriptionPeriod(new Date('2027-08-07T12:00:00.000Z'), 'America/New_York');

  t.deepEqual(
    {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    {
      start: '2026-11-07T05:00:00.000Z',
      end: '2027-11-07T04:00:00.000Z',
    },
  );
});

test('getSubscriptionCalendar loads all calendar parts through RPC', async (t) => {
  process.env.NODE_ENV = 'development';
  process.env.YC_API_KEY = 'test-key';
  process.env.YC_IAM_TOKEN = 'test-folder';
  process.env.SECRETARY_HOST = 'https://api.example.com';
  const [{ default: calendarSubscriptionController }, { secretaryGateway }] = await Promise.all([
    import('../../src/controllers/tasks/subscription/get.ts'),
    import('../../src/app/container.ts'),
  ]);
  type SecretaryResponse = Awaited<ReturnType<SecretaryGateway['call']>>;
  const calls: Parameters<SecretaryGateway['call']>[0][] = [];
  const gateway: Pick<SecretaryGateway, 'call'> = {
    call: (input) => {
      calls.push(input);
      if (input.method === 'check-availability') {
        return Promise.resolve({
          jsonrpc: '2.0' as const,
          id: 'check-availability',
          result: [],
        } as unknown as SecretaryResponse);
      }
      return Promise.resolve({
        jsonrpc: '2.0' as const,
        id: `${input.method}-${input.accept}`,
        result: [task],
      } as unknown as SecretaryResponse);
    },
  };
  let body: unknown;
  let contentType: string | undefined;
  let responseHeaders: Record<string, string> | undefined;
  const response = {
    set(headers: Record<string, string>) {
      responseHeaders = headers;
      return this;
    },
    type(value: string) {
      contentType = value;
      return this;
    },
    send(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;
  const request = {
    user: {
      id: 7,
      language: 'ru',
      timezone: 'Europe/Moscow',
      access_token: 'access-token',
    },
  } as Request;
  let nextError: unknown;
  const originalCall = secretaryGateway.call;
  secretaryGateway.call = gateway.call;

  try {
    await calendarSubscriptionController(request, response, ((error: unknown) => {
      nextError = error;
    }) as NextFunction);
  } finally {
    secretaryGateway.call = originalCall;
  }

  const { Expires: expires, ...cacheHeaders } = responseHeaders ?? {};

  t.deepEqual(
    { nextError, contentType, cacheHeaders, callCount: calls.length },
    {
      nextError: undefined,
      contentType: 'text/calendar',
      cacheHeaders: {
        'Content-Disposition': 'inline; filename="calendar.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
      callCount: 2,
    },
  );
  t.assert(typeof expires === 'string' && !Number.isNaN(Date.parse(expires)));
  t.deepEqual(
    calls.map((call) => {
      return [call.method, call.accept];
    }),
    [
      ['show', 'application/json'],
      ['check-availability', 'application/json'],
    ],
  );
  t.assert(typeof body === 'string' && body.startsWith('BEGIN:VCALENDAR'));
});

test('subscription exports Temporal UNTIL and rejects COUNT with UNTIL', (t) => {
  const input = {
    tasks: [{ ...task, recurrence: { recurrence_type: 4, interval: 1, until: '2026-08-19T09:00:00Z' } }],
    availabilityConflicts: [],
    start: new Date('2026-08-17T00:00:00Z'),
    end: new Date('2026-08-20T00:00:00Z'),
    language: 'ru',
    userId: 7,
  };
  const calendar = new ICAL.Component(ICAL.parse(buildSubscriptionCalendar(input)));
  const event = calendar.getFirstSubcomponent('vevent')!;
  t.assert(new ICAL.Event(event).startDate.toJSDate().toISOString() === task.start_date);
  t.assert(event.getFirstPropertyValue('rrule').until.toICALString() === '20260819T090000Z');
  const busy = calendar.getFirstSubcomponent('vfreebusy')!;
  t.assert(busy.getFirstPropertyValue('dtstart').toJSDate().toISOString() === input.start.toISOString());
  t.assert(busy.getAllProperties('freebusy').length === 3);
  t.throws(
    () => {
      return buildSubscriptionCalendar({
        ...input,
        tasks: [{ ...task, recurrence: { ...input.tasks[0].recurrence, count: 2 } }],
      });
    },
    { message: /COUNT and UNTIL/ },
  );
});

test('subscription expands monthly recurrence without overflowing short months', (t) => {
  const calendar = buildSubscriptionCalendar({
    tasks: [
      {
        ...task,
        start_date: '2026-01-31T09:00:00.000Z',
        end_date: '2026-01-31T10:00:00.000Z',
        recurrence: { recurrence_type: 6, interval: 1, day_of_month: 31, count: 3 },
      },
    ],
    availabilityConflicts: [],
    start: new Date('2026-01-01T00:00:00.000Z'),
    end: new Date('2026-06-01T00:00:00.000Z'),
    language: 'ru',
    userId: 7,
  });
  const busyPeriods = calendar
    .split('FREEBUSY;FBTYPE=BUSY:')
    .slice(1)
    .map((value) => {
      return value.split('\r\n')[0];
    });

  t.deepEqual(busyPeriods, [
    '20260131T090000Z/20260131T100000Z',
    '20260331T090000Z/20260331T100000Z',
    '20260531T090000Z/20260531T100000Z',
  ]);
});

test('subscription counts DTSTART first in a weekly recurrence', (t) => {
  const calendar = buildSubscriptionCalendar({
    tasks: [
      {
        ...task,
        recurrence: { recurrence_type: 5, interval: 1, weekdays: 5, count: 3 },
      },
    ],
    availabilityConflicts: [],
    start: new Date('2026-08-24T00:00:00.000Z'),
    end: new Date('2026-08-27T00:00:00.000Z'),
    language: 'ru',
    userId: 7,
  });

  t.assert(calendar.includes('FREEBUSY;FBTYPE=BUSY:20260824T090000Z/20260824T100000Z'));
  t.assert(!calendar.includes('FREEBUSY;FBTYPE=BUSY:20260826T090000Z/20260826T100000Z'));
});

test('subscription expands hourly recurrence to the configured minute', (t) => {
  const calendar = buildSubscriptionCalendar({
    tasks: [
      {
        ...task,
        start_date: '2026-08-17T09:50:00.000Z',
        end_date: '2026-08-17T10:00:00.000Z',
        recurrence: { recurrence_type: 3, interval: 1, minute: 15, until: '2026-08-17T11:00:00.000Z' },
      },
    ],
    availabilityConflicts: [],
    start: new Date('2026-08-17T10:00:00.000Z'),
    end: new Date('2026-08-17T10:30:00.000Z'),
    language: 'ru',
    userId: 7,
  });

  t.assert(calendar.includes('FREEBUSY;FBTYPE=BUSY:20260817T101500Z/20260817T102500Z'));
});
