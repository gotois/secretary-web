import type { NextFunction, Request, Response } from 'express';
import ICAL from 'ical.js';
import { createDAVClient } from 'tsdav';
import { GOOGLE, TELEGRAM } from '#env';

interface CalendarRequestBody {
  code?: string;
  username?: string;
}

interface GoogleTokenResponse {
  refresh_token?: string;
}

/**
 * @description Конвертирует iCal событие в ActivityStreams Event.
 * @param {string} ical - iCal данные события
 * @returns Объект события
 */
export function convertIcalToEvent(ical: string) {
  const component = new ICAL.Component(ICAL.parse(ical));
  for (const timezone of component.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(timezone);
  }
  const eventComponent = component.getFirstSubcomponent('vevent');
  if (!eventComponent) {
    throw new Error('iCalendar object does not contain VEVENT');
  }
  const event = new ICAL.Event(eventComponent);
  if (!event.uid || !event.startDate) {
    throw new Error('iCalendar event is missing UID or DTSTART');
  }
  const organizerValue = eventComponent.getFirstPropertyValue('organizer');
  const organizer = typeof organizerValue === 'string' ? organizerValue : undefined;
  const email = organizer?.toLowerCase().startsWith('mailto:') ? organizer.slice('mailto:'.length) : organizer;
  const actor = email ? { type: 'Person', email } : { type: 'Person' };

  return {
    type: 'Event',
    id: 'https://api.gotointeractive.com/events/' + event.uid,
    startTime: event.startDate.toJSDate().toISOString(),
    endTime: event.endDate.toJSDate().toISOString(),
    name: event.summary,
    summary: event.description,
    url: eventComponent.getFirstPropertyValue('url') || null,
    location: event.location || null,
    actor,
    target: eventComponent.getAllProperties('attendee').map((attendee) => {
      return {
        type: 'Organization',
        name: attendee.getFirstValue(),
      };
    }),
  };
}

/**
 * Получает refresh token Google OAuth
 * @param {string} code - код авторизации Google
 * @param {string} clientId - OAuth client id
 * @param {string} clientSecret - OAuth client secret
 * @returns Refresh token
 */
async function getRefreshToken(code: string, clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: TELEGRAM.APP_URL + '/calendar-import',
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) {
    throw new Error(`Google OAuth error: ${response.statusText}`);
  }

  const { refresh_token: refreshToken } = (await response.json()) as GoogleTokenResponse;
  if (!refreshToken) {
    throw new Error('Google refresh token is missing');
  }
  return refreshToken;
}

/**
 * Получает события основного календаря Google
 * @param username - имя пользователя Google Calendar
 * @param refreshToken - refresh token Google OAuth
 * @param clientId - OAuth client id
 * @param clientSecret - OAuth client secret
 * @returns Объекты календаря
 */
async function getEvents(username: string, refreshToken: string, clientId: string, clientSecret: string) {
  const client = await createDAVClient({
    serverUrl: 'https://apidata.googleusercontent.com/caldav/v2/',
    credentials: {
      tokenUrl: 'https://accounts.google.com/o/oauth2/token',
      username,
      refreshToken,
      clientId,
      clientSecret,
    },
    authMethod: 'Oauth',
    defaultAccountType: 'caldav',
  });
  const calendars = await client.fetchCalendars();
  if (!calendars[0]) {
    return [];
  }
  return client.fetchCalendarObjects({ calendar: calendars[0] });
}

/**
 * Импортирует события Google Calendar для авторизованного пользователя Telegram.
 * @param request - Express request
 * @param response - Express response
 * @param next - следующий middleware
 * @returns HTTP response
 */
export default async (request: Request, response: Response, next: NextFunction): Promise<Response> => {
  try {
    const { code, username } = request.body as CalendarRequestBody;
    if (!code || !username) {
      return response.status(400).send('Google authorization code and username are required');
    }

    const clientId = GOOGLE.CALENDAR.CLIENT_ID;
    const clientSecret = GOOGLE.CALENDAR.CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('Google Calendar OAuth credentials are missing');
    }

    const refreshToken = await getRefreshToken(code, clientId, clientSecret);
    const calendarObjects = await getEvents(username, refreshToken, clientId, clientSecret);
    const events = calendarObjects.map((calendarObject) => {
      return convertIcalToEvent(calendarObject.data);
    });

    return response.json({
      '@context': 'https://www.w3.org/ns/activitystreams',
      'type': 'Offer',
      'actor': {
        type: 'Organization',
        name: 'Виртуальный секретарь',
        email: 'curator@gotointeractive.com',
        url: 'https://gotointeractive.com',
      },
      'object': events,
      'target': {
        type: 'Person',
        id: request.user?.actor_id,
        location: request.user?.location ?? 'Российская Федерация',
      },
    });
  } catch (error) {
    next(error);
  }
};
