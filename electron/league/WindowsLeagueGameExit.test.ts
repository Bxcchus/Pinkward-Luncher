import { describe, expect, it, vi } from 'vitest';
import { simulateLeagueGameAltF4 } from './WindowsLeagueGameExit.js';

describe('Windows League game Alt+F4 fallback', () => {
  it('does not execute outside Windows', async () => {
    const runner = vi.fn(async (file: string, args: string[]) => {
      void file;
      void args;
    });

    await expect(simulateLeagueGameAltF4('linux', runner)).resolves.toBe('UNSUPPORTED_PLATFORM');
    expect(runner).not.toHaveBeenCalled();
  });

  it('targets a static PowerShell command on Windows', async () => {
    const runner = vi.fn(async (file: string, args: string[]) => {
      void file;
      void args;
    });

    await expect(simulateLeagueGameAltF4('win32', runner)).resolves.toBe('ALT_F4_SENT');
    expect(runner).toHaveBeenCalledOnce();
    expect(runner.mock.calls[0]?.[0]).toBe('powershell.exe');
    expect(runner.mock.calls[0]?.[1]).toContain('-NonInteractive');
    const script = runner.mock.calls[0]?.[1].at(-1) ?? '';
    expect(script).toContain("Get-Process -Name 'League of Legends'");
    expect(script).toContain('SendAltF4Twice');
    expect(script.match(/PressAltF4\(\);/g)).toHaveLength(2);
    expect(script).toContain('Sleep(750)');
  });

  it('reports a missing League game window without targeting another application', async () => {
    const runner = vi.fn(async (file: string, args: string[]) => {
      void file;
      void args;
      throw Object.assign(new Error('not found'), { code: 2 });
    });

    await expect(simulateLeagueGameAltF4('win32', runner)).resolves.toBe('GAME_WINDOW_NOT_FOUND');
  });
});
