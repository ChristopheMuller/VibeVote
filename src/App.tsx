import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Music,
  Play,
  Users,
  QrCode,
  CheckCircle2,
  Vote as VoteIcon,
  LogOut,
  ChevronRight,
  ChevronDown,
  Loader2,
  Trophy,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import {
  signInAnonymously,
  onAuthStateChanged,
  User as FirebaseUser,
  signOut
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  updateDoc,
  addDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { shuffle } from './utils';

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

// --- Types ---
interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  albumArt: string;
  uri: string;
}

interface Session {
  id: string;
  hostId: string;
  playlistId: string;
  playlistName: string;
  active: boolean;
  votingTracks: (SpotifyTrack & { votes: number })[];
  currentTrack?: SpotifyTrack;
  createdAt: any;
  numOptions?: number;
  minSkipVotes?: number;
  skipVoteProportion?: number;
}

// --- Utils ---
const getAuthHeaders = (token?: string | null) => {
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

const apiFetch = async (url: string, options: RequestInit = {}) => {
  const res = await fetch(url, options);
  const refreshedToken = res.headers.get('X-Refreshed-Token');
  if (refreshedToken) {
    console.log('Intercepted refreshed token from response header');
    localStorage.setItem('spotify_access_token', refreshedToken);
    window.dispatchEvent(new CustomEvent('spotify_token_refreshed', { detail: { token: refreshedToken } }));
  }
  return res;
};

// --- Animated Background ---
function AnimatedBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-zinc-950">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-600 rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-blob"></div>
      <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] bg-teal-600 rounded-full mix-blend-screen filter blur-[120px] opacity-15 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-[60%] h-[60%] bg-cyan-900 rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-blob animation-delay-4000"></div>
      <div className="absolute inset-0 opacity-[0.02] mix-blend-overlay pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>
    </div>
  );
}


// --- Playing Wave Visualizer ---
function PlayingWaveVisualizer() {
  return (
    <div className="flex items-end justify-between w-12 h-12 gap-1 py-1">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="w-full h-full bg-current rounded-full origin-bottom"
          animate={{ scaleY: [0.3, 1, 0.3] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  );
}

// --- Components ---
export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Check if we are in a session (from URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sId = params.get('session');
    if (sId) {
      setSessionId(sId);
      setIsHost(false);
      // Log in anonymously if not already
      if (!auth.currentUser) {
        signInAnonymously(auth).catch(console.error);
      }
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (sessionId) {
    return <UserView sessionId={sessionId} user={user} />;
  }

  if (isHost) {
    return <HostDashboard onLogout={() => setIsHost(false)} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 relative">
      <AnimatedBackground />
      <main className="max-w-4xl mx-auto px-6 py-20 flex flex-col items-center text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center mb-8 mx-auto shadow-lg shadow-emerald-500/20">
            <Music className="w-10 h-10 text-zinc-950" />
          </div>
          <h1 className="text-6xl font-bold tracking-tight mb-4 bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent">
            Spotify Vote Next
          </h1>
          <p className="text-zinc-400 text-xl max-w-md mx-auto leading-relaxed">
            Let your audience decide the vibe. Real-time voting for your Spotify queue.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          <button
            onClick={() => setIsHost(true)}
            className="group relative p-8 glass-panel glass-panel-hover rounded-3xl text-left overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500">
              <Play className="w-32 h-32" />
            </div>
            <h3 className="text-2xl font-bold mb-2 flex items-center gap-2 group-hover:text-emerald-400 transition-colors">
              Host a Session <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </h3>
            <p className="text-zinc-400 font-medium">Connect your Spotify and start a party queue.</p>
          </button>

          <button
            onClick={() => {
              const id = prompt("Enter Session ID:");
              if (id) setSessionId(id);
            }}
            className="group relative p-8 glass-panel glass-panel-hover rounded-3xl text-left overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500">
              <Users className="w-32 h-32" />
            </div>
            <h3 className="text-2xl font-bold mb-2 flex items-center gap-2 group-hover:text-emerald-400 transition-colors">
              Join a Session <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </h3>
            <p className="text-zinc-400 font-medium">Scan a QR code or enter a code to start voting.</p>
          </button>
        </div>
      </main>
    </div>
  );
}

// --- Host Dashboard ---

function HostDashboard({ onLogout }: { onLogout: () => void }) {
  const [spotifyUser, setSpotifyUser] = useState<any>(null);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [credentialsMissing, setCredentialsMissing] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [pendingPlaylist, setPendingPlaylist] = useState<any>(null);
  const [selectedNumOptions, setSelectedNumOptions] = useState<number>(4);
  const [selectedMinSkipVotes, setSelectedMinSkipVotes] = useState<number>(3);
  const [selectedSkipProportion, setSelectedSkipProportion] = useState<number>(50);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

  useEffect(() => {
    localStorage.removeItem('spotify_access_token');
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        setHealthData(data);
        if (!data.spotify.clientId || !data.spotify.clientSecret || !data.spotify.redirectUri) {
          setCredentialsMissing(true);
        }
      } catch (e) {
        console.error('Health check failed', e);
      }
    };
    checkHealth();

    if (accessToken) {
      fetchSpotifyUser(accessToken);
      fetchPlaylists(accessToken);
    } else {
      fetchSpotifyUser();
      fetchPlaylists();
    }

    // Listen for OAuth success messages
    const handleMessage = (event: MessageEvent) => {
      console.log('Received message:', event.data);
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const token = event.data.accessToken;
        if (token) {
          console.log('Token received, updating state...');
          setAccessToken(token);
          localStorage.setItem('spotify_access_token', token);
          fetchSpotifyUser(token);
          fetchPlaylists(token);
        } else {
          console.log('No token in message, trying session-based fetch...');
          fetchSpotifyUser();
          fetchPlaylists();
        }
      }
    };
    // Fallback: Listen for storage changes (if postMessage fails)
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'spotify_access_token' && event.newValue) {
        console.log('Token detected in localStorage, updating state...');
        setAccessToken(event.newValue);
        fetchSpotifyUser(event.newValue);
        fetchPlaylists(event.newValue);
      }
    };

    const handleTokenRefreshed = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.token) {
        console.log('Token refreshed event caught, updating state...');
        setAccessToken(customEvent.detail.token);
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('spotify_token_refreshed', handleTokenRefreshed);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('spotify_token_refreshed', handleTokenRefreshed);
    };
  }, []);

  const handleDisconnect = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Failed to logout from server:', err);
    }
    localStorage.removeItem('spotify_access_token');
    setAccessToken(null);
    setSpotifyUser(null);
    setPlaylists([]);
    setError(null);
  };

  const fetchSpotifyUser = async (token?: string) => {
    try {
      const headers = getAuthHeaders(token || accessToken);

      const res = await apiFetch('/api/me', { headers, cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSpotifyUser(data);
        setError(null);
      } else if (res.status === 401 || res.status === 403) {
        setSpotifyUser(null);
        localStorage.removeItem('spotify_access_token');
        setAccessToken(null);

        let message = res.status === 401
          ? 'Spotify session expired. Please connect again.'
          : 'Access forbidden (403). This usually means your Spotify account is not authorized in the Developer Dashboard "Users and Roles" section.';

        try {
          const data = await res.json();
          if (data.message) message = data.message;
        } catch (e) {
          // Fallback to default message
        }
        setError(message);
      } else {
        let message = 'Failed to fetch Spotify profile';
        try {
          const data = await res.json();
          message = data.message || data.error || message;
          if (data.details && typeof data.details === 'object') {
            message += `: ${JSON.stringify(data.details)}`;
          }
        } catch (e) {
          message = `Server error (${res.status})`;
        }
        setError(message);
      }
    } catch (err) {
      console.error('Error fetching user:', err);
      setError(`Connection error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlaylists = async (token?: string) => {
    try {
      const headers = getAuthHeaders(token || accessToken);

      const res = await apiFetch('/api/playlists', { headers, cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setPlaylists(data);
      } else if (res.status === 401 || res.status === 403) {
        // Handled by fetchSpotifyUser, but good to clear here too
        setPlaylists([]);
      }
    } catch (err) {
      console.error('Error fetching playlists:', err);
    }
  };

  const handleConnect = async (forceDialog = false) => {
    setError(null);
    const win = window.open('', 'spotify_auth', 'width=600,height=700');
    if (!win) {
      setError('Popup blocked! Please allow popups for this site.');
      return;
    }
    try {
      console.log('Fetching auth URL...');
      const url = forceDialog ? '/api/auth/url?show_dialog=true' : '/api/auth/url';
      const res = await apiFetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (!data.url) {
        throw new Error('No URL returned from server');
      }
      console.log('Opening popup with URL:', data.url);
      win.location.href = data.url;
    } catch (err) {
      win.close();
      console.error('Error getting auth URL:', err);
      setError(`Failed to get Spotify auth URL: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const startSession = async (playlist: any, numOptions: number, minSkipVotes: number, skipVoteProportion: number) => {
    setLoading(true);
    let currentUser = auth.currentUser;
    if (!currentUser) {
      try {
        const cred = await signInAnonymously(auth);
        currentUser = cred.user;
      } catch (err) {
        console.error("Failed to sign in anonymously", err);
        setError('Failed to connect to voting system. Please refresh.');
        setLoading(false);
        return;
      }
    }

    try {
      // Fetch tracks for this playlist
      const headers = getAuthHeaders(accessToken);
      const res = await apiFetch(`/api/playlist/${playlist.id}/tracks`, { headers, cache: 'no-store' });
      const tracksData = await res.json();

      if (!res.ok) {
        throw new Error(tracksData.message || tracksData.error || 'Failed to fetch tracks. (403 Forbidden - Check Spotify scopes or if the playlist is collaborative/private)');
      }

      const allTracks: SpotifyTrack[] = tracksData
        .filter((item: any) => item && item.track && item.track.id)
        .map((item: any) => ({
          id: item.track.id,
          name: item.track.name || 'Unknown Track',
          artist: item.track.artists?.[0]?.name || 'Unknown Artist',
          albumArt: item.track.album?.images?.[0]?.url || 'https://picsum.photos/seed/music/300/300',
          uri: item.track.uri
        }));

      if (allTracks.length === 0) {
        throw new Error('This playlist has no playable tracks! (Only local files or episodes). Please select another playlist.');
      }

      // Pick numOptions random tracks for the first round
      const shuffled = [...allTracks].sort(() => 0.5 - Math.random());
      const votingTracks = shuffled.slice(0, numOptions).map(t => ({ ...t, votes: 0 }));

      const sessionId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const sessionData: Session = {
        id: sessionId,
        hostId: currentUser.uid,
        playlistId: playlist.id,
        playlistName: playlist.name,
        active: true,
        votingTracks,
        createdAt: serverTimestamp(),
        numOptions,
        minSkipVotes,
        skipVoteProportion
      };

      await setDoc(doc(db, 'sessions', sessionId), sessionData);
      setActiveSession(sessionData);
    } catch (err: any) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setAccessToken(null);
    localStorage.removeItem('spotify_access_token');
    onLogout();
  };

  if (loading && !spotifyUser) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!spotifyUser) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6 relative">
        <AnimatedBackground />
        <div className="max-w-md w-full text-center relative z-10">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <Music className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Connect Spotify</h2>
          <p className="text-zinc-500 mb-8">You need to connect your Spotify account to host a session and control playback.</p>

          {credentialsMissing && (
            <div className="mb-6 p-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400 text-left">
              <h4 className="font-bold mb-2 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" /> Setup Required
              </h4>
              <p className="text-sm mb-4">Spotify API credentials are missing. Please configure them in AI Studio Secrets:</p>
              <ul className="text-xs space-y-2 list-disc list-inside opacity-80">
                <li>SPOTIFY_CLIENT_ID</li>
                <li>SPOTIFY_CLIENT_SECRET</li>
                <li>SPOTIFY_REDIRECT_URI</li>
              </ul>
              <p className="text-xs mt-4">Your Redirect URI should be:</p>
              <code className="block mt-1 p-2 bg-black/30 rounded text-xs break-all">
                {window.location.origin}/api/auth/callback
              </code>
            </div>
          )}

          <div className="mb-8 flex justify-center">
            <button
              onClick={() => {
                const debug = document.getElementById('debug-info');
                if (debug) debug.classList.toggle('hidden');
              }}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 uppercase tracking-widest"
            >
              Show Debug Info
            </button>
          </div>

          <div id="debug-info" className="hidden mb-8 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-left text-[10px] font-mono text-zinc-500 space-y-2">
            <p>Current Redirect URI: {window.location.origin}/api/auth/callback</p>
            <p className={healthData?.spotify?.configuredRedirectUri && healthData.spotify.configuredRedirectUri !== `${window.location.origin}/api/auth/callback` ? "text-red-500 font-bold" : ""}>
              Configured in Secrets: {healthData?.spotify?.configuredRedirectUri || 'None (Using Dynamic)'}
              {healthData?.spotify?.configuredRedirectUri && healthData.spotify.configuredRedirectUri !== `${window.location.origin}/api/auth/callback` && " ⚠️ MISMATCH!"}
            </p>
            <p>Client ID Prefix: {healthData?.spotify?.clientIdPrefix || 'Unknown'}...</p>
            <p>Origin: {window.location.origin}</p>
            <p>Protocol: {window.location.protocol}</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex flex-col gap-2">
              <p className="font-bold">Error: {error}</p>
              {error.includes('403') && (
                <div className="mt-2 text-xs text-zinc-400 bg-black/20 p-3 rounded-xl border border-white/5">
                  <p className="font-bold text-zinc-200 mb-1 text-red-400">Critical Check:</p>
                  <p className="mb-2">Did you add your <b>NEW Premium email</b> to the Spotify Dashboard?</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Go to <a href="https://developer.spotify.com/dashboard" target="_blank" className="text-emerald-500 underline">Dashboard</a>.</li>
                    <li>Select your app &rarr; <b>Users and Roles</b>.</li>
                    <li>Add: <b>{auth.currentUser?.email || 'mullerchristophe22@gmail.com'}</b></li>
                  </ol>
                </div>
              )}
              <div className="flex gap-4 mt-2">
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    fetchSpotifyUser();
                  }}
                  className="text-xs underline hover:text-red-300"
                >
                  Try again
                </button>
                <button
                  onClick={handleDisconnect}
                  className="text-xs underline hover:text-zinc-300 text-zinc-500"
                >
                  Disconnect & Clear
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleConnect}
            className="w-full py-4 bg-emerald-500 text-zinc-950 font-bold rounded-2xl hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5 fill-current" /> Connect with Spotify
          </button>
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={() => {
                setLoading(true);
                const token = localStorage.getItem('spotify_access_token');
                if (token) {
                  setAccessToken(token);
                  fetchSpotifyUser(token);
                  fetchPlaylists(token);
                } else {
                  fetchSpotifyUser();
                  fetchPlaylists();
                }
              }}
              className="p-4 text-zinc-400 text-sm hover:text-zinc-200 transition-all border border-zinc-800 rounded-2xl hover:bg-zinc-900/50 active:scale-95 cursor-pointer"
            >
              Already connected? Click here to sync
            </button>
            <button onClick={handleLogout} className="mt-2 text-zinc-500 text-sm hover:text-zinc-300 transition-colors">Back to Home</button>
          </div>
        </div>
      </div>
    );
  }

  if (activeSession) {
    return <ActiveSessionHost session={activeSession} accessToken={accessToken} onEnd={() => setActiveSession(null)} handleConnect={handleConnect} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 relative">
      <AnimatedBackground />
      <header className="max-w-5xl mx-auto flex items-center justify-between mb-12 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center">
            <Music className="w-6 h-6 text-zinc-950" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Host Dashboard</h2>
            <p className="text-zinc-500 text-sm">Logged in as {spotifyUser.display_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={async () => {
              await handleDisconnect();
              handleConnect(true);
            }} 
            className="px-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all text-sm flex items-center gap-2"
          >
            Change Account
          </button>
          <button onClick={handleLogout} className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors">
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto relative z-10">
        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-4 text-red-400">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <div className="flex-1">
              <h4 className="font-bold text-lg mb-1">Could not start session</h4>
              <p className="text-sm opacity-90 mb-2">{error}</p>
              <button onClick={() => setError(null)} className="text-xs font-bold uppercase tracking-wider hover:text-red-300">Dismiss</button>
            </div>
          </div>
        )}
        {pendingPlaylist ? (
          <div className="max-w-md mx-auto">
            <h3 className="text-2xl font-bold mb-6">Session Options</h3>
            <div className="glass-panel rounded-3xl p-6 text-left mb-6">
              <div className="flex items-center gap-4 mb-6">
                 <img
                  src={pendingPlaylist.images?.[0]?.url || 'https://picsum.photos/seed/music/300/300'}
                  alt={pendingPlaylist.name || 'Playlist'}
                  className="w-16 h-16 rounded-xl object-cover"
                />
                <div>
                  <h4 className="font-bold text-lg">{pendingPlaylist.name}</h4>
                  <p className="text-sm text-zinc-400">Selected Playlist</p>
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-sm font-bold text-zinc-400 mb-4">Number of Voting Options ({selectedNumOptions})</label>
                <input
                  type="range"
                  min="2"
                  max="8"
                  value={selectedNumOptions}
                  onChange={(e) => setSelectedNumOptions(parseInt(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-xs text-zinc-500 mt-2 px-1">
                  <span>2</span>
                  <span>4</span>
                  <span>6</span>
                  <span>8</span>
                </div>
              </div>

              <div className="mb-8">
                <button
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-zinc-200 transition-colors w-full text-left"
                >
                  {showAdvancedSettings ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Advanced Settings
                </button>

                <AnimatePresence>
                  {showAdvancedSettings && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden mt-6 border-t border-zinc-800 pt-6"
                    >
                      <p className="text-xs text-zinc-500 mb-6 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                        The currently playing song is skipped if <strong>BOTH</strong> the minimum number of votes is reached <strong>AND</strong> the proportion of total voters is met.
                      </p>

                      <div className="mb-8">
                        <label className="block text-sm font-bold text-zinc-400 mb-2">
                          Minimum Skip Votes ({selectedMinSkipVotes})
                        </label>
                        <p className="text-xs text-zinc-500 mb-4">The absolute number of skip votes required before a song is skipped.</p>
                        <input
                          type="range"
                          min="1"
                          max="15"
                          value={selectedMinSkipVotes}
                          onChange={(e) => setSelectedMinSkipVotes(parseInt(e.target.value))}
                          className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <div className="flex justify-between text-xs text-zinc-500 mt-2 px-1">
                          <span>1</span>
                          <span>8</span>
                          <span>15</span>
                        </div>
                      </div>

                      <div className="mb-4">
                        <label className="block text-sm font-bold text-zinc-400 mb-2">
                          Skip Vote Proportion ({selectedSkipProportion}%)
                        </label>
                        <p className="text-xs text-zinc-500 mb-4">The percentage of total voters that must vote to skip.</p>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={selectedSkipProportion}
                          onChange={(e) => setSelectedSkipProportion(parseInt(e.target.value))}
                          className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <div className="flex justify-between text-xs text-zinc-500 mt-2 px-1">
                          <span>0%</span>
                          <span>50%</span>
                          <span>100%</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setPendingPlaylist(null)}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors border border-zinc-700/50"
                >
                  Back
                </button>
                <button
                  onClick={() => startSession(pendingPlaylist, selectedNumOptions, selectedMinSkipVotes, selectedSkipProportion)}
                  disabled={loading}
                  className="flex-1 py-3 px-4 bg-emerald-500 text-zinc-950 font-bold rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Start Session'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <h3 className="text-2xl font-bold mb-6">Select a Playlist to Start</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {playlists.map(playlist => (
                <button
                  key={playlist.id}
                  onClick={() => setPendingPlaylist(playlist)}
                  className="group glass-panel glass-panel-hover rounded-3xl p-5 text-left flex flex-col items-center justify-center"
                >
                  <div className="w-full aspect-square rounded-2xl mb-4 shadow-xl overflow-hidden bg-zinc-800">
                    <img
                      src={playlist.images?.[0]?.url || 'https://picsum.photos/seed/music/300/300'}
                      alt={playlist.name || 'Playlist'}
                      className="w-full h-full object-cover pointer-events-none transition-transform duration-300 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                      loading="eager"
                    />
                  </div>
                  <h4 className="font-bold text-center w-full text-lg group-hover:text-emerald-400 transition-colors line-clamp-2">
                    {playlist.name || 'Unnamed Playlist'}
                  </h4>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// --- Active Session Host ---

function ActiveSessionHost({ session, accessToken, onEnd, handleConnect }: { session: Session, accessToken: string | null, onEnd: () => void, handleConnect: (forceDialog?: boolean) => Promise<void> }) {
  const [currentSession, setCurrentSession] = useState<Session>(session);
  const [votes, setVotes] = useState<any[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const [player, setPlayer] = useState<any>(null);
  const sessionUrl = `${window.location.origin}/?session=${session.id}`;
  const isTransitioningRef = useRef(false);
  const handleNextRoundRef = useRef<() => Promise<void>>();

  const memoizedVotesData = useMemo(() => {
    const skipVotes = votes.filter(v => v.skipVote === true).length;
    const totalVotes = votes.length;
    const percentage = totalVotes > 0 ? (skipVotes / totalVotes) * 100 : 0;
    return { skipVotes, totalVotes, percentage };
  }, [votes]);

  const fetchDevices = async () => {
    if (!accessToken) return;
    try {
      const res = await apiFetch('/api/devices', {
        headers: getAuthHeaders(accessToken),
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        const apiDevices = data || [];
        const combined = [...apiDevices];
        
        if (localDeviceId) {
          const exists = apiDevices.find((d: any) => d.id === localDeviceId);
          if (!exists) {
            combined.push({
              id: localDeviceId,
              name: 'In-App Player (This Browser Tab)',
              type: 'Computer',
              is_active: selectedDeviceId === localDeviceId
            });
          }
        }
        
        setDevices(combined);
        const active = apiDevices.find((d: any) => d.is_active);
        
        if (active) {
          setSelectedDeviceId(active.id);
        } else if (!selectedDeviceId) {
          if (localDeviceId) {
            setSelectedDeviceId(localDeviceId);
          } else if (apiDevices.length > 0) {
            setSelectedDeviceId(apiDevices[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch devices:', err);
    }
  };

  useEffect(() => {
    if (!accessToken) return;

    let p: any = null;

    const initPlayer = () => {
      if (!window.Spotify) return;
      p = new window.Spotify.Player({
        name: 'MusicVote Dashboard',
        getOAuthToken: (cb: any) => {
          // Always try to fetch the freshest token from localStorage first
          const freshestToken = localStorage.getItem('spotify_access_token') || accessToken;
          cb(freshestToken);
        },
        volume: 0.5
      });

      p.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('Spotify SDK Ready', device_id);
        setLocalDeviceId(device_id);
        if (!selectedDeviceId) setSelectedDeviceId(device_id);
      });

      p.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        console.log('Spotify SDK Offline', device_id);
        setLocalDeviceId(null);
      });

      p.addListener('initialization_error', ({ message }: { message: string }) => {
        console.error('Spotify SDK Init Error:', message);
      });

      p.addListener('authentication_error', ({ message }: { message: string }) => {
        console.error('Spotify SDK Auth Error:', message);
      });

      p.addListener('account_error', ({ message }: { message: string }) => {
        console.error('Spotify SDK Account Error:', message);
      });

      p.addListener('playback_error', ({ message }: { message: string }) => {
        console.error('Spotify SDK Playback Error:', message);
      });

      p.connect().then((success: boolean) => {
        if (success) {
          console.log('The Web Playback SDK successfully connected to Spotify!');
        }
      });
      setPlayer(p);
    };

    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
    }

    // Load SDK script if not already loaded (MUST be after onSpotifyWebPlaybackSDKReady is set)
    if (!document.getElementById('spotify-player-sdk')) {
      const script = document.createElement('script');
      script.id = 'spotify-player-sdk';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      if (p) {
        p.disconnect();
      }
    };
  }, [accessToken]);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 10000);
    return () => clearInterval(interval);
  }, [accessToken, localDeviceId]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'sessions', session.id), (doc) => {
      if (doc.exists()) {
        setCurrentSession({ id: doc.id, ...doc.data() } as Session);
      }
    });
    return () => unsub();
  }, [session.id]);

  const tracksRef = useRef(currentSession.votingTracks);
  useEffect(() => {
    tracksRef.current = currentSession.votingTracks;
  }, [currentSession.votingTracks]);

  useEffect(() => {
    const q = query(collection(db, 'sessions', session.id, 'votes'));
    const unsub = onSnapshot(q, (snapshot) => {
      const votesData = snapshot.docs.map(d => d.data());
      setVotes(votesData);

      const currentTracks = tracksRef.current;
      const updatedTracks = currentTracks.map(track => ({
        ...track,
        votes: votesData.filter(v => v.trackId === track.id).length
      }));

      const hasChanged = updatedTracks.some((t, i) => t.votes !== currentTracks[i].votes);
      if (hasChanged) {
        updateDoc(doc(db, 'sessions', session.id), { votingTracks: updatedTracks });
      }

      const skipVotes = votesData.filter(v => v.skipVote === true).length;
      const totalVotes = votesData.length;
      const minSkipVotes = currentSession.minSkipVotes ?? 3;
      const skipProportion = currentSession.skipVoteProportion ?? 50;
      const proportionMet = totalVotes > 0 ? (skipVotes / totalVotes) * 100 >= skipProportion : false;

      if (skipVotes >= minSkipVotes && proportionMet) {
        console.log(`Skip condition met for skip_song: ${skipVotes} votes out of ${totalVotes} (min: ${minSkipVotes}, prop: ${skipProportion}%)`);
        handleNextRoundRef.current?.();
      }
    });
    return () => unsub();
  }, [session.id]);

  const wasPlayingRef = useRef(false);

  useEffect(() => {
    if (!accessToken) return;

    const pollPlayback = async () => {
      if (isTransitioningRef.current) return;
      try {
        const res = await apiFetch('/api/playback-state', {
          headers: getAuthHeaders(accessToken),
          cache: 'no-store'
        });
        if (!res.ok) return;
        const state = await res.json();

        if (state.is_playing) {
          wasPlayingRef.current = true;
        } else if (wasPlayingRef.current) {
          wasPlayingRef.current = false;
          console.log('Song ended, auto-advancing to next round');
          handleNextRoundRef.current?.();
        }
      } catch (err) {
        // silently ignore polling errors
      }
    };

    const interval = setInterval(pollPlayback, 3000);
    return () => clearInterval(interval);
  }, [accessToken]);

  useEffect(() => {
    handleNextRoundRef.current = handleNextRound;
  });

  const handleNextRound = async () => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setIsTransitioning(true);
    setPlaybackError(null);
    try {
      // 1. Find winner
      const sortedTracks = [...currentSession.votingTracks].sort((a, b) => b.votes - a.votes);
      // If no votes, just pick the first track in the options
      const hasVotes = sortedTracks.some(t => t.votes > 0);
      const winner = hasVotes ? sortedTracks[0] : currentSession.votingTracks[0];

      if (winner) {
        // 2. Play winner on Spotify
        console.log('Playing next:', winner.name);
        const playRes = await apiFetch('/api/play', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(accessToken)
          },
          body: JSON.stringify({
            uri: winner.uri,
            deviceId: selectedDeviceId
          })
        });

        if (!playRes.ok) {
          const errData = await playRes.json();
          console.warn('Playback failed:', errData.message);
          if (playRes.status === 404) {
            setPlaybackError('No active Spotify device found. Please open Spotify on your phone or computer.');
          } else {
            setPlaybackError(errData.message || 'Failed to play track on Spotify.');
          }
          // We still proceed with the UI update even if playback fails (e.g. no active device)
          // so the session doesn't get stuck, but we show the error.
        }
      } else {
        console.warn('No winner track to play!');
      }

      // 3. Clear votes
      const votesSnapshot = await getDocs(collection(db, 'sessions', session.id, 'votes'));

      const chunks = [];
      for (let i = 0; i < votesSnapshot.docs.length; i += 500) {
        chunks.push(votesSnapshot.docs.slice(i, i + 500));
      }

      const batchPromises = chunks.map(async chunk => {
        const batch = writeBatch(db);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      });

      await Promise.all(batchPromises);

      // 4. Pick new 4 random tracks from playlist
      const headers = getAuthHeaders(accessToken);
      const res = await apiFetch(`/api/playlist/${currentSession.playlistId}/tracks`, { headers, cache: 'no-store' });
      const tracksData = await res.json();
      const allTracks: SpotifyTrack[] = tracksData
        .filter((item: any) => item && item.track && item.track.id)
        .map((item: any) => ({
          id: item.track.id,
          name: item.track.name || 'Unknown Track',
          artist: item.track.artists?.[0]?.name || 'Unknown Artist',
          albumArt: item.track.album?.images?.[0]?.url || 'https://picsum.photos/seed/music/300/300',
          uri: item.track.uri
        }));

      const shuffled = [...allTracks].sort(() => 0.5 - Math.random());
      const numOptions = currentSession.numOptions || 4;
      const nextVotingTracks = shuffled.slice(0, numOptions).map((t: any) => ({ ...t, votes: 0 }));

      // 5. Update session
      await updateDoc(doc(db, 'sessions', session.id), {
        currentTrack: winner || null,
        votingTracks: nextVotingTracks
      });
    } catch (err) {
      console.error(err);
    } finally {
      isTransitioningRef.current = false;
      setIsTransitioning(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 relative">
      <AnimatedBackground />
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">

        {/* Left: QR & Info */}
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 text-center">
            <h2 className="text-2xl font-bold mb-2">Join the Party</h2>
            <p className="text-zinc-500 mb-6">Scan to vote for the next song</p>
            <div className="bg-white p-4 rounded-2xl inline-block mb-6 shadow-xl">
              <QRCodeSVG value={sessionUrl} size={200} />
            </div>
            <div className="bg-zinc-800/50 p-4 rounded-xl font-mono text-emerald-400 text-lg">
              CODE: {session.id}
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2"><Users className="w-4 h-4" /> Active Voters</h3>
              <span className="bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-md text-xs font-bold">{votes.length}</span>
            </div>
            <p className="text-zinc-500 text-sm mb-6">Playlist: {session.playlistName}</p>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold block">Playback Device</label>
                  <button type="button" onClick={() => handleConnect(true)} className="text-emerald-500 hover:text-emerald-400 text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer">
                    Reconnect Spotify
                  </button>
                </div>
                {devices.length > 0 ? (
                  <select
                    value={selectedDeviceId || ''}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="">Auto-select Active</option>
                    {devices.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.is_active ? '🟢 ' : ''}{d.name} ({d.type})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-zinc-600 italic">No devices found. Open Spotify!</p>
                )}
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleNextRound}
                  disabled={isTransitioning}
                  className="w-full py-3 bg-white text-zinc-950 rounded-xl font-bold hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isTransitioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                  Skip Song
                </button>
                <button
                  onClick={onEnd}
                  className="w-full py-3 border border-red-500/30 text-red-500 rounded-xl hover:bg-red-500/10 transition-colors text-sm font-bold"
                >
                  End Session
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Current & Voting */}
        <div className="lg:col-span-2 space-y-8">
          {playbackError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-start gap-3 text-red-400 text-sm"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div className="flex-1">
                <p className="font-bold">Playback Issue</p>
                <p className="opacity-80">{playbackError}</p>
              </div>
              <button onClick={() => setPlaybackError(null)} className="text-xs hover:text-white">Dismiss</button>
            </motion.div>
          )}

          {/* Current Track */}
          <div className="bg-emerald-500 rounded-3xl p-8 text-zinc-950 flex items-center gap-6 shadow-lg shadow-emerald-500/20">
            {currentSession.currentTrack ? (
              <>
                <img
                  src={currentSession.currentTrack.albumArt}
                  alt={currentSession.currentTrack.name}
                  className="w-24 h-24 rounded-2xl shadow-lg"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1">
                  <span className="text-xs font-bold uppercase tracking-widest opacity-60">Now Playing</span>
                  <h3 className="text-3xl font-bold leading-tight">{currentSession.currentTrack.name}</h3>
                  <p className="text-lg opacity-80">{currentSession.currentTrack.artist}</p>
                </div>
              </>
            ) : (
              <div className="flex-1">
                <h3 className="text-2xl font-bold">Waiting to start...</h3>
                <p className="opacity-80">The first winner will appear here.</p>
              </div>
            )}
            {currentSession.currentTrack ? <PlayingWaveVisualizer /> : <Play className="w-12 h-12 fill-current opacity-50" />}
          </div>

          {/* Voting Round */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold flex items-center gap-2"><VoteIcon className="w-6 h-6" /> Next Song Voting</h3>
              <button
                onClick={handleNextRound}
                disabled={isTransitioning}
                className="px-6 py-2 bg-zinc-100 text-zinc-950 rounded-full font-bold hover:bg-white transition-colors disabled:opacity-50"
              >
                {isTransitioning ? 'Transitioning...' : 'Skip to Next Song'}
              </button>
            </div>

            <motion.div layout className="grid grid-cols-1 gap-4">
              <AnimatePresence>
                {(() => {
                  const totalVotes = currentSession.votingTracks.reduce((acc, t) => acc + t.votes, 0);
                  return currentSession.votingTracks.map((track, idx) => {
                    const percentage = totalVotes > 0 ? (track.votes / totalVotes) * 100 : 0;

                    return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      key={track.id}
                      className="relative glass-panel glass-panel-hover rounded-2xl p-4 overflow-hidden group"
                    >
                      {/* Progress Bar Background */}
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 pointer-events-none"
                      />

                      <div className="relative flex items-center gap-4">
                        <div className="relative">
                          <img
                            src={track.albumArt}
                            alt={track.name}
                            className="w-16 h-16 rounded-xl object-cover shadow-lg"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute -top-2 -left-2 w-6 h-6 bg-zinc-900 rounded-full flex items-center justify-center text-xs font-bold shadow-md ring-2 ring-emerald-500/50">
                            {idx + 1}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold truncate text-lg group-hover:text-emerald-400 transition-colors">{track.name}</h4>
                          <p className="text-zinc-500 text-sm truncate">{track.artist}</p>
                        </div>
                        <div className="text-right">
                          <motion.div
                            key={track.votes}
                            initial={{ scale: 1.5, color: '#10b981' }}
                            animate={{ scale: 1, color: '#10b981' }}
                            className="text-3xl font-bold text-emerald-500 drop-shadow-md"
                          >
                            {track.votes}
                          </motion.div>
                          <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mt-1">Votes</div>
                        </div>
                      </div>
                    </motion.div>
                  );
                  });
                })()}
                {memoizedVotesData.skipVotes > 0 && (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative glass-panel rounded-2xl p-4 overflow-hidden border border-red-500/20"
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${memoizedVotesData.percentage}%` }}
                      className="absolute inset-0 bg-red-500/10 pointer-events-none"
                    />
                    <div className="relative flex items-center justify-between">
                      <div className="font-bold text-red-500">Skip Current Song Votes</div>
                      <div className="text-right">
                        <motion.div
                          key={memoizedVotesData.skipVotes}
                          initial={{ scale: 1.5, color: '#ef4444' }}
                          animate={{ scale: 1, color: '#ef4444' }}
                          className="text-3xl font-bold text-red-500 drop-shadow-md"
                        >
                          {memoizedVotesData.skipVotes}
                        </motion.div>
                        <div className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mt-1">Votes</div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- User View ---

function UserView({ sessionId, user }: { sessionId: string; user: FirebaseUser | null }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hasVoted, setHasVoted] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'sessions', sessionId), (doc) => {
      if (doc.exists()) {
        setSession({ id: doc.id, ...doc.data() } as Session);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [sessionId]);

  // Track user's current votes
  const [currentVote, setCurrentVote] = useState<{ trackId?: string, skipVote?: boolean } | null>(null);

  // Check if user has already voted in this round
  useEffect(() => {
    const currentUser = user || auth.currentUser;
    if (!currentUser || !session) return;
    const q = query(
      collection(db, 'sessions', sessionId, 'votes'),
      where('userId', '==', currentUser.uid)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        setCurrentVote({ trackId: data.trackId, skipVote: data.skipVote });
      } else {
        setCurrentVote(null);
      }
    });
    return () => unsub();
  }, [sessionId, session, user, auth.currentUser]);

  const handleVote = async (trackId: string) => {
    const currentUser = user || auth.currentUser;
    if (!currentUser) return;
    if (currentVote?.trackId === trackId) return; // already voted for this track
    try {
      await setDoc(doc(db, 'sessions', sessionId, 'votes', currentUser.uid), {
        trackId,
        skipVote: currentVote?.skipVote || false,
        userId: currentUser.uid,
        sessionId,
        timestamp: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSkipToggle = async () => {
    const currentUser = user || auth.currentUser;
    if (!currentUser) return;
    try {
      const newSkipStatus = !(currentVote?.skipVote);
      await setDoc(doc(db, 'sessions', sessionId, 'votes', currentUser.uid), {
        skipVote: newSkipStatus,
        userId: currentUser.uid,
        sessionId,
        timestamp: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!session || !session.active) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6 text-center">
        <div>
          <h2 className="text-3xl font-bold mb-4">Session Not Found</h2>
          <p className="text-zinc-500 mb-8">This session may have ended or the code is incorrect.</p>
          <a href="/" className="px-8 py-3 bg-zinc-100 text-zinc-950 font-bold rounded-xl">Go Back</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 pb-32 relative">
      <AnimatedBackground />
      <header className="max-w-md mx-auto text-center mb-10 relative z-10">
        <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 mx-auto shadow-lg shadow-emerald-500/20">
          <Music className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-3xl font-bold mb-2">{session.playlistName}</h2>
        <p className="text-zinc-400 font-medium">Vote for the next song!</p>
      </header>

      <main className="max-w-md mx-auto space-y-4 relative z-10">
        <AnimatePresence>
          {session.votingTracks?.map((track) => (
            <motion.button
              key={track.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleVote(track.id)}
              className={`w-full relative p-4 rounded-2xl border transition-all duration-300 text-left flex items-center gap-4 overflow-hidden ${currentVote?.trackId === track.id
                ? 'bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-500/20'
                : 'glass-panel glass-panel-hover'
                }`}
            >
              <img
                src={track.albumArt}
                alt={track.name}
                className="w-16 h-16 rounded-xl object-cover shadow-lg pointer-events-none"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <h4 className={`font-bold truncate text-lg ${currentVote?.trackId === track.id ? 'text-emerald-400' : ''}`}>{track.name}</h4>
                <p className="text-zinc-400 text-sm truncate">{track.artist}</p>
              </div>
              {currentVote?.trackId === track.id && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                </motion.div>
              )}
            </motion.button>
          ))}
          
          <motion.button
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleSkipToggle}
            className={`w-full relative p-4 mt-6 rounded-2xl border transition-all duration-300 flex items-center justify-center gap-3 font-bold ${currentVote?.skipVote
              ? 'bg-red-500/20 border-red-500 ring-2 ring-red-500/50 shadow-lg shadow-red-500/20 text-red-400'
              : 'glass-panel border-red-500/30 text-red-400 hover:bg-red-500/10'
              }`}
          >
            Skip Current Song
            {currentVote?.skipVote && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                <CheckCircle2 className="w-6 h-6 shrink-0" />
              </motion.div>
            )}
          </motion.button>
        </AnimatePresence>
      </main>

      {/* Sticky Footer for Current Track */}
      {session.currentTrack && (
        <div className="fixed bottom-6 left-6 right-6 max-w-md mx-auto z-50">
          <div className="glass-panel backdrop-blur-3xl p-4 rounded-3xl shadow-2xl flex items-center gap-4 border border-zinc-700/50 relative overflow-hidden">
            <div className="absolute inset-0 bg-emerald-500/5 mix-blend-overlay pointer-events-none"></div>
            <div className="relative">
              <img
                src={session.currentTrack.albumArt}
                alt="Now Playing"
                className="w-14 h-14 rounded-full animate-[spin_10s_linear_infinite]"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 rounded-full border border-white/10 pointer-events-none"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-zinc-950 rounded-full border-2 border-zinc-800 pointer-events-none"></div>
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-0.5">Now Playing</p>
              <h4 className="font-bold text-base truncate drop-shadow-md">{session.currentTrack.name}</h4>
              <p className="text-zinc-400 text-xs truncate">{session.currentTrack.artist}</p>
            </div>
            <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center shrink-0 relative z-10">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
