// /src/components/VideoPlayer.tsx - Merged Version with Fixes
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2,
  AlertCircle, RotateCcw, Settings, PictureInPicture2, Subtitles
} from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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

const PLAYER_LOAD_TIMEOUT = 20000;
const CONTROLS_HIDE_DELAY = 4000;

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamUrl,
  channelName,
  autoPlay = true,
  muted = false,
  className = ""
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hlsRef = useRef<any>(null);
  const shakaPlayerRef = useRef<any>(null);
  const playerTypeRef = useRef<'hls' | 'shaka' | 'native' | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const progressRef = useRef<HTMLDivElement>(null);

  const dragStartRef = useRef<{ isDragging: boolean } | null>(null);
  const wasPlayingBeforeSeekRef = useRef(false);
  const seekTimeRef = useRef(0);

  const [playerState, setPlayerState] = useState({
    isPlaying: false,
    isMuted: muted,
    isLoading: true,
    error: null as string | null,
    isFullscreen: false,
    showControls: true,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    showSettings: false,
    currentQuality: -1,
    availableQualities: [] as QualityLevel[],
    availableSubtitles: [] as SubtitleTrack[],
    currentSubtitle: '',
    isSeeking: false,
    isPipActive: false,
    isLive: false,
    seekableStart: 0,
    seekableEnd: 0,
  });

  const detectStreamType = useCallback((url: string): { type: 'hls' | 'dash' | 'native'; cleanUrl: string; drmInfo?: any } => {
    let cleanUrl = url;
    let drmInfo = null;

    if (url.includes('?|')) {
      const parts = url.split('?|');
      cleanUrl = parts[0];
      const drmParamsStr = parts[1] || '';
      
      if (drmParamsStr) {
        const params = new URLSearchParams(drmParamsStr);
        const drmScheme = params.get('drmScheme');
        const drmLicense = params.get('drmLicense');
        
        if (drmScheme && drmLicense) {
          drmInfo = { scheme: drmScheme, license: drmLicense };
        }
      }
    }

    const urlLower = cleanUrl.toLowerCase();
    
    if (urlLower.includes('.mpd') || urlLower.includes('/dash/') || drmInfo) {
      return { type: 'dash', cleanUrl, drmInfo };
    }
    if (urlLower.includes('.m3u8') || urlLower.includes('/hls/')) {
      return { type: 'hls', cleanUrl, drmInfo };
    }
    if (urlLower.includes('.mp4') || urlLower.includes('.webm') || urlLower.includes('.mov')) {
      return { type: 'native', cleanUrl, drmInfo };
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

  const handleRetry = useCallback(() => {
    setPlayerState(prev => ({ ...prev, isLoading: true, error: null }));
    setTimeout(() => {
      if (isMountedRef.current) {
        initializePlayer();
      }
    }, 500);
  }, []);

  const initHlsPlayer = async (url: string, video: HTMLVideoElement) => {
    try {
      const Hls = (await import('hls.js')).default;
      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          initNativePlayer(url, video);
        } else {
          throw new Error('HLS is not supported in this browser.');
        }
        return;
      }
      
      const hls = new Hls({
        enableWorker: true,
        debug: false,
        lowLatencyMode: true,
        backBufferLength: 90,
        fragLoadingMaxRetry: 5,
        manifestLoadingMaxRetry: 3,
        levelLoadingMaxRetry: 4,
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 10000,
      });

      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        if (!isMountedRef.current) return;
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        
        const levels: QualityLevel[] = hls.levels.map((level: any, index: number) => ({
          height: level.height || 0,
          bitrate: Math.round(level.bitrate / 1000),
          id: index
        }));
        
        const isLive = data.details.live;
        video.muted = muted;
        
        if (autoPlay) video.play().catch(console.warn);
        
        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          error: null,
          availableQualities: levels,
          currentQuality: hls.currentLevel,
          isMuted: video.muted,
          isPlaying: !video.paused,
          isLive: isLive,
          duration: isLive ? 0 : video.duration
        }));
        
        startControlsTimer();
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!isMountedRef.current) return;
        console.error('HLS.js Error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('HLS network error, trying to recover...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('HLS media error, trying to recover...');
              hls.recoverMediaError();
              break;
            default:
              if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
              setPlayerState(prev => ({
                ...prev,
                isLoading: false,
                error: `Playback Error: ${data.details}`
              }));
              destroyPlayer();
              break;
          }
        }
      });
    } catch (error) {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load HLS player."
      }));
    }
  };

  const initShakaPlayer = async (url: string, video: HTMLVideoElement, drmInfo?: any) => {
    try {
      const shaka = await import('shaka-player/dist/shaka-player.ui.js');
      shaka.default.polyfill.installAll();
      
      if (!shaka.default.Player.isBrowserSupported()) {
        throw new Error('This browser is not supported by Shaka Player');
      }

      if (shakaPlayerRef.current) {
        await shakaPlayerRef.current.destroy();
      }

      const player = new shaka.default.Player(video);
      shakaPlayerRef.current = player;
      
      player.configure({
        streaming: {
          bufferingGoal: 30,
          rebufferingGoal: 5,
          bufferBehind: 30,
          retryParameters: {
            timeout: 8000,
            maxAttempts: 4,
            baseDelay: 1000,
            backoffFactor: 2,
          },
        },
        manifest: {
          retryParameters: {
            timeout: 8000,
            maxAttempts: 4,
          },
        },
        drm: {
          retryParameters: {
            timeout: 8000,
            maxAttempts: 4,
          }
        },
      });
      
      if (drmInfo?.scheme === 'clearkey' && drmInfo.license?.includes(':')) {
        const [keyId, key] = drmInfo.license.split(':');
        player.configure({
          drm: {
            clearKeys: {
              [keyId]: key
            }
          }
        });
      }

      player.addEventListener('error', (event: any) => {
        console.error('Shaka Player Error:', event.detail);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          error: `Error ${event.detail.code}: ${event.detail.message}`
        }));
        destroyPlayer();
      });

      await player.load(url);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);

      const tracks = player.getVariantTracks();
      const qualities: QualityLevel[] = tracks.map(track => ({
        height: track.height || 0,
        bitrate: Math.round(track.bandwidth / 1000),
        id: track.id
      }));
      
      const textTracks = player.getTextTracks();
      const subtitles: SubtitleTrack[] = textTracks.map(track => ({
        id: track.id.toString(),
        label: track.label || track.language || 'Unknown',
        language: track.language || 'unknown'
      }));

      const isLive = player.isLive();
      video.muted = muted;
      
      if (autoPlay) video.play().catch(console.warn);

      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: null,
        availableQualities: qualities,
        availableSubtitles: subtitles,
        currentQuality: -1,
        isMuted: video.muted,
        isPlaying: !video.paused,
        isLive: isLive,
        duration: isLive ? 0 : video.duration,
      }));
      
      startControlsTimer();
    } catch (error) {
      console.error("Shaka Player init failed:", error);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? `Shaka Error: ${error.message}` : 'Failed to initialize Shaka player'
      }));
    }
  };

  const initNativePlayer = (url: string, video: HTMLVideoElement) => {
    video.src = url;
    
    const onCanPlay = () => {
      if (!isMountedRef.current) return;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      video.muted = muted;
      if (autoPlay) video.play().catch(console.warn);
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: null,
        isMuted: video.muted,
        isPlaying: !video.paused,
        duration: video.duration,
        isLive: !isFinite(video.duration)
      }));
      startControlsTimer();
    };
    
    video.addEventListener('canplay', onCanPlay, { once: true });
  };
    
  const initializePlayer = useCallback(async () => {
    if (!streamUrl || !videoRef.current) return;
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
        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          error: "Stream took too long to load. Check the stream URL and your connection."
        }));
        destroyPlayer();
      }
    }, PLAYER_LOAD_TIMEOUT);

    try {
      const { type, cleanUrl, drmInfo } = detectStreamType(streamUrl);
      playerTypeRef.current = type;
      
      if (type === 'dash') {
        await initShakaPlayer(cleanUrl, video, drmInfo);
      } else if (type === 'hls') {
        await initHlsPlayer(cleanUrl, video);
      } else {
        initNativePlayer(cleanUrl, video);
      }
    } catch (error) {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize player'
      }));
    }
  }, [streamUrl, autoPlay, muted, destroyPlayer, detectStreamType]);

  useEffect(() => {
    isMountedRef.current = true;
    initializePlayer();
    return () => {
      isMountedRef.current = false;
      destroyPlayer();
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (screen.orientation && typeof screen.orientation.unlock === 'function') {
        screen.orientation.unlock();
      }
    };
  }, [streamUrl, initializePlayer, destroyPlayer]);

  // Player event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (!isMountedRef.current || !video || playerState.isSeeking) return;
      
      let seekableStart = 0;
            let seekableEnd = video.duration || 0;
      const isLive = !isFinite(video.duration) || video.duration === Infinity;

      if (shakaPlayerRef.current && shakaPlayerRef.current.isLive()) {
        const seekRange = shakaPlayerRef.current.seekRange();
        seekableStart = seekRange.start;
        seekableEnd = seekRange.end;
      } else if (video.seekable.length > 0) {
        seekableStart = video.seekable.start(0);
        seekableEnd = video.seekable.end(video.seekable.length - 1);
      }

      const buffered = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;

      setPlayerState(prev => ({
        ...prev,
        currentTime: video.currentTime,
        duration: isLive ? 0 : video.duration,
        buffered: buffered,
        isLive,
        seekableStart,
        seekableEnd,
      }));
    };

    const handlePlay = () => {
      if (!isMountedRef.current) return;
      setPlayerState(prev => ({ ...prev, isPlaying: true }));
    };

    const handlePause = () => {
      if (!isMountedRef.current) return;
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    };

    const handleWaiting = () => {
      if (!isMountedRef.current) return;
      setPlayerState(prev => ({ ...prev, isLoading: true }));
    };

    const handlePlaying = () => {
      if (!isMountedRef.current) return;
      setPlayerState(prev => ({ ...prev, isLoading: false, isPlaying: true }));
    };

    const handleVolumeChange = () => {
      if (!isMountedRef.current || !video) return;
      setPlayerState(prev => ({ ...prev, isMuted: video.muted }));
    };

    const handleEnterPip = () => {
      if (!isMountedRef.current) return;
      setPlayerState(prev => ({ ...prev, isPipActive: true }));
    };

    const handleLeavePip = () => {
      if (!isMountedRef.current) return;
      setPlayerState(prev => ({ ...prev, isPipActive: false }));
    };

    const handleFullscreenChange = () => {
      if (!isMountedRef.current) return;
      const isFullscreen = !!document.fullscreenElement;
      setPlayerState(prev => ({ ...prev, isFullscreen }));
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('enterpictureinpicture', handleEnterPip);
    video.addEventListener('leavepictureinpicture', handleLeavePip);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('enterpictureinpicture', handleEnterPip);
      video.removeEventListener('leavepictureinpicture', handleLeavePip);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [playerState.isSeeking]);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
        if (window.screen.orientation && typeof window.screen.orientation.lock === 'function') {
          try {
            await window.screen.orientation.lock('landscape');
          } catch (err) {
            console.warn("Could not lock screen orientation:", err);
          }
        }
      } else {
        await document.exitFullscreen();
        if (window.screen.orientation && typeof window.screen.orientation.unlock === 'function') {
          window.screen.orientation.unlock();
        }
      }
    } catch (error) {
      console.error('Fullscreen API error:', error);
    }
  }, []);

  const formatTime = (time: number): string => {
    if (!isFinite(time) || time < 0) return "00:00";
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const startControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && playerState.isPlaying && !playerState.showSettings) {
        setPlayerState(prev => ({ ...prev, showControls: false }));
      }
    }, CONTROLS_HIDE_DELAY);
  }, [playerState.isPlaying, playerState.showSettings]);

  const resetControlsTimer = useCallback(() => {
    setPlayerState(prev => ({ ...prev, showControls: true }));
    if (playerState.isPlaying) {
      startControlsTimer();
    }
  }, [playerState.isPlaying, startControlsTimer]);

  const handleMouseMove = useCallback(() => {
    if (!playerState.showSettings) {
      resetControlsTimer();
    }
  }, [resetControlsTimer, playerState.showSettings]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(err => {
        console.error("Play failed:", err);
        setPlayerState(prev => ({ ...prev, error: "Autoplay might be blocked by the browser." }));
      });
    } else {
      video.pause();
    }
    resetControlsTimer();
  }, [resetControlsTimer]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
      resetControlsTimer();
    }
  }, [resetControlsTimer]);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (error) {
      console.error('PiP error:', error);
    }
  }, []);

  const handlePlayerClick = useCallback((e: React.MouseEvent) => {
    // Don't toggle controls if clicking on controls area
    const target = e.target as HTMLElement;
    if (target.closest('.controls-area')) return;
    
    setPlayerState(prev => ({ ...prev, showControls: !prev.showControls }));
    if (!playerState.showControls && playerState.isPlaying) {
      startControlsTimer();
    }
  }, [playerState.showControls, playerState.isPlaying, startControlsTimer]);

  // Seek functionality
  const calculateNewTime = useCallback((clientX: number): number | null => {
    const video = videoRef.current;
    const progressBar = progressRef.current;
    if (!video || !progressBar || playerState.isLive) return null;
    
    const rect = progressBar.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = clickX / rect.width;
    return percentage * video.duration;
  }, [playerState.isLive]);

  const handleSeekStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || playerState.isLive) return;
    
    wasPlayingBeforeSeekRef.current = !video.paused;
    dragStartRef.current = { isDragging: true };
    setPlayerState(prev => ({ ...prev, isSeeking: true, showControls: true }));
    video.pause();
  }, [playerState.isLive]);

  const handleSeekMove = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current?.isDragging) return;
    
    const newTime = calculateNewTime(e.clientX);
    if (newTime !== null) {
      setPlayerState(prev => ({ ...prev, currentTime: newTime, showControls: true }));
      seekTimeRef.current = newTime;
    }
  }, [calculateNewTime]);

  const handleSeekEnd = useCallback(() => {
    if (!dragStartRef.current?.isDragging) return;
    
    const video = videoRef.current;
    if (video) {
      video.currentTime = seekTimeRef.current;
      if (wasPlayingBeforeSeekRef.current) {
        video.play().catch(console.error);
      }
    }
    
    dragStartRef.current = null;
    setPlayerState(prev => ({ ...prev, isSeeking: false }));
    resetControlsTimer();
  }, [resetControlsTimer]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (playerState.isLive) return;
    
    const newTime = calculateNewTime(e.clientX);
    if (newTime !== null && videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
    resetControlsTimer();
  }, [calculateNewTime, playerState.isLive, resetControlsTimer]);

  // Quality and subtitle changes
  const changeQuality = useCallback((qualityId: number) => {
    if (playerTypeRef.current === 'hls' && hlsRef.current) {
      hlsRef.current.currentLevel = qualityId;
    } else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      if (qualityId === -1) {
        shakaPlayerRef.current.configure({ abr: { enabled: true } });
      } else {
        shakaPlayerRef.current.configure({ abr: { enabled: false } });
        const tracks = shakaPlayerRef.current.getVariantTracks();
        const targetTrack = tracks.find((t: any) => t.id === qualityId);
        if (targetTrack) {
          shakaPlayerRef.current.selectVariantTrack(targetTrack, true);
        }
      }
    }
    setPlayerState(prev => ({ ...prev, currentQuality: qualityId }));
  }, []);

  const changeSubtitle = useCallback((subtitleId: string) => {
    if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      if (subtitleId === '') {
        shakaPlayerRef.current.setTextTrackVisibility(false);
      } else {
        const tracks = shakaPlayerRef.current.getTextTracks();
        const targetTrack = tracks.find((t: any) => t.id.toString() === subtitleId);
        if (targetTrack) {
          shakaPlayerRef.current.selectTextTrack(targetTrack);
          shakaPlayerRef.current.setTextTrackVisibility(true);
        }
      }
    }
    setPlayerState(prev => ({ ...prev, currentSubtitle: subtitleId }));
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleSeekMove);
    document.addEventListener('mouseup', handleSeekEnd);
    return () => {
      document.removeEventListener('mousemove', handleSeekMove);
      document.removeEventListener('mouseup', handleSeekEnd);
    };
  }, [handleSeekMove, handleSeekEnd]);

  const isSeekable = !playerState.isLive && playerState.duration > 0 && isFinite(playerState.duration);
  const currentTimePercentage = isSeekable ? (playerState.currentTime / playerState.duration) * 100 : 0;
  const bufferedPercentage = isSeekable ? (playerState.buffered / playerState.duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`relative bg-black w-full h-full group/player ${className}`}
      onMouseMove={handleMouseMove}
      onClick={handlePlayerClick}
    >
      <video ref={videoRef} className="w-full h-full object-contain" playsInline />
      
      {playerState.isLoading && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
          <div className="text-center text-white">
            <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin" />
            <p className="text-lg font-medium">Loading Stream...</p>
            <p className="text-sm text-gray-400">{channelName}</p>
          </div>
        </div>
      )}

      {playerState.error && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20 text-center text-white p-4">
          <div>
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-xl font-bold mb-2">Stream Error</h3>
            <p className="text-gray-300 mb-6 max-w-md mx-auto">{playerState.error}</p>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            >
              <RotateCcw size={16} /> Retry
            </button>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={`controls-area absolute inset-0 transition-opacity duration-300 z-10 ${
          playerState.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/50 pointer-events-none"></div>
        
        {/* Top Controls */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center">
          <h3 className="text-white text-lg font-bold drop-shadow-md">{channelName}</h3>
          <div className="flex items-center gap-2">
            {playerState.availableSubtitles.length > 0 && (
              <button
                onClick={() => setPlayerState(p => ({ ...p, showSettings: true }))}
                className="p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-all"
                                title="Subtitles"
              >
                <Subtitles size={20} />
              </button>
            )}
            {(playerState.availableQualities.length > 0 || playerState.availableSubtitles.length > 0) && (
              <button
                onClick={() => setPlayerState(p => ({ ...p, showSettings: true }))}
                className="p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-all"
                title="Settings"
              >
                <Settings size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Center Play Button */}
        {!playerState.isPlaying && !playerState.isLoading && !playerState.error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button
              onClick={togglePlay}
              className="pointer-events-auto w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all scale-100 hover:scale-110"
            >
              <Play size={36} fill="white" className="ml-1" />
            </button>
          </div>
        )}
        
        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
          {/* Seek Bar */}
          {isSeekable && (
            <div 
              ref={progressRef} 
              className="relative h-1.5 bg-white/20 rounded-full group/seekbar cursor-pointer"
              onClick={handleProgressClick}
            >
              <div 
                className="absolute h-full bg-white/40 rounded-full" 
                style={{ width: `${bufferedPercentage}%` }} 
              />
              <div 
                className="absolute h-full bg-red-500 rounded-full" 
                style={{ width: `${currentTimePercentage}%` }} 
              />
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-red-500 transition-transform duration-150 ease-out group-hover/seekbar:scale-125" 
                style={{ left: `${currentTimePercentage}%` }}
                onMouseDown={handleSeekStart}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {/* Main Controls Row */}
          <div className="flex items-center gap-4 text-white">
            <button 
              onClick={togglePlay}
              className="hover:scale-110 transition-transform"
            >
              {playerState.isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            
            <button
              onClick={toggleMute}
              className="hover:scale-110 transition-transform"
            >
              {playerState.isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
            </button>
            
            {/* Time Display or Live Badge */}
            {playerState.isLive ? (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-semibold uppercase">LIVE</span>
              </div>
            ) : (
              <div className="text-sm font-mono">
                {formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}
              </div>
            )}
            
            <div className="flex-grow"></div>
            
            {document.pictureInPictureEnabled && (
              <button 
                onClick={togglePip}
                className="hover:scale-110 transition-transform"
                title="Picture-in-picture"
              >
                <PictureInPicture2 size={20} />
              </button>
            )}
            
            <button 
              onClick={toggleFullscreen}
              className="hover:scale-110 transition-transform"
              title="Fullscreen"
            >
              {playerState.isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
            </button>
          </div>
        </div>
      </div>

      {/* Settings Drawer */}
      <Drawer 
        open={playerState.showSettings} 
        onOpenChange={(isOpen) => setPlayerState(p => ({ ...p, showSettings: isOpen }))}
      >
        <DrawerContent className="bg-[#0a0a0a] text-white border-t border-gray-700 outline-none landscape:max-w-md landscape:mx-auto">
          <DrawerHeader>
            <DrawerTitle className="text-center text-xl">Stream Settings</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 overflow-y-auto max-h-[60vh]">
            <Accordion type="single" collapsible className="w-full">
              {/* Quality Settings */}
              {playerState.availableQualities.length > 0 && (
                <AccordionItem value="quality" className="border-b border-gray-700">
                  <AccordionTrigger className="text-white hover:no-underline">
                    Quality
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1 pt-2">
                      <button
                        onClick={() => changeQuality(-1)}
                        className={`w-full text-left px-3 py-2 rounded transition-colors ${
                          playerState.currentQuality === -1 
                            ? 'bg-blue-600 text-white' 
                            : 'text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        Auto
                      </button>
                      {playerState.availableQualities.map((quality) => (
                        <button
                          key={quality.id}
                          onClick={() => changeQuality(quality.id)}
                          className={`w-full text-left px-3 py-2 rounded transition-colors ${
                            playerState.currentQuality === quality.id 
                              ? 'bg-blue-600 text-white' 
                              : 'text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          {quality.height}p ({quality.bitrate} kbps)
                        </button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* Subtitle Settings */}
              {playerState.availableSubtitles.length > 0 && (
                <AccordionItem value="subtitles" className="border-b border-gray-700">
                  <AccordionTrigger className="text-white hover:no-underline">
                    Subtitles
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1 pt-2">
                      <button
                        onClick={() => changeSubtitle('')}
                        className={`w-full text-left px-3 py-2 rounded transition-colors ${
                          playerState.currentSubtitle === '' 
                            ? 'bg-blue-600 text-white' 
                            : 'text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        Off
                      </button>
                      {playerState.availableSubtitles.map((subtitle) => (
                        <button
                          key={subtitle.id}
                          onClick={() => changeSubtitle(subtitle.id)}
                          className={`w-full text-left px-3 py-2 rounded transition-colors ${
                            playerState.currentSubtitle === subtitle.id 
                              ? 'bg-blue-600 text-white' 
                              : 'text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          {subtitle.label}
                        </button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* Playback Speed */}
              <AccordionItem value="playback-speed" className="border-b border-gray-700">
                <AccordionTrigger className="text-white hover:no-underline">
                  Playback Speed
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-1 pt-2">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                      <button
                        key={speed}
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.playbackRate = speed;
                          }
                          setPlayerState(prev => ({ ...prev, showSettings: false }));
                        }}
                        className={`w-full text-left px-3 py-2 rounded transition-colors ${
                          videoRef.current?.playbackRate === speed 
                            ? 'bg-blue-600 text-white' 
                            : 'text-gray-300 hover:bg-white/10'
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
    </div>
  );
};

export default VideoPlayer;
