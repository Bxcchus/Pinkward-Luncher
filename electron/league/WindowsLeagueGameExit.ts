import { execFile } from 'node:child_process';

const POWERSHELL_TIMEOUT_MS = 5_000;

export type LeagueGameExitSignal =
  | 'ALT_F4_SENT'
  | 'UNSUPPORTED_PLATFORM'
  | 'GAME_WINDOW_NOT_FOUND'
  | 'ALT_F4_FAILED';

type CommandRunner = (file: string, args: string[]) => Promise<void>;

const ALT_F4_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class PinkwardLeagueWindow {
    private const byte VK_MENU = 0x12;
    private const byte VK_F4 = 0x73;
    private const uint KEYEVENTF_KEYUP = 0x0002;

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

    private static void PressAltF4() {
        keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
        keybd_event(VK_F4, 0, 0, UIntPtr.Zero);
        keybd_event(VK_F4, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static bool SendAltF4Twice(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero || !SetForegroundWindow(hWnd)) return false;
        System.Threading.Thread.Sleep(120);
        PressAltF4();
        // Give League enough time to render and focus its leave-confirmation dialog.
        System.Threading.Thread.Sleep(750);
        PressAltF4();
        return true;
    }
}
'@

$game = Get-Process -Name 'League of Legends' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1

if ($null -eq $game) { exit 2 }
if (-not [PinkwardLeagueWindow]::SendAltF4Twice($game.MainWindowHandle)) { exit 3 }
`;

const runCommand: CommandRunner = (file, args) => new Promise((resolve, reject) => {
  execFile(file, args, {
    windowsHide: true,
    timeout: POWERSHELL_TIMEOUT_MS,
  }, (error) => {
    if (error) reject(error);
    else resolve();
  });
});

function commandExitCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'number' ? error.code : null;
}

export async function simulateLeagueGameAltF4(
  platform: NodeJS.Platform = process.platform,
  runner: CommandRunner = runCommand,
): Promise<LeagueGameExitSignal> {
  if (platform !== 'win32') return 'UNSUPPORTED_PLATFORM';

  try {
    await runner('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Sta',
      '-Command',
      ALT_F4_SCRIPT,
    ]);
    return 'ALT_F4_SENT';
  } catch (error) {
    return commandExitCode(error) === 2 ? 'GAME_WINDOW_NOT_FOUND' : 'ALT_F4_FAILED';
  }
}
