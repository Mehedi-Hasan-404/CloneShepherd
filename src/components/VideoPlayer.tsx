// /src/components/VideoPlayer.tsx - Always Proxy HLS Streams (No Fallback)
import React, { useRef, useCallback, useEffect, useState } from 'react';
import Hls from 'hls.js';
import shaka from 'shaka-player';

interface VideoPlayerProps {
  streamUrl: string;
  channelName: string;
  autoPlay?: boolean;
  muted?: boolean;
  className?: string;
  authCookie?: string; // New: Optional auth cookie for proxy/upstream
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamUrl,
  channelName,
  autoPlay = true,
  muted = true,
  className = "",
  authCookie,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const isMountedRef = useRef(true);
  const hasTriedProxyRef = useRef(false); // Unused now, but kept for structure
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [playerState, setPlayerState] = useState({
    isLoading: true,
    error: null as string | null,
  });

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

    // Existing DRM logic (placeholder - expand if needed)
    // if (url.includes('drm')) { drmInfo = { servers: { com_widevine_alpha: '...' }, ... }; }

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

  const destroyPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    // Clear Shaka if active (global, but safe)
    if (shaka.Player.isBrowserSupported()) {
      shaka.Player.clearConfiguration(shaka.Player.getDefaultConfiguration());
    }
  }, []);

  const initHlsPlayer = useCallback(async (url: string, video: HTMLVideoElement) => {
    if (!Hls.isSupported() || !isMountedRef.current) return;

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      xhrSetup: (xhr, url) => {
        // Pass authCookie as header to proxy (for all requests, including segments)
        if (authCookie) {
          xhr.setRequestHeader('X-Auth-Cookie', authCookie);
        }
      },
    });

    hlsRef.current = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (!isMountedRef.current) return;
      setPlayerState(prev => ({ ...prev, isLoading: false }));
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
      console.error('HLS Error:', data);
      if (!isMountedRef.current) return;
      if (data.fatal) {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        setPlayerState(prev => ({ ...prev, isLoading: false, error: `HLS Error: ${data.details}` }));
        destroyPlayer();
      }
    });

    hls.loadSource(url);
    hls.attachMedia(video);
    if (autoPlay) video.play().catch(console.error);
  }, [authCookie, destroyPlayer, autoPlay]);

  const initShakaPlayer = useCallback(async (url: string, video: HTMLVideoElement, drmInfo?: any) => {
    // No proxy for DASH - direct only
    shaka.polyfill.installAll();
    if (shaka.Player.isBrowserSupported()) {
      const player = new shaka.Player(video);
      player.configure({
        streaming: { bufferBehind: 90 },
      });

      // DRM setup if needed
      if (drmInfo) {
        player.configure('drm', drmInfo);
      }

      player.load(url).then(() => {
        setPlayerState(prev => ({ ...prev, isLoading: false }));
      }).catch((error: any) => {
        console.error('Shaka Error:', error);
        setPlayerState(prev => ({ ...prev, isLoading: false, error: error.message }));
      });
    } else {
      setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Shaka Player not supported' }));
    }
  }, []);

  const initNativePlayer = useCallback((url: string, video: HTMLVideoElement) => {
    // No proxy for native - direct only
    video.src = url;
    if (autoPlay) video.play().catch((error: any) => {
      console.error('Native Error:', error);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: error.message }));
    });
    video.addEventListener('loadeddata', () => {
      setPlayerState(prev => ({ ...prev, isLoading: false }));
    });
  }, [autoPlay]);

  const initializePlayer = useCallback(async (forceProxy = false) => { // forceProxy unused now
    const video = videoRef.current;
    if (!video || !isMountedRef.current) return;

    destroyPlayer();
    setPlayerState(prev => ({ ...prev, isLoading: true, error: null }));

    const { type, cleanUrl, drmInfo } = detectStreamType(streamUrl);

    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Timeout loading stream' }));
      }
    }, 10000);

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
    }
  }, [streamUrl, detectStreamType, initHlsPlayer, initShakaPlayer, initNativePlayer, destroyPlayer]);

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

  if (playerState.error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500 bg-gray-100 rounded">
        <p>{playerState.error}</p>
      </div>
    );
  }

  return (
    <div className={`video-player ${className}`}>
      {playerState.isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded z-10">
          <p className="text-white">Loading {channelName}...</p>
        </div>
      )}
      <video
        ref={videoRef}
        className="w-full h-auto rounded"
        autoPlay={autoPlay}
        muted={muted}
        controls
        playsInline
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default VideoPlayer;
