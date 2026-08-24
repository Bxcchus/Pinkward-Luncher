import { afterEach, describe, expect, it, vi } from 'vitest';
import { W3cApiClient } from './apiClient';

describe('W3cApiClient web preferences', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads and updates the authenticated public profile preferences', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        publicProfile: false,
        showMatchHistory: false,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        publicProfile: true,
        showMatchHistory: true,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const api = new W3cApiClient();

    await expect(api.getWebPreferences()).resolves.toEqual({
      publicProfile: false,
      showMatchHistory: false,
    });
    await expect(api.updateWebPreferences({
      publicProfile: true,
      showMatchHistory: true,
    })).resolves.toEqual({
      publicProfile: true,
      showMatchHistory: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://play.pinkward.lol/api/v1/web/me/preferences',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://play.pinkward.lol/api/v1/web/me/preferences',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ publicProfile: true, showMatchHistory: true }),
      }),
    );
  });
});
