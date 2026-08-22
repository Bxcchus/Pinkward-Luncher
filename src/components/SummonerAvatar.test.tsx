import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummonerAvatar } from './SummonerAvatar';

describe('SummonerAvatar', () => {
  it('renders the profile icon returned by League', () => {
    const { container } = render(
      <SummonerAvatar
        gameName="Claude Code"
        profileIconDataUrl="data:image/jpeg;base64,cHJvZmlsZS1pY29u"
      />,
    );

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,cHJvZmlsZS1pY29u',
    );
  });

  it('keeps the initial as a fallback', () => {
    const { container } = render(<SummonerAvatar gameName="Claude Code" />);
    expect(container).toHaveTextContent('C');
    expect(container.querySelector('img')).toBeNull();
  });
});
