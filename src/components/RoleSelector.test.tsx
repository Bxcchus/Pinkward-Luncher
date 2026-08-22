import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoleLoadout } from './RoleSelector';

describe('RoleLoadout', () => {
  afterEach(cleanup);

  it('allows the secondary role to be selected as primary so the reducer can swap them', () => {
    const onPrimaryChange = vi.fn();
    render(
      <RoleLoadout
        primaryRole="TOP"
        secondaryRole="JUNGLE"
        onPrimaryChange={onPrimaryChange}
        onSecondaryChange={vi.fn()}
      />,
    );

    const primary = screen.getByRole('radiogroup', { name: 'PRIMARY' });
    const jungle = within(primary).getByRole('radio', { name: 'Jungle, swap with secondary' });
    expect(jungle).toBeEnabled();
    fireEvent.click(jungle);
    expect(onPrimaryChange).toHaveBeenCalledWith('JUNGLE');
  });

  it('allows the primary role to be selected as secondary', () => {
    const onSecondaryChange = vi.fn();
    render(
      <RoleLoadout
        primaryRole="MID"
        secondaryRole="ADC"
        onPrimaryChange={vi.fn()}
        onSecondaryChange={onSecondaryChange}
      />,
    );

    const secondary = screen.getByRole('radiogroup', { name: 'SECONDARY' });
    const mid = within(secondary).getByRole('radio', { name: 'Mid, swap with primary' });
    expect(mid).toBeEnabled();
    fireEvent.click(mid);
    expect(onSecondaryChange).toHaveBeenCalledWith('MID');
  });
});
