import type { NextFunction, Request, Response } from 'express';
import { secretaryGateway } from '../../../app/container.ts';
import { buildSubscriptionCalendar } from '../../../helpers/calendar-subscription.ts';

/**
 * Возвращает границу периода subscription относительно текущей даты.
 * @param months - сдвиг в месяцах
 * @returns дата начала или окончания периода
 */
const getDateOffsetByMonths = (months: number): Date => {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  date.setHours(0, 0, 0, 0);
  return date;
};

export default async (request: Request, response: Response, next: NextFunction): Promise<Response> => {
  try {
    const start = getDateOffsetByMonths(-12);
    const end = getDateOffsetByMonths(3);
    const parameters = { start_date: start, end_date: end };
    const [tasksResponse, eventCalendarsResponse, availabilityResponse] = await Promise.all([
      secretaryGateway.call({
        method: 'show',
        params: parameters,
        accessToken: request.user?.access_token,
        timezone: request.user?.timezone ?? undefined,
        accept: 'application/json',
      }),
      secretaryGateway.call({
        method: 'show',
        params: parameters,
        accessToken: request.user?.access_token,
        timezone: request.user?.timezone ?? undefined,
        accept: 'text/calendar',
      }),
      secretaryGateway.call({
        method: 'check-availability',
        params: parameters,
        accessToken: request.user?.access_token,
        timezone: request.user?.timezone ?? undefined,
        accept: 'application/json',
      }),
    ]);
    if (tasksResponse.error || eventCalendarsResponse.error || availabilityResponse.error) {
      return response.status(502).send('Failed to load subscription events');
    }

    const ics = buildSubscriptionCalendar({
      tasks: tasksResponse.result,
      eventCalendars: eventCalendarsResponse.result,
      availabilityConflicts: availabilityResponse.result,
      start,
      end,
      language: request.user?.language ?? 'en',
      userId: request.user?.id ?? 0,
    });

    return response.type('text/calendar').send(ics);
  } catch (error) {
    next(error);
  }
};
