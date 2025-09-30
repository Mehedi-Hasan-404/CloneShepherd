// /src/components/VideoPlayer.tsx - Corrected Version with Flat Settings in Landscape
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2, AlertCircle, RotateCcw, Settings, PictureInPicture2, Subtitles } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { db } from '@/lib/firebase'; // Corrected import
import { doc, getDoc } from 'firebase/firestore'; // Add Firestore imports
import { useAuth } from '@/hooks/useAuth'; // Add Auth hook import

interface VideoPlayerProps {
  streamUrl: string;
  channelName: string;
  autoPlay?: boolean;
  muted?: boolean;
  className?: string;
}

interface QualityLevel {
  height: number;
  bitrate: number;
  id: number;
}

interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
}

const PLAYER_LOAD_TIMEOUT = 15000;
const CONTROLS_HIDE_DELAY = 4000;

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamUrl,
  channelName,
  autoPlay = true,
  muted = true,
  className = ""
}) => {
  const { user } = useAuth(); // Use the auth hook
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hlsRef = useRef<any>(null);
  const shakaPlayerRef = useRef<any>(null);
  const playerTypeRef = useRef<'hls' | 'shaka' | 'native' | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const progressRef = useRef<HTMLDivElement>(null);

  const lastActivityRef = useRef<number>(Date.now());
  const dragStartRef = useRef<{ isDragging: boolean; } | null>(null);
  const wasPlayingBeforeSeekRef = useRef(false);
  const seekTimeRef = useRef(0);

  const [playerState, setPlayerState] = useState({
    isPlaying: false,
    isMuted: muted,
    isLoading: true,
    error: null as string | null,
    isFullscreen: false,
    isLandscape: false, // Add landscape state
    showControls: true,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    showSettings: false,
    currentQuality: -1,
    availableQualities: [] as QualityLevel[],
    availableSubtitles: [] as SubtitleTrack[],
    currentSubtitle: null as string | null, // Add subtitle state
    playbackSpeed: 1, // Add playback speed state
  });

  // --- Orientation Detection ---
  useEffect(() => {
    const handleResize = () => {
      const dimensionLandscape = window.innerWidth > window.innerHeight;
      const orientationLandscape = window.screen.orientation?.angle === 90 || window.screen.orientation?.angle === -90;
      const isLandscape = dimensionLandscape || orientationLandscape;
      setPlayerState(prev => ({ ...prev, isLandscape }));
    };

    const handleOrientationChange = () => {
      setTimeout(handleResize, 100);
    };

    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    if ('screen' in window && 'orientation' in window.screen) {
      window.screen.orientation.addEventListener('change', handleOrientationChange);
    }
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      if ('screen' in window && 'orientation' in window.screen) {
        window.screen.orientation.removeEventListener('change', handleOrientationChange);
      }
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  // --- Player Initialization Logic (from src 18.txt) ---
  const detectStreamType = useCallback((url: string) => {
    const cleanUrl = url.trim();
    const urlLower = cleanUrl.toLowerCase();
    const drmInfo = { scheme: 'clearkey', license: '' }; // Simplified for example
    if (urlLower.includes('.mpd') || urlLower.includes('manifest')) {
      return { type: 'dash', cleanUrl, drmInfo };
    }
    return { type: 'hls', cleanUrl, drmInfo };
  }, []);

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
    }
    playerTypeRef.current = null;
  }, []);

  const initializePlayer = useCallback(async () => {
    if (!streamUrl || !videoRef.current) {
      setPlayerState(prev => ({ ...prev, error: 'No stream URL provided', isLoading: false }));
      return;
    }

    const video = videoRef.current;
    destroyPlayer();
    setPlayerState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      isPlaying: false,
      showSettings: false,
      showControls: true
    }));

    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setPlayerState(prev => ({ ...prev, isLoading: false, error: "Stream took too long to load. Please try again." }));
        destroyPlayer();
      }
    }, PLAYER_LOAD_TIMEOUT);

    try {
      const { type, cleanUrl, drmInfo } = detectStreamType(streamUrl);
      if (type === 'dash') {
        playerTypeRef.current = 'shaka';
        await initShakaPlayer(cleanUrl, video, drmInfo);
      } else if (type === 'hls') {
        playerTypeRef.current = 'hls';
        await initHlsPlayer(cleanUrl, video);
      } else {
        playerTypeRef.current = 'native';
        initNativePlayer(cleanUrl, video);
      }
    } catch (error) {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: error instanceof Error ? error.message : 'Failed to initialize player' }));
    }
  }, [streamUrl, autoPlay, muted, destroyPlayer, detectStreamType]);

  const initHlsPlayer = async (url: string, video: HTMLVideoElement) => {
    try {
      const Hls = (await import('hls.js')).default;
      if (Hls && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          debug: false,
          capLevelToPlayerSize: true,
          maxLoadingDelay: 1,
          maxBufferLength: 15,
          maxBufferSize: 20 * 1000 * 1000,
          fragLoadingTimeOut: 8000,
          manifestLoadingTimeOut: 4000,
          startLevel: -1,
          startPosition: -1,
        });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!isMountedRef.current) return;
          if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);

          const levels: QualityLevel[] = hls.levels.map((level: any, index: number) => ({
            height: level.height || 0,
            bitrate: Math.round(level.bitrate / 1000),
            id: index,
          }));
          video.muted = muted;
          if (autoPlay) video.play().catch(console.warn);
          setPlayerState(prev => ({
            ...prev,
            isLoading: false,
            error: null,
            availableQualities: levels,
            currentQuality: hls.currentLevel,
            isMuted: video.muted,
            isPlaying: true,
            showControls: true
          }));
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!isMountedRef.current) return;
          if (data.fatal) {
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                setPlayerState(prev => ({ ...prev, isLoading: false, error: `HLS Error: ${data.details}` }));
                destroyPlayer();
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        initNativePlayer(url, video);
      } else {
        throw new Error('HLS is not supported in this browser');
      }
    } catch (error) { throw error; }
  };

  const initShakaPlayer = async (url: string, video: HTMLVideoElement, drmInfo?: any) => {
    try {
      const shaka = await import('shaka-player/dist/shaka-player.ui.js');
      shaka.default.polyfill.installAll();
      if (!shaka.default.Player.isBrowserSupported()) throw new Error('This browser is not supported by Shaka Player');
      if (shakaPlayerRef.current) await shakaPlayerRef.current.destroy();
      const player = new shaka.default.Player(video);
      shakaPlayerRef.current = player;

      player.configure({
        streaming: {
          bufferingGoal: 15,
          rebufferingGoal: 8,
          bufferBehind: 15,
          retryParameters: {
            timeout: 4000,
            maxAttempts: 2,
            baseDelay: 300,
            backoffFactor: 1.3,
            fuzzFactor: 0.2,
          },
          useNativeHlsOnSafari: true,
        },
        manifest: {
          retryParameters: {
            timeout: 4000,
            maxAttempts: 2,
            baseDelay: 300,
            backoffFactor: 1.3,
            fuzzFactor: 0.2,
          },
          dash: { clockSyncUri: '' },
        },
        abr: {
          enabled: true,
          defaultBandwidthEstimate: 1500000,
          bandwidthUpgradeSeconds: 3,
          bandwidthDowngradeSeconds: 6,
        },
      });

      if (drmInfo && drmInfo.scheme === 'clearkey' && drmInfo.license && drmInfo.license.includes(':')) {
        const [keyId, key] = drmInfo.license.split(':');
        player.configure({ drm: { clearKeys: { [keyId]: key } } });
      }

      const onError = (event: any) => {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        const errorCode = event.detail.code;
        let errorMessage = `Stream error (${errorCode})`;
        if (errorCode >= 6000 && errorCode < 7000) errorMessage = 'Network error - please check your connection';
        else if (errorCode >= 4000 && errorCode < 5000) errorMessage = 'Media format not supported';
        else if (errorCode >= 1000 && errorCode < 2000) errorMessage = 'DRM error - content may be protected';
        setPlayerState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
        destroyPlayer();
      };
      player.addEventListener('error', onError);
      await player.load(url);

      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      const tracks = player.getVariantTracks();
      const qualities = tracks
        .filter((t: any) => t.type === 'variant' && t.kind === 'audio' && t.language === 'und') // Simplified filter
        .map((t: any, i: number) => ({ height: t.videoHeight || 0, bitrate: Math.round((t.bandwidth || 0) / 1000), id: i }));
      const subtitles = player.getTextTracks().map((t: any) => ({ id: t.id.toString(), label: t.label || t.language, language: t.language }));

      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: null,
        availableQualities: qualities,
        availableSubtitles: subtitles,
        currentQuality: -1,
        isMuted: video.muted,
        isPlaying: true,
        showControls: true
      }));
      return () => player.removeEventListener('error', onError);
    } catch (error) { throw error; }
  };

  const initNativePlayer = (url: string, video: HTMLVideoElement) => {
    video.src = url;
    const onLoadedMetadata = () => {
      if (!isMountedRef.current) return;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      video.muted = muted;
      if (autoPlay) video.play().catch(console.warn);
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: null,
        isMuted: video.muted,
        isPlaying: true,
        showControls: true
      }));
    };
    const onError = () => {
      if (!isMountedRef.current) return;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Failed to load stream with native player' }));
    };
    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    video.addEventListener('error', onError, { once: true });
    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);
    };
  };

  const formatTime = (time: number): string => {
    if (!isFinite(time) || time <= 0) return "0:00";
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` : `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // --- Player Event Handlers (from src 18.txt) ---
  const handleRetry = useCallback(() => initializePlayer(), [initializePlayer]);

  const startControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && playerState.isPlaying && !playerState.showSettings) {
        setPlayerState(prev => ({ ...prev, showControls: false }));
      }
    }, CONTROLS_HIDE_DELAY);
  }, [playerState.isPlaying, playerState.showSettings]);

  const resetControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
    if (playerState.isPlaying && !playerState.showSettings) {
      controlsTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) setPlayerState(prev => ({ ...prev, showControls: false }));
      }, CONTROLS_HIDE_DELAY);
    }
  }, [playerState.isPlaying, playerState.showSettings]);

  useEffect(() => {
    isMountedRef.current = true;
    initializePlayer();
    return () => {
      isMountedRef.current = false;
      destroyPlayer();
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [streamUrl, initializePlayer, destroyPlayer]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isPlaying: true })); lastActivityRef.current = Date.now(); };
    const handlePause = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isPlaying: false })); lastActivityRef.current = Date.now(); };
    const handleWaiting = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isPlaying: false })); };
    const handlePlaying = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isPlaying: true })); };
    const handleTimeUpdate = () => { if (!isMountedRef.current || !video || playerState.isSeeking) return; const buffered = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0; setPlayerState(prev => ({ ...prev, currentTime: video.currentTime, duration: video.duration || 0, buffered: buffered })); };
    const handleVolumeChange = () => { if (!isMountedRef.current || !video) return; setPlayerState(prev => ({ ...prev, isMuted: video.muted })); };
    const handleEnterPip = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isFullscreen: true })); };
    const handleLeavePip = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isFullscreen: false })); };
    const handleFullscreenChange = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isFullscreen: !!document.fullscreenElement })); };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('enterpictureinpicture', handleEnterPip);
    video.addEventListener('leavepictureinpicture', handleLeavePip);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('enterpictureinpicture', handleEnterPip);
      video.removeEventListener('leavepictureinpicture', handleLeavePip);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const calculateNewTime = useCallback((clientX: number): number | null => {
    const video = videoRef.current; const progressBar = progressRef.current; if (!video || !progressBar || !isFinite(video.duration) || video.duration <= 0) return null; const rect = progressBar.getBoundingClientRect(); const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width)); const percentage = clickX / rect.width; return percentage * video.duration;
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); const video = videoRef.current; if (!video || !isFinite(video.duration) || video.duration <= 0) return; wasPlayingBeforeSeekRef.current = !video.paused; dragStartRef.current = { isDragging: true }; setPlayerState(prev => ({ ...prev, isSeeking: true, showControls: true })); video.pause(); lastActivityRef.current = Date.now();
  }, []);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current?.isDragging) return; const newTime = calculateNewTime(e.clientX); if (newTime !== null) { seekTimeRef.current = newTime; }
  }, [calculateNewTime]);

  const handleDragEnd = useCallback(() => {
    if (!dragStartRef.current?.isDragging) return; const video = videoRef.current; if (video) { video.currentTime = seekTimeRef.current; if (wasPlayingBeforeSeekRef.current) video.play().catch(console.error); } dragStartRef.current = null; setPlayerState(prev => ({ ...prev, isSeeking: false, isPlaying: !video?.paused, showControls: true })); lastActivityRef.current = Date.now();
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const newTime = calculateNewTime(e.clientX); if (newTime !== null && videoRef.current) videoRef.current.currentTime = newTime; setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now();
  }, [calculateNewTime]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current; if (!video) return; if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) { if (video.paused) shakaPlayerRef.current.play().catch(console.error); else shakaPlayerRef.current.pause(); } else { if (video.paused) video.play().catch(console.error); else video.pause(); } setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now();
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current; if (video) { video.muted = !video.muted; setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now(); }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current; if (!container) return;
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); } else { await container.requestFullscreen(); }
    } catch (err) { console.error("Error toggling fullscreen:", err); }
    setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now();
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current; if (!video || !document.pictureInPictureEnabled) return; if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now();
  }, []);

  const handlePlayerClick = useCallback((e: React.MouseEvent) => {
    if (playerState.showSettings) { setPlayerState(prev => ({ ...prev, showSettings: false, showControls: true })); lastActivityRef.current = Date.now(); return; } const newShowControls = !playerState.showControls; setPlayerState(prev => ({ ...prev, showControls: newShowControls })); lastActivityRef.current = Date.now(); if (newShowControls && playerState.isPlaying) startControlsTimer();
  }, [playerState.showSettings, playerState.showControls, playerState.isPlaying, startControlsTimer]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!playerState.showSettings) resetControlsTimer();
  }, [resetControlsTimer, playerState.showSettings]);

  useEffect(() => {
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, [handleDragMove, handleDragEnd]);

  // --- Settings Logic (Updated for Flat List in Landscape) ---
  const changeQuality = useCallback((qualityId: number) => {
    if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      shakaPlayerRef.current.configure({ abr: { enabled: false } });
      const tracks = shakaPlayerRef.current.getVariantTracks();
      const targetTrack = tracks.find((t: any) => t.id === qualityId);
      if (targetTrack) shakaPlayerRef.current.selectVariantTrack(targetTrack, true);
    } else if (playerTypeRef.current === 'hls' && hlsRef.current) {
      hlsRef.current.currentLevel = qualityId;
    }
    setPlayerState(prev => ({ ...prev, currentQuality: qualityId, showSettings: false, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

  const changeSubtitle = useCallback((subtitleId: string) => {
    if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      if (subtitleId === 'off') {
        shakaPlayerRef.current.selectTextTrack(null);
      } else {
        const tracks = shakaPlayerRef.current.getTextTracks();
        const targetTrack = tracks.find((t: any) => t.id.toString() === subtitleId);
        if (targetTrack) {
          shakaPlayerRef.current.selectTextTrack(targetTrack);
          shakaPlayerRef.current.setTextTrackVisibility(true);
        } else {
          shakaPlayerRef.current.setTextTrackVisibility(false);
        }
      }
    }
    setPlayerState(prev => ({ ...prev, currentSubtitle: subtitleId === 'off' ? null : subtitleId, showSettings: false, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

  const changeSpeed = useCallback((speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setPlayerState(prev => ({ ...prev, playbackSpeed: speed, showSettings: false, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

  // Determine if we are in landscape mode for the new layout
  const isLandscapeFlat = playerState.isLandscape && playerState.showSettings;

  if (playerState.error && !playerState.isLoading) {
    return (
      <div className={`w-full h-full bg-black flex items-center justify-center ${className}`}>
        <div className="text-center text-white">
          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-2" />
          <h3 className="text-lg font-semibold">Error Loading Stream</h3>
          <p className="text-sm text-gray-400 mb-4">{playerState.error}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 mx-auto"
          >
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-black overflow-hidden ${className}`}
      onClick={handlePlayerClick}
      onMouseMove={handleMouseMove}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        muted={muted}
        playsInline
      />

      {playerState.isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
            <div className="text-sm">Loading stream...</div>
          </div>
        </div>
      )}

      <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity duration-300 ${playerState.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          {playerState.availableSubtitles.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setPlayerState(prev => ({ ...prev, showSettings: true })); }}
              className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-all"
              title="Subtitles"
            >
              <Subtitles size={18} />
            </button>
          )}
          {(playerState.availableQualities.length > 0 || playerState.availableSubtitles.length > 0) && (
            <button
              onClick={(e) => { e.stopPropagation(); setPlayerState(prev => ({ ...prev, showSettings: true })); }}
              className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-all"
              title="Settings"
            >
              <Settings size={18} />
            </button>
          )}
        </div>

        {!playerState.isPlaying && !playerState.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={togglePlay}
              className="p-4 bg-black/60 backdrop-blur-sm rounded-full text-white hover:bg-black/80 transition-all"
            >
              <Play size={24} />
            </button>
          </div>
        )}

        <div className="absolute bottom-4 left-4 right-4 z-10">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={togglePlay}
              className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-all"
            >
              {playerState.isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              onClick={toggleMute}
              className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-all"
            >
              {playerState.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <div className="text-white text-sm ml-2">
              {formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}
            </div>
            <div className="flex-1" />
            <button
              onClick={togglePip}
              className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-all"
              title="Picture in Picture"
              disabled={!document.pictureInPictureEnabled}
            >
              <PictureInPicture2 size={18} />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-all"
              title={playerState.isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {playerState.isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
          <div
            ref={progressRef}
            className="w-full h-1.5 bg-gray-700 rounded-full cursor-pointer relative overflow-hidden"
            onClick={handleProgressClick}
            onMouseDown={handleDragStart}
          >
            <div
              className="absolute top-0 left-0 h-full bg-gray-500"
              style={{ width: `${playerState.buffered / playerState.duration * 100 || 0}%` }}
            />
            <div
              className="absolute top-0 left-0 h-full bg-blue-500"
              style={{ width: `${playerState.currentTime / playerState.duration * 100 || 0}%` }}
            />
            <div
              className="absolute top-1/2 w-3 h-3 bg-blue-500 rounded-full transform -translate-x-1/2 -translate-y-1/2 opacity-0 hover:opacity-100 transition-opacity"
              style={{ left: `${playerState.currentTime / playerState.duration * 100 || 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Settings Panel - Accordion (Portrait) or Flat List (Landscape) */}
      {/* Use Drawer for portrait, Dialog for landscape with flat layout */}
      {!isLandscapeFlat ? (
        // Accordion Drawer for Portrait
        <Drawer open={playerState.showSettings} onOpenChange={(open) => setPlayerState(prev => ({ ...prev, showSettings: open }))}>
          <DrawerContent className="max-h-[80vh]">
            <DrawerHeader>
              <DrawerTitle>Settings</DrawerTitle>
            </DrawerHeader>
            <div className="p-4 overflow-y-auto">
              <Accordion type="single" collapsible className="w-full">
                {playerState.availableQualities.length > 0 && (
                  <AccordionItem value="quality">
                    <AccordionTrigger className="text-white text-base font-medium hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span>Quality</span>
                        <span className="text-xs text-gray-400">
                          {playerState.currentQuality === -1
                            ? 'Auto'
                            : `${playerState.availableQualities.find(q => q.id === playerState.currentQuality)?.height || 'Unknown'}p`
                          }
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-1 pt-2">
                        <button
                          onClick={() => changeQuality(-1)}
                          className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                            playerState.currentQuality === -1 ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          Auto
                        </button>
                        {playerState.availableQualities.map(quality => (
                          <button
                            key={quality.id}
                            onClick={() => changeQuality(quality.id)}
                            className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                              playerState.currentQuality === quality.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'
                            }`}
                          >
                            {quality.height}p ({quality.bitrate} kbps)
                          </button>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {playerState.availableSubtitles.length > 0 && (
                  <AccordionItem value="subtitles">
                    <AccordionTrigger className="text-white text-base font-medium hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span>Subtitles</span>
                        <span className="text-xs text-gray-400">
                          {playerState.currentSubtitle ? playerState.availableSubtitles.find(s => s.id === playerState.currentSubtitle)?.label : 'Off'}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-1 pt-2">
                        <button
                          onClick={() => changeSubtitle('off')}
                          className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                            !playerState.currentSubtitle ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          Off
                        </button>
                        {playerState.availableSubtitles.map(subtitle => (
                          <button
                            key={subtitle.id}
                            onClick={() => changeSubtitle(subtitle.id)}
                            className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                              playerState.currentSubtitle === subtitle.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'
                            }`}
                          >
                            {subtitle.label}
                          </button>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                <AccordionItem value="speed">
                  <AccordionTrigger className="text-white text-base font-medium hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span>Playback Speed</span>
                      <span className="text-xs text-gray-400">
                        {playerState.playbackSpeed === 1 ? 'Normal' : `${playerState.playbackSpeed}x`}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1 pt-2">
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                        <button
                          key={speed}
                          onClick={() => changeSpeed(speed)}
                          className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                            playerState.playbackSpeed === speed ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          {speed === 1 ? 'Normal' : `${speed}x`}
                        </button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        // Flat List Dialog for Landscape Mode
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-popover text-popover-foreground rounded-lg shadow-lg overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="text-lg font-semibold">Settings</h3>
            </div>
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Quality Setting */}
              {playerState.availableQualities.length > 0 && (
                <div
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent cursor-pointer"
                  onClick={() => setPlayerState(prev => ({ ...prev, showSettings: false, isQualityMenuOpen: true }))} // Example: open submenu
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-full bg-blue-500/10">
                      <div className="w-4 h-4 bg-blue-500 rounded-sm"></div> {/* Placeholder icon */}
                    </div>
                    <span className="font-medium">Quality</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">
                      {playerState.currentQuality === -1
                        ? 'Auto'
                        : `${playerState.availableQualities.find(q => q.id === playerState.currentQuality)?.height || 'Unknown'}p`
                      }
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              )}

              {/* Subtitles Setting */}
              {playerState.availableSubtitles.length > 0 && (
                <div
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent cursor-pointer"
                  onClick={() => setPlayerState(prev => ({ ...prev, showSettings: false, isSubtitleMenuOpen: true }))} // Example: open submenu
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-full bg-green-500/10">
                      <div className="w-4 h-4 bg-green-500 rounded-sm"></div> {/* Placeholder icon */}
                    </div>
                    <span className="font-medium">Subtitles</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">
                      {playerState.currentSubtitle ? playerState.availableSubtitles.find(s => s.id === playerState.currentSubtitle)?.label : 'Off'}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              )}

              {/* Playback Speed Setting */}
              <div
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent cursor-pointer"
                onClick={() => setPlayerState(prev => ({ ...prev, showSettings: false, isSpeedMenuOpen: true }))} // Example: open submenu
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-full bg-purple-500/10">
                    <div className="w-4 h-4 bg-purple-500 rounded-sm"></div> {/* Placeholder icon */}
                  </div>
                  <span className="font-medium">Playback Speed</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground">
                    {playerState.playbackSpeed === 1 ? 'Normal' : `${playerState.playbackSpeed}x`}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end">
              <button
                onClick={() => setPlayerState(prev => ({ ...prev, showSettings: false }))}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
