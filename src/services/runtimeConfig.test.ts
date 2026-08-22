import { afterEach, describe, expect, it } from 'vitest';
import { configureServerAddress, runtimeConfig } from './runtimeConfig';

describe('custom matchmaking server configuration', () => {
  afterEach(() => configureServerAddress('http://localhost:8080'));

  it('derives the WebSocket endpoint from a remote HTTP server', () => {
    expect(configureServerAddress('http://192.168.1.12:8080/')).toBe('http://192.168.1.12:8080');
    expect(runtimeConfig.webSocketUrl).toBe('ws://192.168.1.12:8080/ws');
    expect(runtimeConfig.localBotFillAfterMs).toBe(0);
  });

  it('uses WSS when the server is HTTPS', () => {
    configureServerAddress('https://match.example.test');
    expect(runtimeConfig.webSocketUrl).toBe('wss://match.example.test/ws');
  });

  it('adds HTTPS automatically to a public domain', () => {
    expect(configureServerAddress('play.pinkward.lol')).toBe('https://play.pinkward.lol');
    expect(runtimeConfig.webSocketUrl).toBe('wss://play.pinkward.lol/ws');
  });

  it('keeps bare private addresses on HTTP for local testing', () => {
    expect(configureServerAddress('192.168.1.12:8080')).toBe('http://192.168.1.12:8080');
    expect(runtimeConfig.webSocketUrl).toBe('ws://192.168.1.12:8080/ws');
  });

  it('rejects credentials, paths, and non-HTTP protocols', () => {
    expect(() => configureServerAddress('http://user:secret@host:8080')).toThrow();
    expect(() => configureServerAddress('http://host:8080/api')).toThrow();
    expect(() => configureServerAddress('play.pinkward.lol/api')).toThrow();
    expect(() => configureServerAddress('file:///tmp/server')).toThrow();
  });
});
