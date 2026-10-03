import test from 'ava';

import { convertIcalToEvent } from '../../src/controllers/calendar-google/post.ts';

test('Google calendar conversion preserves UTC and derives end from DURATION', (t) => {
  const event = convertIcalToEvent(
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:event-1',
      'DTSTART:20260908T090000Z',
      'DURATION:PT1H',
      'SUMMARY:Review',
      'ORGANIZER:mailto:owner@example.com',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'),
  );

  t.assert(event.startTime === '2026-09-08T09:00:00.000Z');
  t.assert(event.endTime === '2026-09-08T10:00:00.000Z');
  t.deepEqual(event.actor, { type: 'Person', email: 'owner@example.com' });
});

test('Google calendar conversion tolerates a missing organizer and DTEND', (t) => {
  const event = convertIcalToEvent(
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:event-2',
      'DTSTART:20260908T090000Z',
      'SUMMARY:Review',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'),
  );

  t.assert(event.endTime === event.startTime);
  t.deepEqual(event.actor, { type: 'Person' });
});

test('Google calendar conversion applies a supplied TZID definition', (t) => {
  const event = convertIcalToEvent(
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Moscow',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0300',
      'TZOFFSETTO:+0300',
      'TZNAME:MSK',
      'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'UID:event-3',
      'DTSTART;TZID=Europe/Moscow:20260908T120000',
      'DTEND;TZID=Europe/Moscow:20260908T130000',
      'SUMMARY:Review',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'),
  );

  t.assert(event.startTime === '2026-09-08T09:00:00.000Z');
  t.assert(event.endTime === '2026-09-08T10:00:00.000Z');
});
