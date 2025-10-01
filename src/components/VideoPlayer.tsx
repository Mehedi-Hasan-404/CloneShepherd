// /src/components/VideoPlayer.tsx - Full IPTV Video Player with Always-Proxy HLS, Auth Passthrough, Controls, and Error Handling
import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import Hls from 'hls.js';
import shaka from 'shaka-player';
import { Play, Pause, Volume2, VolumeX, Maximize2, Settings, Loader2 } from 'lucide-react'; // Assuming Lucide icons for controls
import { cn } from '@/lib/utils'; // shadcn utils for classnames

interface VideoPlayerProps {
  streamUrl: string;
  channelName?: string;
  poster?: string; // Optional poster image
  autoPlay?: boolean;
  muted?: boolean;
  className?: string;
  authCookie?: string; // Optional auth cookie for proxy/upstream
  onPlay?: () => void;
  onPause?: () => void;
  onError?: (error: string) => void;
  showControls?: boolean; // Toggle full controls UI
}

interface PlayerState {
  isLoading: boolean;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  error: string | null;
  qualityLevels: Array<{ id: number; height: number; bitrate: number }>; // For HLS quality selector
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamUrl,
  channelName = 'Live Stream',
  poster,
  autoPlay = true,
  muted = true,
  className = "",
  authCookie,
  onPlay,
  onPause,
  onError,
  showControls = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const shakaPlayerRef = useRef<shaka.Player | null>(null);
  const isMountedRef = useRef(true);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [playerState, setPlayerState] = useState<PlayerState>({
    isLoading: true,
    isPlaying: false,
    isMuted: muted,
    volume: muted ? 0 : 0.5,
    currentTime: 0,
    duration: 0,
    error: null,
    qualityLevels: [],
  });

  // Proxy and detection utils
  const getProxiedUrl = useCallback((url: string): string => {
    const urlLower = url.toLowerCase();
    if (!isHLS(urlLower)) return url; // Only proxy HLS
    const base = import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy';
    return `${base}?url=${encodeURIComponent(url)}`;
  }, []);

  const isHLS = useCallback((urlLower: string): boolean => {
    return urlLower.includes('.m3u8') || urlLower.includes('/hls/') || urlLower.includes('hls');
  }, []);

  const detectStreamType = useCallback((url: string): { type: 'hls' | 'dash' | 'native'; cleanUrl: string; drmInfo?: any } => {
    let cleanUrl = url;
    let drmInfo = null;

    // DRM detection and cleanup (expand as needed for Widevine/FairPlay)
    if (url.includes('drm') || url.includes('widevine')) {
      drmInfo = {
        servers: {
          'com.widevine.alpha': 'https://license.uat.widevine.com/cenc/getcontentkey',
        },
        advanced: {
          'com.widevine.alpha': {
            videoRobustness: 'SW_SECURE_CRYPTO',
          },
        },
      };
    }

    // Always proxy HLS upfront
    const urlLower = url.toLowerCase();
    if (isHLS(urlLower)) {
      cleanUrl = getProxiedUrl(cleanUrl);
    }

    if (urlLower.includes('.mpd') || urlLower.includes('/dash/') || urlLower.includes('dash')) {
      return { type: 'dash', cleanUrl, drmInfo };
    }
    if (isHLS(urlLower)) {
      return { type: 'hls', cleanUrl, drmInfo };
    }
    if (urlLower.includes('.mp4') || urlLower.includes('.webm') || urlLower.includes('.mov')) {
      return { type: 'native', cleanUrl, drmInfo };
    }
    return { type: 'native', cleanUrl, drmInfo }; // Default to native
  }, [getProxiedUrl, isHLS]);

  // Player lifecycle
  const destroyPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (shakaPlayerRef.current) {
      shakaPlayerRef.current.destroy();
      shakaPlayerRef.current = null;
    }
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    shaka.Player.clearConfiguration(shaka.Player.getDefaultConfiguration());
  }, []);

  const initHlsPlayer = useCallback(async (url: string, video: HTMLVideoElement) => {
    if (!Hls.isSupported() || !isMountedRef.current) return;

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      maxBufferLength: 60,
      liveSyncDurationCount: 3,
      xhrSetup: (xhr, url) => {
        if (authCookie) {
          xhr.setRequestHeader('X-Auth-Cookie', authCookie);
        }
        // Add referrer policy if needed
        xhr.setRequestHeader('Referer', window.location.origin);
      },
      // Quality levels for selector
      abrEwmaFastLive: 3.0,
      abrEwmaSlowLive: 9.0,
      abrEwmaFastVoD: 3.0,
      abrEwmaSlowVoD: 9.0,
    });

    hlsRef.current = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      if (!isMountedRef.current) return;
      const levels = data.levels.map((level: any, index: number) => ({
        id: index,
        height: level.height,
        bitrate: level.bitrate,
      }));
      setPlayerState(prev => ({ ...prev, qualityLevels: levels }));
      setPlayerState(prev => ({ ...prev, isLoading: false }));
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
      console.log('Switched to quality:', data.level);
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('HLS Error:', data);
      if (!isMountedRef.current) return;
      if (data.fatal) {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        const errorMsg = `HLS Error: ${data.details}`;
        setPlayerState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
        onError?.(errorMsg);
        destroyPlayer();
      }
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    // Time/volume updates
    const updateState = () => {
      if (!isMountedRef.current) return;
      setPlayerState(prev => ({
        ...prev,
        currentTime: video.currentTime,
        duration: video.duration,
        isPlaying: !video.paused,
        isMuted: video.muted,
        volume: video.volume,
      }));
    };
    video.addEventListener('timeupdate', updateState);
    video.addEventListener('durationchange', updateState);
    video.addEventListener('volumechange', updateState);
    video.addEventListener('play', () => onPlay?.());
    video.addEventListener('pause', () => onPause?.());

    if (autoPlay) video.play().catch((err) => console.error('Autoplay failed:', err));
  }, [authCookie, destroyPlayer, autoPlay, onError, onPlay, onPause]);

  const initShakaPlayer = useCallback(async (url: string, video: HTMLVideoElement, drmInfo?: any) => {
    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) {
      setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Shaka Player not supported in this browser' }));
      return;
    }

    const player = new shaka.Player(video);
    shakaPlayerRef.current = player;

    player.configure({
      streaming: {
        bufferBehind: 90,
        rebufferingGoal: 15,
        bufferingGoal: 30,
      },
      abr: {
        enabled: true,
      },
    });

    if (drmInfo) {
      player.configure('drm', drmInfo);
    }

    player.addEventListener('loading', () => setPlayerState(prev => ({ ...prev, isLoading: true })));
    player.addEventListener('loaded', () => setPlayerState(prev => ({ ...prev, isLoading: false })));
    player.addEventListener('error', (event) => {
      const error = (event as any).detail;
      console.error('Shaka Error:', error);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: error.message || 'Playback error' }));
      onError?.(error.message || 'Playback error');
    });

    player.addEventListener('adaptation', () => {
      // Update quality levels if needed
      const track = player.getVariantTracks()[player.getVariantTrack(0)];
      if (track) {
        console.log('Quality switched to:', track.height);
      }
    });

    // Time/volume updates
    const updateState = () => {
      if (!isMountedRef.current || !video) return;
      setPlayerState(prev => ({
        ...prev,
        currentTime: video.currentTime,
        duration: video.duration,
        isPlaying: !video.paused,
        isMuted: video.muted,
        volume: video.volume,
      }));
    };
    video.addEventListener('timeupdate', updateState);
    video.addEventListener('durationchange', updateState);
    video.addEventListener('volumechange', updateState);
    video.addEventListener('play', () => onPlay?.());
    video.addEventListener('pause', () => onPause?.());

    player.load(url).catch((error: any) => {
      console.error('Shaka load failed:', error);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: error.message }));
      onError?.(error.message);
    });
  }, [onError, onPlay, onPause]);

  const initNativePlayer = useCallback((url: string, video: HTMLVideoElement) => {
    video.src = url;
    video.poster = poster || '';

    // Time/volume updates
    const updateState = () => {
      if (!isMountedRef.current) return;
      setPlayerState(prev => ({
        ...prev,
        currentTime: video.currentTime,
        duration: video.duration,
        isPlaying: !video.paused,
        isMuted: video.muted,
        volume: video.volume,
      }));
    };
    video.addEventListener('timeupdate', updateState);
    video.addEventListener('durationchange', updateState);
    video.addEventListener('volumechange', updateState);
    video.addEventListener('loadeddata', () => {
      setPlayerState(prev => ({ ...prev, isLoading: false }));
    });
    video.addEventListener('play', () => onPlay?.());
    video.addEventListener('pause', () => onPause?.());
    video.addEventListener('error', (e) => {
      const error = (e.target as HTMLVideoElement).error;
      const msg = error?.message || 'Native playback error';
      setPlayerState(prev => ({ ...prev, isLoading: false, error: msg }));
      onError?.(msg);
    });

    if (autoPlay) video.play().catch((err) => console.error('Native play failed:', err));
  }, [autoPlay, poster, onPlay, onPause, onError]);

  const initializePlayer = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !isMountedRef.current || !streamUrl) return;

    destroyPlayer();
    setPlayerState(prev => ({ ...prev, isLoading: true, error: null, qualityLevels: [] }));

    const { type, cleanUrl, drmInfo } = detectStreamType(streamUrl);

    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Timeout loading stream' }));
        onError?.('Timeout loading stream');
      }
    }, 15000); // Increased timeout for live streams

    switch (type) {
      case 'hls':
        await initHlsPlayer(cleanUrl, video);
        break;
      case 'dash':
        await initShakaPlayer(cleanUrl, video, drmInfo);
        break;
      case 'native':
        initNativePlayer(cleanUrl, video);
        break;
      default:
        setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Unsupported stream format' }));
    }
  }, [streamUrl, detectStreamType, initHlsPlayer, initShakaPlayer, initNativePlayer, destroyPlayer, onError]);

  // Control handlers
  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playerState.isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  }, [playerState.isPlaying]);

  const handleVolumeChange = useCallback((newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newVolume;
    setPlayerState(prev => ({ ...prev, volume: newVolume, isMuted: newVolume === 0 }));
  }, []);

  const handleMuteToggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !playerState.isMuted;
  }, [playerState.isMuted]);

  const handleSeek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
  }, []);

  const handleQualityChange = useCallback((levelId: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelId;
    }
  }, []);

  const handleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.requestFullscreen) {
      video.requestFullscreen();
    }
  }, []);

  // Cleanup
  useEffect(() => {
    isMountedRef.current = true;
    if (streamUrl) {
      initializePlayer();
    }

    return () => {
      isMountedRef.current = false;
      destroyPlayer();
    };
  }, [initializePlayer, streamUrl]);

  // Re-init on prop changes
  useEffect(() => {
    if (videoRef.current && !playerState.isLoading && !playerState.error) {
      initializePlayer();
    }
  }, [autoPlay, muted, authCookie, initializePlayer]);

  const progress = useMemo(() => playerState.duration > 0 ? (playerState.currentTime / playerState.duration) * 100 : 0, [playerState.currentTime, playerState.duration]);

  if (playerState.error) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-64 bg-gray-100 rounded-lg border border-red-200", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-red-500 mb-2" />
        <p className="text-red-500 text-sm">{playerState.error}</p>
        <button
          onClick={initializePlayer}
          className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full aspect-video bg-black rounded-lg overflow-hidden", className)}>
      {/* Video Element */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain"
        poster={poster}
        muted={playerState.isMuted}
        playsInline
      />

      {/* Loading Overlay */}
      {playerState.isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="ml-2 text-white text-sm">Loading {channelName}...</p>
        </div>
      )}

      {/* Controls Overlay */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-black bg-opacity-50 text-white z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          {/* Progress Bar */}
          <div className="w-full mb-2">
            <input
              type="range"
              min={0}
              max={playerState.duration}
              value={playerState.currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="w-full h-1 bg-gray-700 rounded slider"
            />
            <div className="flex justify-between text-xs mt-1">
              <span>{Math.floor(playerState.currentTime / 60)}:{Math.floor(playerState.currentTime % 60).toString().padStart(2, '0')}</span>
              <span>{Math.floor(playerState.duration / 60)}:{Math.floor(playerState.duration % 60).toString().padStart(2, '0')}</span>
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="flex items-center justify-between">
            {/* Play/Pause */}
            <button onClick={handlePlayPause} className="p-2 hover:bg-white bg-opacity-20 rounded">
              {playerState.isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </button>

            {/* Volume */}
            <div className="flex items-center">
              <button onClick={handleMuteToggle} className="p-2 hover:bg-white bg-opacity-20 rounded mr-2">
                {playerState.isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={playerState.volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-20 h-1 bg-gray-700 rounded slider"
              />
            </div>

            {/* Quality Selector */}
            {playerState.qualityLevels.length > 1 && (
              <select
                onChange={(e) => handleQualityChange(Number(e.target.value))}
                value={hlsRef.current?.currentLevel ?? 0}
                className="bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm"
              >
                {playerState.qualityLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.height}p
                  </option>
                ))}
              </select>
            )}

            {/* Fullscreen */}
            <button onClick={handleFullscreen} className="p-2 hover:bg-white bg-opacity-20 rounded">
              <Maximize2 className="h-6 w-6" />
            </button>

            {/* Settings (expand for more) */}
            {showControls && (
              <button className="p-2 hover:bg-white bg-opacity-20 rounded">
                <Settings className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hover group for controls */}
      <div className="group relative w-full h-full cursor-pointer" />
    </div>
  );
};

export default VideoPlayer;
