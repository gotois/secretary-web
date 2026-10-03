export interface WebAppAction {
  type: string;
  data?: unknown;
}

export function parseWebAppData(value: unknown): WebAppAction[] {
  if (typeof value !== 'string') {
    throw new TypeError('web_app_data отсутствует');
  }
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    throw new TypeError('Некорректный JSON в web_app_data');
  }
  if (!Array.isArray(data)) {
    throw new TypeError('web_app_data должен содержать массив действий');
  }
  for (const item of data) {
    if (typeof item !== 'object' || item === null || typeof (item as Record<string, unknown>).type !== 'string') {
      throw new TypeError('Некорректное действие web_app_data');
    }
    const action = item as WebAppAction;
    if (action.type === 'tz' && (typeof action.data !== 'string' || !isTimezone(action.data))) {
      throw new TypeError('Некорректная timezone в web_app_data');
    }
    if (action.type === 'location' && !isLocation(action.data)) {
      throw new TypeError('Некорректная геопозиция в web_app_data');
    }
  }
  return data as WebAppAction[];
}

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isLocation(value: unknown): value is { latitude: number; longitude: number; accuracy?: number } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const location = value as Record<string, unknown>;
  return (
    typeof location.latitude === 'number' &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    typeof location.longitude === 'number' &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180 &&
    (location.accuracy === undefined ||
      (typeof location.accuracy === 'number' && Number.isFinite(location.accuracy) && location.accuracy >= 0))
  );
}
