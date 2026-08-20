import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('W3C-LoL companion', () => {
  it('lets a player opt into simulation and reach the functional home screen', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /connect your identity/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/riot id/i), { target: { value: 'Summoner' } });
    fireEvent.change(screen.getByLabelText(/tag line/i), { target: { value: 'EUW' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /simulation mode/i }));
    fireEvent.click(screen.getByRole('button', { name: /enter demo/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome back, summoner/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /find a match/i })).toBeEnabled();
  });
});
