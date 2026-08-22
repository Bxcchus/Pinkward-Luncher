import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class LcuHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly diagnosticCode: string,
  ) {
    super(`LCU request failed (${statusCode})`);
  }
}

interface LockfileConnection {
  port: number;
  password: string;
}

interface RiotClientInstallManifest {
  associated_client?: Record<string, unknown>;
}

export class LcuHttpClient {
  private constructor(private readonly connection: LockfileConnection) {}

  static async connect(preferredDirectory?: string | null): Promise<LcuHttpClient> {
    const installedDirectories = await installedLeagueDirectories();
    const processDirectory = installedDirectories.length === 0
      ? await runningInstallationDirectory()
      : null;
    const directories = [...new Set([
      ...(preferredDirectory ? [preferredDirectory] : []),
      ...installedDirectories,
      ...(processDirectory ? [processDirectory] : []),
    ])];
    if (directories.length === 0) throw new LcuHttpError(0, 'LCU_PROCESS_NOT_RUNNING');

    for (const directory of directories) {
      let value: string;
      try {
        value = (await readFile(path.join(directory, 'lockfile'), 'utf8')).trim();
      } catch {
        continue;
      }

      const parts = value.split(':');
      const port = Number(parts[2]);
      if (
        parts.length !== 5 ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65_535 ||
        !parts[3] ||
        parts[4] !== 'https'
      ) {
        throw new LcuHttpError(0, 'LCU_LOCKFILE_INVALID');
      }
      return new LcuHttpClient({ port, password: parts[3] });
    }
    throw new LcuHttpError(0, 'LCU_PROCESS_NOT_RUNNING');
  }

  async get<T>(requestPath: string): Promise<T> {
    return this.request<T>('GET', requestPath);
  }

  async post<T>(requestPath: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', requestPath, body);
  }

  async put<T>(requestPath: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', requestPath, body);
  }

  async getImageDataUrl(requestPath: string): Promise<string> {
    if (!requestPath.startsWith('/') || requestPath.includes('://')) {
      throw new LcuHttpError(0, 'LCU_PATH_REJECTED');
    }

    return new Promise<string>((resolve, reject) => {
      const request = https.request(
        {
          hostname: '127.0.0.1',
          port: this.connection.port,
          path: requestPath,
          method: 'GET',
          auth: `riot:${this.connection.password}`,
          rejectUnauthorized: false,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let length = 0;
          response.on('data', (chunk: Buffer) => {
            length += chunk.length;
            if (length > MAX_RESPONSE_BYTES) {
              request.destroy(new Error('LCU image exceeded the safety limit'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            const status = response.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              reject(new LcuHttpError(status, `LCU_HTTP_${status || 'NO_STATUS'}`));
              return;
            }
            const contentTypeHeader = response.headers['content-type'];
            const contentType = (Array.isArray(contentTypeHeader)
              ? contentTypeHeader[0]
              : contentTypeHeader
            )?.split(';', 1)[0]?.trim().toLowerCase();
            if (!contentType || !['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
              reject(new LcuHttpError(status, 'LCU_IMAGE_CONTENT_TYPE_REJECTED'));
              return;
            }
            resolve(`data:${contentType};base64,${Buffer.concat(chunks).toString('base64')}`);
          });
        },
      );
      request.setTimeout(5_000, () => request.destroy(new Error('LCU image request timed out')));
      request.on('error', () => reject(new LcuHttpError(0, 'LCU_CONNECTION_FAILED')));
      request.end();
    });
  }

  private async request<T>(method: 'GET' | 'POST' | 'PUT', requestPath: string, body?: unknown): Promise<T> {
    if (!requestPath.startsWith('/') || requestPath.includes('://')) {
      throw new LcuHttpError(0, 'LCU_PATH_REJECTED');
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
              request.destroy(new Error('LCU response exceeded the safety limit'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            const status = response.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              reject(new LcuHttpError(status, `LCU_HTTP_${status || 'NO_STATUS'}`));
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
              reject(new LcuHttpError(status, 'LCU_RESPONSE_INVALID_JSON'));
            }
          });
        },
      );
      request.setTimeout(5_000, () => request.destroy(new Error('LCU request timed out')));
      request.on('error', () => reject(new LcuHttpError(0, 'LCU_CONNECTION_FAILED')));
      if (payload) request.write(payload);
      request.end();
    });
  }
}

export async function runningInstallationDirectory(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  try {
    const script =
      "(Get-Process -Name LeagueClientUx -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path)";
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ], {
      windowsHide: true,
      timeout: 2_500,
      maxBuffer: 64 * 1024,
    });
    const executable = stdout.trim();
    return executable ? path.dirname(executable) : null;
  } catch {
    return null;
  }
}

export async function installedLeagueDirectories(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const systemDrive = process.env.SystemDrive ?? process.env.SYSTEMDRIVE ?? 'C:';
  const programData =
    process.env.ProgramData ?? process.env.PROGRAMDATA ?? path.join(systemDrive, 'ProgramData');
  try {
    const raw = await readFile(path.join(programData, 'Riot Games', 'RiotClientInstalls.json'), 'utf8');
    const manifest = JSON.parse(raw) as RiotClientInstallManifest;
    return Object.keys(manifest.associated_client ?? {})
      .map((candidate) => candidate.replace(/[\\/]+$/, ''))
      .filter(
        (candidate) =>
          path.isAbsolute(candidate) && path.basename(candidate).toLowerCase() === 'league of legends',
      );
  } catch {
    return [];
  }
}
