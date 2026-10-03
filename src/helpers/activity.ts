export type Activity = {
  type: string;
  object?: string;
  actor?: string;
  to: string[];
  target?: { type: string; id: string };
  summaryMap?: { ru?: string };
};

export function getActivity(body: unknown): Activity | undefined {
  if (typeof body !== 'object' || body === null) {
    return;
  }
  const credentialSubject = (body as Record<string, unknown>).credentialSubject;
  if (typeof credentialSubject !== 'object' || credentialSubject === null) {
    return;
  }
  const activity = credentialSubject as Record<string, unknown>;
  if (
    typeof activity.type !== 'string' ||
    !Array.isArray(activity.to) ||
    activity.to.length === 0 ||
    !activity.to.every((recipient) => {
      return typeof recipient === 'string' && recipient.trim().length > 0;
    }) ||
    (activity.object !== undefined && typeof activity.object !== 'string') ||
    (activity.actor !== undefined && (typeof activity.actor !== 'string' || activity.actor.trim().length === 0))
  ) {
    return;
  }
  if (activity.target !== undefined) {
    if (typeof activity.target !== 'object' || activity.target === null) {
      return;
    }
    const target = activity.target as Record<string, unknown>;
    if (
      typeof target.type !== 'string' ||
      target.type.trim().length === 0 ||
      typeof target.id !== 'string' ||
      target.id.trim().length === 0
    ) {
      return;
    }
  }
  if (activity.summaryMap !== undefined) {
    if (typeof activity.summaryMap !== 'object' || activity.summaryMap === null) {
      return;
    }
    const summaryMap = activity.summaryMap as Record<string, unknown>;
    if (summaryMap.ru !== undefined && typeof summaryMap.ru !== 'string') {
      return;
    }
  }
  return activity as Activity;
}
