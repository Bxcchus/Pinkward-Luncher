import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DemoInformationScreen } from './DemoInformationScreen';

describe('DemoInformationScreen', () => {
  it('explains both matchmaking modes for Riot reviewers', () => {
    render(<DemoInformationScreen route="matchmaking" />);
    expect(screen.getByRole('heading', { name: 'Community 5v5' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1v1 Showdown' })).toBeInTheDocument();
    expect(screen.getByText(/does not calculate or publish an alternative MMR or ELO/i)).toBeInTheDocument();
  });

  it('shows the required Riot legal notice', () => {
    render(<DemoInformationScreen route="terms" />);
    expect(screen.getByText(/Pinkward is not endorsed by Riot Games/i)).toBeInTheDocument();
  });

  it('exposes privacy and contact information', () => {
    const { rerender } = render(<DemoInformationScreen route="privacy" />);
    expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument();
    rerender(<DemoInformationScreen route="contact" />);
    expect(screen.getByRole('heading', { name: 'Contact Pinkward' })).toBeInTheDocument();
    expect(screen.getAllByText('contact@pinkward.lol').length).toBeGreaterThan(0);
  });
});
