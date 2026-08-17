import type { NextFunction, Request, Response } from 'express';
import { secretaryGateway } from '../../../app/container.ts';
import { buildSubscriptionCalendar, getSubscriptionPeriod } from '../../../helpers/calendar-subscription.ts';

/**
 * Собирает subscription calendar из JSON-RPC представлений Secretary.
 * @param request - HTTP-запрос авторизованного пользователя
 * @param response - HTTP-ответ
 * @param next - следующий Express middleware
 * @returns ответ с ICS или передача ошибки middleware
 */
export default async function calendarSubscriptionController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const referenceDate = new Date();
    const timeZone = request.user?.timezone ?? 'UTC';
    const { start, end } = getSubscriptionPeriod(referenceDate, timeZone);
    const parameters = { start_date: start, end_date: end };
    const [tasksResponse, availabilityResponse] = await Promise.all([
      secretaryGateway.call({
        method: 'show',
        params: parameters,
        accessToken: request.user?.access_token,
        timezone: timeZone,
        accept: 'application/json',
      }),
      secretaryGateway.call({
        method: 'check-availability',
        params: parameters,
        accessToken: request.user?.access_token,
        timezone: timeZone,
        accept: 'application/json',
      }),
    ]);
    if (tasksResponse.error || availabilityResponse.error) {
      return response.status(502).send('Failed to load subscription events');
    }

    const ics = buildSubscriptionCalendar({
      tasks: tasksResponse.result,
      availabilityConflicts: availabilityResponse.result,
      start,
      end,
      language: request.user?.language ?? 'en',
      userId: request.user?.id ?? 0,
    });

    return response
      .set({
        'Content-Disposition': 'inline; filename="calendar.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': referenceDate.toUTCString(),
      })
      .type('text/calendar')
      .send(ics);
  } catch (error) {
    return next(error);
  }
}
