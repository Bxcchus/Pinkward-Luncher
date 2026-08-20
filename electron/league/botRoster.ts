import type { BotFillRole } from './types.js';

export interface TestLobbyBot {
  championId: number;
  teamId: 100 | 200;
  position: 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY';
}

const position: Record<BotFillRole, TestLobbyBot['position']> = {
  TOP: 'TOP',
  JUNGLE: 'JUNGLE',
  MID: 'MIDDLE',
  ADC: 'BOTTOM',
  SUPPORT: 'UTILITY',
};

const blueChampions: Record<BotFillRole, number> = {
  TOP: 86,
  JUNGLE: 19,
  MID: 1,
  ADC: 22,
  SUPPORT: 16,
};

const redChampions: Record<BotFillRole, number> = {
  TOP: 122,
  JUNGLE: 32,
  MID: 99,
  ADC: 51,
  SUPPORT: 89,
};

const roles = Object.keys(position) as BotFillRole[];

export function positionForRole(role: BotFillRole): TestLobbyBot['position'] {
  return position[role];
}

export function botPlanForRole(playerRole: BotFillRole): TestLobbyBot[] {
  return [
    ...roles
      .filter((role) => role !== playerRole)
      .map((role) => ({ championId: blueChampions[role], teamId: 100 as const, position: position[role] })),
    ...roles.map((role) => ({
      championId: redChampions[role],
      teamId: 200 as const,
      position: position[role],
    })),
  ];
}
