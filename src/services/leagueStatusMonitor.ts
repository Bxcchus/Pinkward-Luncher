type IntervalHandle = number;

export class LeagueStatusMonitor {
  private active = false;
  private inFlight = false;
  private rerunRequested = false;
  private interval: IntervalHandle | null = null;

  constructor(
    private readonly operation: () => Promise<void>,
    private readonly intervalMs = 5_000,
    private readonly scheduleInterval: (
      callback: () => void,
      delayMs: number,
    ) => IntervalHandle = (callback, delayMs) => window.setInterval(callback, delayMs),
    private readonly clearScheduledInterval: (handle: IntervalHandle) => void = (handle) =>
      window.clearInterval(handle),
  ) {}

  start(): void {
    if (this.active) return;
    this.active = true;
    void this.trigger();
    this.interval = this.scheduleInterval(() => void this.trigger(), this.intervalMs);
  }

  notifyEvent(): void {
    if (this.active) void this.trigger();
  }

  stop(): void {
    this.active = false;
    this.rerunRequested = false;
    if (this.interval !== null) {
      this.clearScheduledInterval(this.interval);
      this.interval = null;
    }
  }

  private async trigger(): Promise<void> {
    if (!this.active) return;
    if (this.inFlight) {
      this.rerunRequested = true;
      return;
    }
    this.inFlight = true;
    try {
      await this.operation();
    } finally {
      this.inFlight = false;
      if (this.active && this.rerunRequested) {
        this.rerunRequested = false;
        void this.trigger();
      }
    }
  }
}
