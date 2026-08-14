import test from 'ava';

import { GetStartState } from '../../src/domain/usecases/get-start-state.ts';

test('returns authorized for an unexpired session', (t) => {
  const state = new GetStartState().execute({
    accessToken: 'access-token',
    expiredAt: Date.now() / 1000 + 60,
    timezone: 'Europe/Moscow',
  });

  t.deepEqual(state, 'authorized');
});

test('requires timezone for an active token without timezone', (t) => {
  const state = new GetStartState().execute({
    accessToken: 'access-token',
    expiredAt: Date.now() / 1000 - 60,
  });

  t.deepEqual(state, 'needs-timezone');
});

test('requires authorization without an active token', (t) => {
  const state = new GetStartState().execute({});

  t.deepEqual(state, 'needs-authorization');
});
