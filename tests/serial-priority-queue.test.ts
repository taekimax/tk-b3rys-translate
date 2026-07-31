import { describe, expect, it } from 'vitest';
import { SerialPriorityQueue } from '@/utils/serial-priority-queue';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((done) => (resolve = done)), resolve };
}

describe('SerialPriorityQueue', () => {
  it('keeps work serial and serves a user retry before waiting routine work', async () => {
    const queue = new SerialPriorityQueue();
    const started = deferred<void>();
    const releaseFirst = deferred<void>();
    const order: string[] = [];

    const first = queue.enqueue(async () => {
      order.push('first');
      started.resolve();
      await releaseFirst.promise;
    });
    const routine = queue.enqueue(async () => {
      order.push('routine');
    });

    await started.promise;
    const retry = queue.enqueue(async () => {
      order.push('retry');
    }, 'user');
    releaseFirst.resolve();

    await Promise.all([first, routine, retry]);
    expect(order).toEqual(['first', 'retry', 'routine']);
  });
});
