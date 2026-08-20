import { describe, expect, it } from 'vitest';
import { shouldCloseInactiveGameflow } from './gameflowExit';

describe('inactive League gameflow', () => {
  it('closes a champion select after two consecutive inactive observations', () => {
    expect(shouldCloseInactiveGameflow('CHAMP_SELECT', 1, true)).toBe(false);
    expect(shouldCloseInactiveGameflow('CHAMP_SELECT', 2, true)).toBe(true);
  });

  it('allows match history time to appear after a real game', () => {
    expect(shouldCloseInactiveGameflow('IN_GAME', 5, true)).toBe(false);
    expect(shouldCloseInactiveGameflow('IN_GAME', 6, true)).toBe(true);
  });

  it('closes quickly when League never exposed a game id', () => {
    expect(shouldCloseInactiveGameflow('IN_GAME', 2, false)).toBe(true);
  });
});
