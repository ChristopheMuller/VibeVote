import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import SpotifyWebApi from 'spotify-web-api-node';
import cors from 'cors';
import cookieSession from 'cookie-session';
import { fileURLToPath } from 'url';
import { getAccessToken } from './src/auth-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getSpotifyApi = () => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    console.warn('Spotify credentials missing. Authentication will fail.');
    return new SpotifyWebApi();
  }

  console.log(`Initializing Spotify API with Redirect URI: ${redirectUri}`);

  return new SpotifyWebApi({
    clientId,
    clientSecret,
    redirectUri,
  });
};

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const PORT = 3000;
  const spotifyApi = getSpotifyApi();
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  
  console.log('Spotify API initialized with:');
  console.log('  Client ID:', process.env.SPOTIFY_CLIENT_ID ? `${process.env.SPOTIFY_CLIENT_ID.substring(0, 4)}...` : 'Missing');
  console.log('  Client Secret:', process.env.SPOTIFY_CLIENT_SECRET ? `${process.env.SPOTIFY_CLIENT_SECRET.substring(0, 4)}...` : 'Missing');
  console.log('  Redirect URI:', redirectUri || 'Missing');

  app.use(cors());
  app.use(express.json());
  
  app.get('/api/health', (req, res) => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    res.json({ 
      status: 'ok',
      spotify: {
        clientId: !!clientId,
        clientSecret: !!process.env.SPOTIFY_CLIENT_SECRET,
        redirectUri: !!process.env.SPOTIFY_REDIRECT_URI,
        clientIdPrefix: clientId ? clientId.substring(0, 4) : null,
        configuredRedirectUri: process.env.SPOTIFY_REDIRECT_URI
      }
    });
  });

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && process.env.NODE_ENV === 'production') {
    console.error('CRITICAL: SESSION_SECRET environment variable is missing in production!');
    process.exit(1);
  }

  app.use(cookieSession({
    name: 'session',
    keys: [sessionSecret || 'spotify-vote-secret-dev-fallback'],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  }));

  // Spotify Auth Routes
  app.get('/api/auth/url', (req, res) => {
    const scopes = [
      'user-read-private',
      'user-read-email',
      'playlist-read-private',
      'playlist-read-collaborative',
      'user-modify-playback-state',
      'user-read-playback-state',
      'streaming'
    ];
    
    const configuredRedirectUri = process.env.SPOTIFY_REDIRECT_URI;
    const currentOrigin = `${req.protocol}://${req.get('host')}`;
    const expectedRedirectUri = `${currentOrigin}/api/auth/callback`;
    
    if (configuredRedirectUri && configuredRedirectUri !== expectedRedirectUri) {
      console.warn(`Mismatched Redirect URI! Configured: ${configuredRedirectUri}, Expected: ${expectedRedirectUri}`);
    }

    let authorizeURL = spotifyApi.createAuthorizeURL(scopes, 'state');
    if (req.query.show_dialog === 'true') {
      authorizeURL += '&show_dialog=true';
    }
    
    res.json({ url: authorizeURL });
  });

  app.get('/api/auth/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET || !process.env.SPOTIFY_REDIRECT_URI) {
      return res.status(500).send('Spotify credentials missing in environment variables.');
    }

    const api = getSpotifyApi();
    
    try {
      const data = await api.authorizationCodeGrant(code as string);
      const { access_token, refresh_token } = data.body;
      
      // Store in session
      req.session!.accessToken = access_token;
      req.session!.refreshToken = refresh_token;

      console.log('Spotify authentication successful for user.');

      res.send(`
        <html>
          <body style="background: #09090b; color: #f4f4f5; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="text-align: center; padding: 20px;">
              <div style="color: #10b981; font-size: 64px; margin-bottom: 24px;">✓</div>
              <h1 style="margin: 0 0 12px; font-size: 32px;">Connected!</h1>
              <p style="color: #a1a1aa; font-size: 18px; margin-bottom: 32px;">Your Spotify account is now linked.</p>
              <p style="color: #71717a; font-size: 14px; margin-bottom: 12px;">This window will close automatically.</p>
              <a href="/" style="color: #10b981; text-decoration: none; font-size: 14px; border: 1px solid #10b981; padding: 8px 16px; border-radius: 8px;">Return to App</a>
              
              <script>
                const token = ${JSON.stringify(access_token)};
                const appOrigin = window.location.origin;
                
                // 1. Set localStorage as a reliable fallback
                try {
                  localStorage.setItem('spotify_access_token', token);
                  console.log('Token saved to localStorage');
                } catch (e) {
                  console.error('Failed to save to localStorage', e);
                }

                // 2. Try to notify the opener window
                if (window.opener) {
                  try {
                    window.opener.postMessage({ 
                      type: 'OAUTH_AUTH_SUCCESS', 
                      accessToken: token 
                    }, '*');
                    console.log('Opener notified via postMessage');
                  } catch (e) {
                    console.error('Failed to postMessage to opener', e);
                  }
                }

                // 3. Close the window
                setTimeout(() => {
                  window.close();
                  // Fallback if window.close() is blocked
                  setTimeout(() => {
                    if (!window.closed) {
                      const btn = document.createElement('button');
                      btn.textContent = 'Close Window';
                      btn.style.cssText = 'margin-top: 20px; background: #10b981; color: #000; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; display: block; margin-left: auto; margin-right: auto;';
                      btn.onclick = () => window.close();
                      document.body.querySelector('div').appendChild(btn);
                    }
                  }, 1000);
                }, 1500);
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error('Error during Spotify auth:', err);
      let detail = 'Unknown error';
      if (err.body && err.body.error_description) {
        detail = err.body.error_description;
      } else if (err.message) {
        detail = err.message;
      }

      res.status(500).send(`
        <html>
          <body style="background: #09090b; color: #f4f4f5; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="text-align: center; max-width: 400px; padding: 20px;">
              <div style="color: #ef4444; font-size: 48px; margin-bottom: 16px;">✕</div>
              <h1 style="margin: 0 0 8px;">Authentication Failed</h1>
              <p style="color: #a1a1aa; margin-bottom: 24px;">${detail}</p>
              <div style="background: #18181b; padding: 16px; border-radius: 12px; text-align: left; margin-bottom: 24px;">
                <p style="font-size: 12px; color: #71717a; margin-bottom: 8px;">Common fixes:</p>
                <ul style="font-size: 11px; color: #a1a1aa; padding-left: 20px;">
                  <li>Ensure <b>SPOTIFY_REDIRECT_URI</b> in AI Studio matches your Spotify Dashboard.</li>
                  <li>Check that your <b>Client Secret</b> is correct.</li>
                  <li>Your Redirect URI should be: <br/><code style="color: #10b981;">${req.protocol}://${req.get('host')}/api/auth/callback</code></li>
                </ul>
              </div>
              <button onclick="window.close()" style="background: #27272a; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">Close Window</button>
            </div>
          </body>
        </html>
      `);
    }
  });

  const refreshSpotifyToken = async (req: express.Request) => {
    const refreshToken = req.session?.refreshToken;
    if (!refreshToken) return null;

    const api = getSpotifyApi();
    api.setRefreshToken(refreshToken);
    
    try {
      const data = await api.refreshAccessToken();
      const newAccessToken = data.body.access_token;
      req.session!.accessToken = newAccessToken;
      console.log('Successfully refreshed Spotify access token');
      return newAccessToken;
    } catch (err) {
      console.error('Failed to refresh Spotify token:', err);
      return null;
    }
  };

  const handleSpotifyError = async (req: express.Request, res: express.Response, err: any, context: string, retryFn?: (newToken: string) => Promise<void>) => {
    const statusCode = err.statusCode || err.status || 500;
    
    // If 401 and we have a retry function, try refreshing
    if (statusCode === 401 && retryFn) {
      console.log(`Attempting to refresh token for context: ${context}`);
      const newToken = await refreshSpotifyToken(req);
      if (newToken) {
        try {
          res.setHeader('X-Refreshed-Token', newToken);
          res.setHeader('Access-Control-Expose-Headers', 'X-Refreshed-Token');
          await retryFn(newToken);
          return; // Success on retry
        } catch (retryErr: any) {
          // If retry also fails, fall through to error handling
          err = retryErr;
        }
      }
    }

    const message = err.message || (err.body && err.body.error && err.body.error.message) || 'Unknown Spotify API error';
    
    console.error(`Spotify Error [${context}]:`, {
      statusCode,
      message,
      body: err.body
    });

    res.status(statusCode).json({
      error: `Failed to ${context}`,
      message: message,
      details: err.body
    });
  };

  app.get('/api/me', async (req, res) => {
    const accessToken = getAccessToken(req);
    if (!accessToken) return res.status(401).json({ error: 'Not authenticated' });
    
    const fetchMe = async (token: string) => {
      const api = new SpotifyWebApi({ accessToken: token });
      const me = await api.getMe();
      res.json(me.body);
    };

    try {
      await fetchMe(accessToken);
    } catch (err: any) {
      await handleSpotifyError(req, res, err, 'fetch user profile', async (newToken: string) => { await fetchMe(newToken); });
    }
  });

  app.get('/api/playlists', async (req, res) => {
    const accessToken = getAccessToken(req);
    if (!accessToken) return res.status(401).json({ error: 'Not authenticated' });
    
    const fetchPlaylists = async (token: string) => {
      const api = new SpotifyWebApi({ accessToken: token });
      const playlists = await api.getUserPlaylists();
      res.json(playlists.body.items);
    };

    try {
      await fetchPlaylists(accessToken);
    } catch (err: any) {
      await handleSpotifyError(req, res, err, 'fetch playlists', async (newToken: string) => { await fetchPlaylists(newToken); });
    }
  });

  app.get('/api/playlist/:id/tracks', async (req, res) => {
    const accessToken = getAccessToken(req);
    if (!accessToken) return res.status(401).json({ error: 'Not authenticated' });
    
    const fetchTracks = async (token: string) => {
      const response = await fetch(`https://api.spotify.com/v1/playlists/${req.params.id}/items?additional_types=track`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw {
          statusCode: response.status,
          message: errorData.error?.message || response.statusText,
          body: errorData
        };
      }
      
      const data = await response.json();
      const normalized = (data.items || []).map((entry: any) => {
        const trackObj = entry.track && typeof entry.track === 'object' ? entry.track : entry.item;
        return { ...entry, track: trackObj };
      });
      res.json(normalized);
    };

    try {
      await fetchTracks(accessToken);
    } catch (err: any) {
      await handleSpotifyError(req, res, err, 'fetch tracks', async (newToken: string) => { await fetchTracks(newToken); });
    }
  });

  app.post('/api/play', async (req, res) => {
    const accessToken = getAccessToken(req);
    if (!accessToken) return res.status(401).json({ error: 'Not authenticated' });
    
    const { uri, deviceId } = req.body;
    if (!uri) return res.status(400).json({ error: 'Missing track URI' });

    const playTrack = async (token: string) => {
      const api = new SpotifyWebApi({ accessToken: token });
      const options: any = { uris: [uri] };
      if (deviceId) options.device_id = deviceId;
      await api.play(options);
      res.json({ success: true });
    };

    try {
      await playTrack(accessToken);
    } catch (err: any) {
      await handleSpotifyError(req, res, err, 'play track', async (newToken: string) => { await playTrack(newToken); });
    }
  });

  app.get('/api/devices', async (req, res) => {
    const accessToken = getAccessToken(req);
    if (!accessToken) return res.status(401).json({ error: 'Not authenticated' });
    
    const fetchDevices = async (token: string) => {
      const api = new SpotifyWebApi({ accessToken: token });
      const devices = await api.getMyDevices();
      res.json(devices.body.devices);
    };

    try {
      await fetchDevices(accessToken);
    } catch (err: any) {
      await handleSpotifyError(req, res, err, 'fetch devices', async (newToken: string) => { await fetchDevices(newToken); });
    }
  });

  app.get('/api/playback-state', async (req, res) => {
    const accessToken = getAccessToken(req);
    if (!accessToken) return res.status(401).json({ error: 'Not authenticated' });

    const fetchState = async (token: string) => {
      const api = new SpotifyWebApi({ accessToken: token });
      const state = await api.getMyCurrentPlaybackState();
      if (!state.body || !state.body.item) {
        return res.json({ is_playing: false });
      }
      res.json({
        is_playing: state.body.is_playing,
        progress_ms: state.body.progress_ms,
        duration_ms: (state.body.item as any).duration_ms,
        track_uri: state.body.item.uri
      });
    };

    try {
      await fetchState(accessToken);
    } catch (err: any) {
      await handleSpotifyError(req, res, err, 'fetch playback state', async (newToken: string) => { await fetchState(newToken); });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session = null;
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer();
}
