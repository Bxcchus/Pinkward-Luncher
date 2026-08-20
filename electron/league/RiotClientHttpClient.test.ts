import { describe, expect, it } from 'vitest';
import { parseRiotClientLockfile, RiotClientHttpError } from './RiotClientHttpClient.js';

describe('parseRiotClientLockfile', () => {
  it('reads the local HTTPS connection without exposing it in errors', () => {
    expect(parseRiotClientLockfile('Riot Client:1234:45678:local-secret:https')).toEqual({
      port: 45678,
      password: 'local-secret',
    });
  });

  it.each([
    '',
    'Riot Client:1234:0:secret:https',
    'Riot Client:1234:45678::https',
    'Riot Client:1234:45678:secret:http',
  ])('rejects an invalid lockfile (%s)', (value) => {
    expect(() => parseRiotClientLockfile(value)).toThrowError(RiotClientHttpError);
  });
});
