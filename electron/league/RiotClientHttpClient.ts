import { readFile } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';

const MAX_RESPONSE_BYTES = 256 * 1024;

interface RiotClientConnection {
  port: number;
  password: string;
}

export class RiotClientHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly diagnosticCode: string,
  ) {
    super(`Riot Client request failed (${statusCode})`);
  }
}

export function parseRiotClientLockfile(value: string): RiotClientConnection {
  const parts = value.trim().split(':');
  const port = Number(parts[2]);
  if (
    parts.length !== 5 ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    !parts[3] ||
    parts[4] !== 'https'
  ) {
    throw new RiotClientHttpError(0, 'RIOT_CLIENT_LOCKFILE_INVALID');
  }
  return { port, password: parts[3] };
}

export class RiotClientHttpClient {
  private constructor(private readonly connection: RiotClientConnection) {}

  static async connect(): Promise<RiotClientHttpClient> {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      throw new RiotClientHttpError(0, 'RIOT_CLIENT_LOCKFILE_NOT_FOUND');
    }

    try {
      const value = await readFile(
        path.join(localAppData, 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
        'utf8',
      );
      return new RiotClientHttpClient(parseRiotClientLockfile(value));
    } catch (error) {
      if (error instanceof RiotClientHttpError) throw error;
      throw new RiotClientHttpError(0, 'RIOT_CLIENT_LOCKFILE_NOT_FOUND');
    }
  }

  async isLeagueLaunchEligible(): Promise<boolean> {
    return this.request<boolean>(
      'GET',
      '/product-launcher/v1/products/league_of_legends/patchlines/live/eligibility',
    );
  }

  async launchLeague(): Promise<string> {
    return this.request<string>(
      'POST',
      '/product-launcher/v1/products/league_of_legends/patchlines/live',
      {},
    );
  }

  private async request<T>(
    method: 'GET' | 'POST',
    requestPath: string,
    body?: unknown,
  ): Promise<T> {
    if (!requestPath.startsWith('/') || requestPath.includes('://')) {
      throw new RiotClientHttpError(0, 'RIOT_CLIENT_PATH_REJECTED');
    }

    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise<T>((resolve, reject) => {
      const request = https.request(
        {
          hostname: '127.0.0.1',
          port: this.connection.port,
          path: requestPath,
          method,
          auth: `riot:${this.connection.password}`,
          rejectUnauthorized: false,
          headers: payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : undefined,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let length = 0;
          response.on('data', (chunk: Buffer) => {
            length += chunk.length;
            if (length > MAX_RESPONSE_BYTES) {
              request.destroy(new Error('Riot Client response exceeded the safety limit'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            const status = response.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              reject(new RiotClientHttpError(status, `RIOT_CLIENT_HTTP_${status || 'NO_STATUS'}`));
              return;
            }
            const text = Buffer.concat(chunks).toString('utf8').trim();
            if (!text) {
              resolve(undefined as T);
              return;
            }
            try {
              resolve(JSON.parse(text) as T);
            } catch {
              reject(new RiotClientHttpError(status, 'RIOT_CLIENT_RESPONSE_INVALID_JSON'));
            }
          });
        },
      );
      request.setTimeout(5_000, () => request.destroy(new Error('Riot Client request timed out')));
      request.on('error', () =>
        reject(new RiotClientHttpError(0, 'RIOT_CLIENT_CONNECTION_FAILED')),
      );
      if (payload) request.write(payload);
      request.end();
    });
  }
}
