import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock, test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';

const coreRequire = createRequire(new URL('../../../web/package.json', import.meta.url));
const { default: Redis } = await import(coreRequire.resolve('ioredis'));

test(
  'direct create and BullMQ baseline use the same dispatcher against isolated Redis',
  {
    skip: !process.env.DELIVERY_TEST_REDIS_PORT,
    timeout: 30_000,
  },
  async () => {
    const redis = new Redis({
      host: '127.0.0.1',
      port: Number(process.env.DELIVERY_TEST_REDIS_PORT),
      maxRetriesPerRequest: null,
    });
    mock.module(new URL('../../../web/db/redis/index.ts', import.meta.url).href, { defaultExport: redis });
    mock.module(new URL('../../../web/lib/logger.ts', import.meta.url).href, {
      defaultExport: { info() {}, error() {} },
    });
    mock.module(new URL('../../../web/repositories/users/index.ts', import.meta.url).href, {
      namedExports: {
        getUserKeys: () => {
          return Promise.resolve([]);
        },
      },
    });
    let creates = 0;
    mock.module(new URL('../../../web/api/server.ts', import.meta.url).href, {
      namedExports: {
        apiRequest: ({ body }: { body: { id: string } }) => {
          return Promise.resolve({
            jsonrpc: '2.0',
            id: body.id,
            result: { id_task: ++creates },
          });
        },
      },
    });
    const { queue, closeActivityQueue, replaceTaskReminderOnce, replaceTaskReminder } =
      await import('../../../web/queues/send-activity-mq.ts');
    const { queue: apiQueue, queueEvents, closeApiQueue } = await import('../../../web/queues/api-mq.ts');
    const { executeApiRequest } = await import('../../../web/api/execute-request.ts');
    try {
      const data = { webId: 'https://example.test/users/1', activity: { id: 'event-1' } };
      const at = new Date(Date.now() + 120_000);
      await replaceTaskReminderOnce(123, at, data);
      await replaceTaskReminderOnce(123, new Date(at.getTime() + 1000), data);
      assert.equal(await queue.getDelayedCount(), 1);
      await replaceTaskReminderOnce(123, null);
      assert.equal(await queue.getDelayedCount(), 0);
      const repeat = { pattern: 'RRULE:FREQ=DAILY', tz: 'UTC' };
      await replaceTaskReminder(124, repeat, data, 'repeat-1');
      const scheduler = await queue.getJobScheduler('task-reminder-124');
      await replaceTaskReminder(124, repeat, data, 'repeat-1');
      assert.deepEqual(await queue.getJobScheduler('task-reminder-124'), scheduler);
      await replaceTaskReminder(124, { ...repeat, endDate: 1 }, data);
      const remainingSchedulers = await queue.getJobSchedulers();
      assert.equal(remainingSchedulers.length, 0);

      const request = {
        body: { jsonrpc: '2.0', method: 'create', id: 'first', params: { name: 'Task' } },
        user: { sub: data.webId, lang: 'ru', tz: 'UTC' },
        accept: 'application/json',
      };
      assert.deepEqual(await executeApiRequest(request), { jsonrpc: '2.0', id: 'first', result: { id_task: 1 } });
      assert.deepEqual(await executeApiRequest({ ...request, body: { ...request.body, id: 'retry' } }), {
        jsonrpc: '2.0',
        id: 'retry',
        result: { id_task: 2 },
      });
      assert.equal(creates, 2);
      const initiallyCompletedJobs = await apiQueue.getCompleted();
      assert.equal(initiallyCompletedJobs.length, 0);

      const samples = { direct: [] as number[], queued: [] as number[] };
      for (let index = 0; index < 5; index++) {
        await sleep(1100);
        const body = { ...request.body, id: `direct-${index}` };
        const start = performance.now();
        await executeApiRequest({ ...request, body });
        samples.direct.push(performance.now() - start);
      }
      for (let index = 0; index < 5; index++) {
        await sleep(1100);
        const body = { ...request.body, id: `queued-${index}` };
        const start = performance.now();
        const job = await apiQueue.add('API', { ...request, body }, { jobId: randomUUID() });
        await job.waitUntilFinished(queueEvents);
        samples.queued.push(performance.now() - start);
      }
      const percentile = (values: number[], rank: number) => {
        const sorted = values.toSorted((a, b) => {
          return a - b;
        });
        return Math.round(sorted[Math.ceil(sorted.length * rank) - 1]);
      };
      const directBurstStart = performance.now();
      await Promise.all(
        Array.from({ length: 3 }, (_, index) => {
          return executeApiRequest({
            ...request,
            body: { ...request.body, id: `direct-burst-${index}` },
          });
        }),
      );
      const directBurstMs = Math.round(performance.now() - directBurstStart);
      const queuedBurstStart = performance.now();
      await Promise.all(
        Array.from({ length: 3 }, async (_, index) => {
          const job = await apiQueue.add(
            'API',
            {
              ...request,
              body: { ...request.body, id: `queued-burst-${index}` },
            },
            { jobId: randomUUID() },
          );
          return job.waitUntilFinished(queueEvents);
        }),
      );
      const queuedBurstMs = Math.round(performance.now() - queuedBurstStart);
      console.log('create dispatch latency ms (mocked SQL and ACTIVITY)', {
        direct: { p50: percentile(samples.direct, 0.5), p95: percentile(samples.direct, 0.95) },
        queued: { p50: percentile(samples.queued, 0.5), p95: percentile(samples.queued, 0.95) },
        burstOfThree: { direct: directBurstMs, queued: queuedBurstMs },
      });
      assert.equal(creates, 18);
      const completedJobs = await apiQueue.getCompleted();
      assert.equal(completedJobs.length, 8);
    } finally {
      await apiQueue.obliterate({ force: true });
      await closeApiQueue();
      await queue.obliterate({ force: true });
      await closeActivityQueue();
      await redis.quit();
    }
  },
);
