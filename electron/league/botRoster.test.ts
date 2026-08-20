import { describe, expect, it } from 'vitest';
import { botPlanForRole, positionForRole } from './botRoster.js';

describe('local League test bot roster', () => {
  it('fills every missing allied role and all five enemy roles', () => {
    const plan = botPlanForRole('JUNGLE');
    expect(plan).toHaveLength(9);
    expect(plan.filter((bot) => bot.teamId === 100).map((bot) => bot.position))
      .toEqual(['TOP', 'MIDDLE', 'BOTTOM', 'UTILITY']);
    expect(plan.filter((bot) => bot.teamId === 200).map((bot) => bot.position))
      .toEqual(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
  });

  it('never places an allied bot on the player role', () => {
    for (const role of ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const) {
      const ownTeam = botPlanForRole(role).filter((bot) => bot.teamId === 100);
      const rolePosition = { TOP: 'TOP', JUNGLE: 'JUNGLE', MID: 'MIDDLE', ADC: 'BOTTOM', SUPPORT: 'UTILITY' }[role];
      expect(ownTeam).toHaveLength(4);
      expect(ownTeam.map((bot) => bot.position)).not.toContain(rolePosition);
    }
  });

  it('maps W3C roles to the position values expected by League', () => {
    expect(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'].map((role) =>
      positionForRole(role as 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT')))
      .toEqual(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
  });
});
