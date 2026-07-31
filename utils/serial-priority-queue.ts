export type QueuePriority = 'normal' | 'user';

interface QueuedWork {
  run: () => Promise<void>;
}

/**
 * One-at-a-time work queue with an explicit user lane. Work already running is
 * never interrupted; once it settles, a user action is served before routine
 * work that has not started yet.
 */
export class SerialPriorityQueue {
  private running = false;
  private readonly user: QueuedWork[] = [];
  private readonly normal: QueuedWork[] = [];

  enqueue<T>(work: () => Promise<T>, priority: QueuePriority = 'normal'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const item: QueuedWork = {
        run: async () => {
          try {
            resolve(await work());
          } catch (error) {
            reject(error);
          }
        },
      };
      (priority === 'user' ? this.user : this.normal).push(item);
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (true) {
        const next = this.user.shift() ?? this.normal.shift();
        if (!next) return;
        await next.run();
      }
    } finally {
      this.running = false;
      if (this.user.length || this.normal.length) void this.drain();
    }
  }
}
