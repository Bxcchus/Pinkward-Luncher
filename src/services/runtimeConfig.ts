const positiveNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const isWebDemo = import.meta.env.VITE_WEB_DEMO === 'true';

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isPrivateHostname(hostname: string): boolean {
  if (isLoopback(hostname)) return true;
  if (/^10(?:\.|$)/.test(hostname) || /^192\.168(?:\.|$)/.test(hostname)) return true;
  const match = /^172\.(\d{1,2})(?:\.|$)/.exec(hostname);
  return match !== null && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

function serverUrl(value: string): URL {
  const trimmed = value.trim().replace(/\/$/, '');
  if (!trimmed) throw new Error('Server address is required.');
  const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
  const provisional = hasProtocol ? trimmed : `https://${trimmed}`;
  let url = new URL(provisional);
  if (!hasProtocol && isPrivateHostname(url.hostname)) {
    url = new URL(`http://${trimmed}`);
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error('Server address must be a domain or an HTTP(S) origin without a path.');
  }
  return url;
}

export const defaultServerAddress = serverUrl(
  import.meta.env.VITE_API_BASE_URL ?? 'play.pinkward.lol',
).origin;

let apiBaseUrl = defaultServerAddress;
const defaultSocket = new URL('/ws', defaultServerAddress);
defaultSocket.protocol = defaultSocket.protocol === 'https:' ? 'wss:' : 'ws:';
let webSocketUrl = import.meta.env.VITE_WS_URL ?? defaultSocket.toString();

export function configureServerAddress(value: string): string {
  const url = serverUrl(value);
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
