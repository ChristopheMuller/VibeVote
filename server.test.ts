import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';

// Mock all external dependencies before importing server.ts
mock.module('dotenv/config', () => ({}));
mock.module('express', () => ({
  default: Object.assign(() => ({
    set: mock(),
    use: mock(),
    get: mock(),
    post: mock(),
    listen: mock(),
  }), {
    json: mock(() => ({})),
    static: mock(() => ({}))
  }),
}));
mock.module('vite', () => ({
  createServer: mock(async () => ({
    server: { middlewareMode: true },
    appType: 'spa',
    middlewares: mock(() => ({}))
  })),
}));
mock.module('cors', () => ({
  default: mock(() => ({}))
}));
mock.module('cookie-session', () => ({
  default: mock(() => ({}))
}));

// Mock the spotify-web-api-node module
mock.module('spotify-web-api-node', () => {
  return {
    default: mock((options) => {
      return {
        options,
        // Add any methods that might be called
        createAuthorizeURL: mock(() => 'http://auth.url'),
      };
    }),
  };
});

describe('getSpotifyApi', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear process.env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return a SpotifyWebApi instance with credentials when all env vars are present', async () => {
    const { getSpotifyApi } = await import('./server.js');
    process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
    process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret';
    process.env.SPOTIFY_REDIRECT_URI = 'http://localhost/callback';

    const api = getSpotifyApi();

    expect(api).toBeDefined();
    // Since we mocked SpotifyWebApi, it should return an object with the options we passed
    expect((api as any).options).toEqual({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost/callback',
    });
  });

  it('should return a SpotifyWebApi instance without credentials when SPOTIFY_CLIENT_ID is missing', async () => {
    const { getSpotifyApi } = await import('./server.js');
    delete process.env.SPOTIFY_CLIENT_ID;
    process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret';
    process.env.SPOTIFY_REDIRECT_URI = 'http://localhost/callback';

    const api = getSpotifyApi();

    expect(api).toBeDefined();
    expect((api as any).options).toBeUndefined();
  });

  it('should return a SpotifyWebApi instance without credentials when SPOTIFY_CLIENT_SECRET is missing', async () => {
    const { getSpotifyApi } = await import('./server.js');
    process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
    delete process.env.SPOTIFY_CLIENT_SECRET;
    process.env.SPOTIFY_REDIRECT_URI = 'http://localhost/callback';

    const api = getSpotifyApi();

    expect(api).toBeDefined();
    expect((api as any).options).toBeUndefined();
  });

  it('should return a SpotifyWebApi instance without credentials when SPOTIFY_REDIRECT_URI is missing', async () => {
    const { getSpotifyApi } = await import('./server.js');
    process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
    process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret';
    delete process.env.SPOTIFY_REDIRECT_URI;

    const api = getSpotifyApi();

    expect(api).toBeDefined();
    expect((api as any).options).toBeUndefined();
  });
});
