import type { LeagueDuelVictory } from '../domain/types';

export class DuelVictoryMonitor {
  private active = true;
  private inFlight = false;
  private completed = false;

  constructor(
    private readonly readVictory: () => Promise<LeagueDuelVictory | null>,
    private readonly recordVictory: (victory: LeagueDuelVictory) => Promise<void>,
  ) {}

  async poll(): Promise<void> {
    if (!this.active || this.inFlight || this.completed) return;
    this.inFlight = true;
    try {
      const victory = await this.readVictory();
      if (!victory || !this.active) return;
      await this.recordVictory(victory);
      this.completed = true;
    } finally {
      this.inFlight = false;
    }
  }

  stop(): void {
    this.active = false;
  }

  get isComplete(): boolean {
    return this.completed;
  }
}
