import WebSocket, { type RawData } from 'ws';
import { LcuHttpClient, type LcuWebSocketConnection } from './LcuHttpClient.js';

const GAMEFLOW_PHASE_URI = '/lol-gameflow/v1/gameflow-phase';
const GAMEFLOW_SESSION_URI = '/lol-gameflow/v1/session';
const JSON_API_TOPIC = 'OnJsonApiEvent';

export interface LeagueGameflowEvent {
  type: 'CONNECTED' | 'GAMEFLOW_CHANGED';
  phase?: string;
  observedAt: string;
}

interface LcuJsonApiEvent {
  uri?: unknown;
  eventType?: unknown;
  data?: unknown;
}

export interface EventSocket {
  on(event: 'open', listener: () => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: () => void): this;
  on(event: 'message', listener: (data: RawData) => void): this;
  send(data: string): void;
  close(): void;
  terminate(): void;
}

type ConnectionProvider = () => Promise<LcuWebSocketConnection>;
type SocketFactory = (connection: LcuWebSocketConnection) => EventSocket;
type TimeoutScheduler = (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;

function phaseFromEvent(event: LcuJsonApiEvent): string | undefined {
  if (event.uri === GAMEFLOW_PHASE_URI && typeof event.data === 'string') return event.data;
  if (
    event.uri === GAMEFLOW_SESSION_URI &&
    typeof event.data === 'object' &&
    event.data !== null &&
    'phase' in event.data &&
    typeof event.data.phase === 'string'
  ) {
    return event.data.phase;
  }
  return undefined;
}

export function parseLcuGameflowMessage(data: RawData): Omit<LeagueGameflowEvent, 'observedAt'> | null {
  let message: unknown;
  try {
    message = JSON.parse(data.toString());
  } catch {
    return null;
  }
  if (!Array.isArray(message) || message[0] !== 8 || message[1] !== JSON_API_TOPIC) return null;
  const event = message[2];
  if (typeof event !== 'object' || event === null) return null;
  const apiEvent = event as LcuJsonApiEvent;
  if (apiEvent.uri !== GAMEFLOW_PHASE_URI && apiEvent.uri !== GAMEFLOW_SESSION_URI) return null;
  const phase = phaseFromEvent(apiEvent);
  return { type: 'GAMEFLOW_CHANGED', ...(phase ? { phase } : {}) };
}

function defaultSocketFactory(connection: LcuWebSocketConnection): EventSocket {
  return new WebSocket(connection.url, 'wamp', {
    headers: { Authorization: connection.authorization },
    rejectUnauthorized: false,
    handshakeTimeout: 5_000,
  });
}

export class LcuEventClient {
  private socket: EventSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private running = false;

  constructor(
    private readonly onEvent: (event: LeagueGameflowEvent) => void,
    private readonly connectionProvider: ConnectionProvider = async () =>
      (await LcuHttpClient.connect()).webSocketConnection(),
    private readonly socketFactory: SocketFactory = defaultSocketFactory,
    private readonly scheduleTimeout: TimeoutScheduler = setTimeout,
    private readonly clearScheduledTimeout: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
    private readonly reconnectDelayMs = 1_000,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    void this.connect(this.generation);
  }

  restart(): void {
    this.stopConnection();
    this.running = true;
    this.generation += 1;
    void this.connect(this.generation);
  }

  stop(): void {
    this.running = false;
    this.generation += 1;
    this.stopConnection();
  }

  private stopConnection(): void {
    if (this.retryTimer) {
      this.clearScheduledTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.close();
      socket.terminate();
    }
  }

  private async connect(generation: number): Promise<void> {
    try {
      const connection = await this.connectionProvider();
      if (!this.running || generation !== this.generation) return;
      const socket = this.socketFactory(connection);
      this.socket = socket;
      socket.on('open', () => {
        if (!this.isCurrent(socket, generation)) return;
        socket.send(JSON.stringify([5, JSON_API_TOPIC]));
        this.onEvent({ type: 'CONNECTED', observedAt: new Date().toISOString() });
      });
      socket.on('message', (data) => {
        if (!this.isCurrent(socket, generation)) return;
        const event = parseLcuGameflowMessage(data);
        if (event) this.onEvent({ ...event, observedAt: new Date().toISOString() });
      });
      socket.on('error', () => {
        if (this.isCurrent(socket, generation)) socket.terminate();
      });
      socket.on('close', () => {
        if (!this.isCurrent(socket, generation)) return;
        this.socket = null;
        this.scheduleReconnect(generation);
      });
    } catch {
      this.scheduleReconnect(generation);
    }
  }

  private isCurrent(socket: EventSocket, generation: number): boolean {
    return this.running && generation === this.generation && socket === this.socket;
  }

  private scheduleReconnect(generation: number): void {
    if (!this.running || generation !== this.generation || this.retryTimer) return;
    this.retryTimer = this.scheduleTimeout(() => {
      this.retryTimer = null;
      void this.connect(generation);
    }, this.reconnectDelayMs);
  }
}
