const positiveNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const defaultServerAddress = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
).replace(/\/$/, '');

let apiBaseUrl = defaultServerAddress;
let webSocketUrl = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080/ws';

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function configureServerAddress(value: string): string {
  const candidate = value.trim().replace(/\/$/, '');
  const url = new URL(candidate);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error('Server address must be an HTTP(S) origin without credentials or a path.');
  }
  apiBaseUrl = url.origin;
  const socket = new URL('/ws', url.origin);
  socket.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  webSocketUrl = socket.toString();
  return apiBaseUrl;
}

export const runtimeConfig = {
  get apiBaseUrl(): string {
    return apiBaseUrl;
  },
  get webSocketUrl(): string {
    return webSocketUrl;
  },
  heartbeatIntervalMs: positiveNumber(import.meta.env.VITE_HEARTBEAT_INTERVAL_MS, 5_000),
  readyCheckSeconds: positiveNumber(import.meta.env.VITE_READY_CHECK_SECONDS, 20),
  get localBotFillAfterMs(): number {
    return isLoopback(new URL(apiBaseUrl).hostname)
      ? positiveNumber(import.meta.env.VITE_LOCAL_BOT_FILL_AFTER_MS, 5_000)
      : 0;
  },
} as const;
