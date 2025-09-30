// /src/components/VideoPlayer.tsx - Fixed Version with Shaka Player Only
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2, AlertCircle, RotateCcw, Settings, PictureInPicture2, Subtitles } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

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

const PLAYER_LOAD_TIMEOUT = 30000; // 30 seconds
const CONTROLS_HIDE_DELAY = 4000;

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamUrl,
  channelName,
  autoPlay = true,
  muted = true,
  className = ""
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shakaPlayerRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const progressRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const dragStartRef = useRef<{ isDragging: boolean; startX: number } | null>(null);
  const wasPlayingBeforeSeekRef = useRef(false);

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
    isLandscape: false,
    expandedSection: '' as string,
  });

  const detectStreamType = useCallback((url: string): { type: 'hls' | 'dash' | 'native'; cleanUrl: string; drmInfo?: any } => {
    let cleanUrl = url;
    let drmInfo = null;
    
    if (url.includes('?|') || url.includes('|')) {
      const separator = url.includes('?|') ? '?|' : '|';
      const [baseUrl, drmParams] = url.split(separator);
      cleanUrl = baseUrl;
      
      if (drmParams) {
        const params = new URLSearchParams(drmParams);
        const drmScheme = params.get('drmScheme');
        const drmLicense = params.get('drmLicense');
        
        if (drmScheme && drmLicense) {
          drmInfo = { scheme: drmScheme, license: drmLicense };
        }
      }
    }
  
    const urlLower = cleanUrl.toLowerCase();
    
    if (urlLower.includes('.mpd') || urlLower.includes('/dash/') || urlLower.includes('dash') || drmInfo) {
      return { type: 'dash', cleanUrl, drmInfo };
    }
    if (urlLower.includes('.m3u8') || urlLower.includes('/hls/') || urlLower.includes('hls')) {
      return { type: 'hls', cleanUrl, drmInfo };
    }
    if (urlLower.includes('.mp4') || urlLower.includes('.webm')) {
      return { type: 'native', cleanUrl, drmInfo };
    }
    
    return { type: 'hls', cleanUrl, drmInfo };
  }, []);

  const destroyPlayer = useCallback(() => {
    if (shakaPlayerRef.current) {
      try {
        shakaPlayerRef.current.destroy();
      } catch (e) {
        console.warn('Error destroying player:', e);
      }
      shakaPlayerRef.current = null;
    }
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
  }, []);

  const initShakaPlayer = useCallback(async (url: string, video: HTMLVideoElement, drmInfo?: any) => {
    try {
      const shaka = await import('shaka-player/dist/shaka-player.ui.js');
      shaka.default.polyfill.installAll();
      
      if (!shaka.default.Player.isBrowserSupported()) {
        throw new Error('Browser not supported by Shaka Player');
      }

      if (shakaPlayerRef.current) {
        await shakaPlayerRef.current.destroy();
      }

      const player = new shaka.default.Player(video);
      shakaPlayerRef.current = player;

      // Enhanced configuration for better streaming
      player.configure({
        streaming: {
          bufferingGoal: 30,
          rebufferingGoal: 10,
          bufferBehind: 30,
          retryParameters: {
            timeout: 30000,
            maxAttempts: 5,
            baseDelay: 1000,
            backoffFactor: 2,
            fuzzFactor: 0.5,
          },
          useNativeHlsOnSafari: false,
          ignoreTextStreamFailures: true,
          alwaysStreamText: false,
          startAtSegmentBoundary: false,
        },
        manifest: {
          retryParameters: {
            timeout: 30000,
            maxAttempts: 5,
            baseDelay: 1000,
            backoffFactor: 2,
            fuzzFactor: 0.5,
          },
          dash: {
            clockSyncUri: '',
            ignoreDrmInfo: false,
          },
        },
        abr: {
          enabled: true,
          defaultBandwidthEstimate: 1000000,
          switchInterval: 8,
          bandwidthUpgradeTarget: 0.85,
          bandwidthDowngradeTarget: 0.95,
        },
      });

      // DRM configuration
      if (drmInfo && drmInfo.scheme === 'clearkey' && drmInfo.license) {
        if (drmInfo.license.includes(':')) {
          const [keyId, key] = drmInfo.license.split(':');
          player.configure({
            drm: {
              clearKeys: { [keyId]: key }
            }
          });
        }
      }

      const onError = (event: any) => {
        if (!isMountedRef.current) return;
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        
        const errorCode = event.detail?.code || 0;
        let errorMessage = 'Stream playback error';
        
        if (errorCode >= 6000 && errorCode < 7000) {
          errorMessage = 'Network error - check your connection or the stream URL';
        } else if (errorCode >= 4000 && errorCode < 5000) {
          errorMessage = 'Media format not supported or corrupted';
        } else if (errorCode >= 1000 && errorCode < 2000) {
          errorMessage = 'DRM/encryption error';
        } else if (errorCode >= 3000 && errorCode < 4000) {
          errorMessage = 'Stream manifest error';
        }
        
        console.error('Shaka Player Error:', event.detail);
        setPlayerState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      };

      player.addEventListener('error', onError);

      // Network engine configuration for better CORS handling
      player.getNetworkingEngine()?.registerRequestFilter((type: any, request: any) => {
        request.allowCrossSiteCredentials = true;
      });

      await player.load(url);
      
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);

      const tracks = player.getVariantTracks();
      const qualities: QualityLevel[] = tracks
        .filter((track: any) => track.height)
        .map((track: any) => ({
          height: track.height || 0,
          bitrate: Math.round((track.bandwidth || 0) / 1000),
          id: track.id,
        }))
        .sort((a: QualityLevel, b: QualityLevel) => b.height - a.height);

      const textTracks = player.getTextTracks();
      const subtitles: SubtitleTrack[] = textTracks.map((track: any) => ({
        id: track.id.toString(),
        label: track.label || track.language || 'Unknown',
        language: track.language || 'unknown',
      }));

      video.muted = muted;
      if (autoPlay) {
        try {
          await video.play();
        } catch (playError) {
          console.warn('Autoplay failed:', playError);
        }
      }

      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: null,
        availableQualities: qualities,
        availableSubtitles: subtitles,
        currentQuality: -1,
        isMuted: video.muted,
        isPlaying: !video.paused,
        showControls: true,
      }));

      startControlsTimer();

      return () => {
        player.removeEventListener('error', onError);
      };
    } catch (error: any) {
      console.error('Shaka Player initialization error:', error);
      throw new Error(error.message || 'Failed to initialize player');
    }
  }, [autoPlay, muted]);

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
      showControls: true,
    }));

    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Stream took too long to load. The stream may be offline or unreachable.',
        }));
        destroyPlayer();
      }
    }, PLAYER_LOAD_TIMEOUT);

    try {
      const { cleanUrl, drmInfo } = detectStreamType(streamUrl);
      await initShakaPlayer(cleanUrl, video, drmInfo);
    } catch (error: any) {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to load stream',
      }));
    }
  }, [streamUrl, destroyPlayer, detectStreamType, initShakaPlayer]);

  const formatTime = (time: number): string => {
    if (!isFinite(time) || time <= 0) return "0:00";
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const changeQuality = useCallback((qualityId: number) => {
    if (shakaPlayerRef.current) {
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
    setPlayerState(prev => ({ ...prev, currentQuality: qualityId, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

  const changeSubtitle = useCallback((subtitleId: string) => {
    if (shakaPlayerRef.current) {
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
    setPlayerState(prev => ({ ...prev, currentSubtitle: subtitleId, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

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
      startControlsTimer();
    }
  }, [playerState.isPlaying, playerState.showSettings, startControlsTimer]);

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

    const handlePlay = () => {
      if (!isMountedRef.current) return;
      setPlayerState(prev => ({ ...prev, isPlaying: true }));
      lastActivityRef.current = Date.now();
    };

    const handlePause = () => {
      if (!isMountedRef.current) return;
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
      lastActivityRef.current = Date.now();
    };

    const handleWaiting = () => {
      if (!isMountedRef.current) return;
      setPlayerState(prev => ({ ...prev, isLoading: true }));
    };

    const handlePlaying = () => {
      if (!isMountedRef.current) return;
      setPlayerState(prev => ({ ...prev, isLoading: false, isPlaying: true }));
      lastActivityRef.current = Date.now();
    };

    const handleTimeUpdate = () => {
      if (!isMountedRef.current || !video || playerState.isSeeking) return;
      const buffered = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
      setPlayerState(prev => ({
        ...prev,
        currentTime: video.currentTime,
        duration: video.duration || 0,
        buffered: buffered,
      }));
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
      if (isFullscreen) resetControlsTimer();
    };

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
  }, [playerState.isSeeking, resetControlsTimer]);

  // Improved seekbar handling
  const calculateNewTime = useCallback((clientX: number): number | null => {
    const video = videoRef.current;
    const progressBar = progressRef.current;
    if (!video || !progressBar || !isFinite(video.duration) || video.duration <= 0) return null;
    
    const rect = progressBar.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = clickX / rect.width;
    return percentage * video.duration;
  }, []);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const video = videoRef.current;
    if (!video || !isFinite(video.duration) || video.duration <= 0) return;
    
    wasPlayingBeforeSeekRef.current = !video.paused;
    dragStartRef.current = { isDragging: true, startX: e.clientX };
    
    setPlayerState(prev => ({ ...prev, isSeeking: true, showControls: true }));
    if (!video.paused) video.pause();
    
    lastActivityRef.current = Date.now();
  }, []);

  const handleProgressMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current?.isDragging) return;
    
    const newTime = calculateNewTime(e.clientX);
    if (newTime !== null && videoRef.current) {
      videoRef.current.currentTime = newTime;
      setPlayerState(prev => ({ ...prev, currentTime: newTime, showControls: true }));
    }
    
    lastActivityRef.current = Date.now();
  }, [calculateNewTime]);

  const handleProgressMouseUp = useCallback(() => {
    if (!dragStartRef.current?.isDragging) return;
    
    const video = videoRef.current;
    if (video && wasPlayingBeforeSeekRef.current) {
      video.play().catch(console.error);
    }
    
    dragStartRef.current = null;
    setPlayerState(prev => ({ ...prev, isSeeking: false, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (dragStartRef.current?.isDragging) return;
    
    const newTime = calculateNewTime(e.clientX);
    if (newTime !== null && videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
  }, [calculateNewTime]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    if (video.paused) {
      video.play().catch(console.error);
    } else {
      video.pause();
    }
    
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
      setPlayerState(prev => ({ ...prev, showControls: true }));
      lastActivityRef.current = Date.now();
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        // Exit landscape on fullscreen exit
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      } else {
        await container.requestFullscreen();
        // Force landscape on fullscreen
        if (screen.orientation && screen.orientation.lock) {
          try {
            await screen.orientation.lock('landscape');
            setPlayerState(prev => ({ ...prev, isLandscape: true }));
          } catch (e) {
            console.warn('Orientation lock not supported:', e);
          }
        }
      }
    } catch (error) {
      console.warn('Fullscreen error:', error);
    }
    
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

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
      console.warn('PiP error:', error);
    }
    
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

  const handlePlayerClick = useCallback((e: React.MouseEvent) => {
    if (playerState.showSettings) {
      setPlayerState(prev => ({ ...prev, showSettings: false, showControls: true }));
      lastActivityRef.current = Date.now();
      return;
    }
    
    const newShowControls = !playerState.showControls;
    setPlayerState(prev => ({ ...prev, showControls: newShowControls }));
    lastActivityRef.current = Date.now();
    
    if (newShowControls && playerState.isPlaying) {
      startControlsTimer();
    }
  }, [playerState.showSettings, playerState.showControls, playerState.isPlaying, startControlsTimer]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!playerState.showSettings) {
      resetControlsTimer();
    }
  }, [resetControlsTimer, playerState.showSettings]);

  useEffect(() => {
    document.addEventListener('mousemove', handleProgressMouseMove);
    document.addEventListener('mouseup', handleProgressMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleProgressMouseMove);
      document.removeEventListener('mouseup', handleProgressMouseUp);
    };
  }, [handleProgressMouseMove, handleProgressMouseUp]);

  if (playerState.error && !playerState.isLoading) {
    return (
      <div className={`w-full h-full bg-black flex items-center justify-center ${className}`}>
        <div className="text-center text-white p-6 max-w-md">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-400" />
          <div className="text-lg font-medium mb-2">Stream Error</div>
          <div className="text-sm text-gray-300 mb-4">{playerState.error}</div>
          <button
            onClick={handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
          >
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const currentTimePercentage =
    isFinite(playerState.duration) && playerState.duration > 0
      ? (playerState.currentTime / playerState.duration) * 100
      : 0;

  return (
    <div
      ref={containerRef}
      className={`relative bg-black w-full h-full ${className}`}
      onMouseMove={handleMouseMove}
      onClick={handlePlayerClick}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        controls={false}
      />
      
      {playerState.isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
            <div className="text-sm">Loading stream...</div>
          </div>
        </div>
      )}
      
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity duration-300 ${
          playerState.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          {playerState.availableSubtitles.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPlayerState(prev => ({ ...prev, showSettings: true }));
              }}
              className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-all"
              title="Subtitles"
            >
              <Subtitles size={18} />
            </button>
          )}
          {playerState.availableQualities.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPlayerState(prev => ({ ...prev, showSettings: true }));
              }}
              className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-all"
              title="Settings"
            >
              <Settings size={18} />
            </button>
          )}
        </div>
        
        {!playerState.isPlaying && !playerState.isLoading && !playerState.error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="w-16 h-16 bg-white bg-opacity-20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-opacity-30 transition-all"
            >
              <Play size={24} fill="white" className="ml-1" />
            </button>
          </div>
        )}
        
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="mb-4">
            <div
              ref={progressRef}
              className="relative h-2 py-2 -my-2 bg-transparent cursor-pointer group"
              onClick={handleProgressClick}
              onMouseDown={handleProgressMouseDown}
            >
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-white bg-opacity-30 rounded-full">
                <div
                  className="absolute top-0 left-0 h-full bg-white bg-opacity-50 rounded-full"
                  style={{
                    width:
                      isFinite(playerState.duration) && playerState.duration > 0
                        ? `${(playerState.buffered / playerState.duration) * 100}%`
                        : '0%',
                  }}
                />
                <div
                  className="absolute top-0 left-0 h-full bg-red-500 rounded-full"
                  style={{ width: `${currentTimePercentage}%` }}
                />
                <div
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-red-500 transition-all duration-150 ease-out cursor-grab active:cursor-grabbing ${
                    playerState.isSeeking ? 'scale-150' : 'group-hover:scale-150'
                  }`}
                  style={{ left: `${currentTimePercentage}%` }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="text-white hover:text-blue-300 transition-colors p-2"
            >
              {playerState.isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
              }}
              className="text-white hover:text-blue-300 transition-colors p-2"
            >
              {playerState.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            
            {isFinite(playerState.duration) && playerState.duration > 0 && (
              <div className="text-white text-sm">
                {formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}
              </div>
            )}
            
            <div className="flex-1"></div>
            
            {document.pictureInPictureEnabled && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePip();
                }}
                className="text-white hover:text-blue-300 transition-colors p-2"
                title="Picture-in-picture"
              >
                <PictureInPicture2 size={18} />
              </button>
            )}
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              className="text-white hover:text-blue-300 transition-colors p-2"
              title="Fullscreen"
            >
              {playerState.isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
      
      <Drawer
        open={playerState.showSettings}
        onOpenChange={(isOpen) => setPlayerState(prev => ({ ...prev, showSettings: isOpen }))}
      >
        <DrawerContent
          className={`bg-black/90 border-t border-white/20 text-white outline-none ${
            playerState.isLandscape ? 'h-screen w-1/3 ml-auto rounded-l-lg border-l' : ''
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <DrawerHeader>
            <DrawerTitle className="text-center text-white">Settings</DrawerTitle>
          </DrawerHeader>
          
          <div className="p-4 overflow-y-auto" style={{ maxHeight: playerState.isLandscape ? '100vh' : '50vh' }}>
            {/* Custom Accordion Implementation */}
            <div className="w-full space-y-2">
              {playerState.availableQualities.length > 0 && (
                <div className="border-b border-white/20">
                  <button
                    onClick={() => setPlayerState(prev => ({ 
                      ...prev, 
                      expandedSection: prev.expandedSection === 'quality' ? '' : 'quality' 
                    }))}
                    className="flex items-center justify-between w-full py-4 text-white text-base font-medium hover:no-underline"
                  >
                    Quality
                    <svg
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                        playerState.expandedSection === 'quality' ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {playerState.expandedSection === 'quality' && (
                    <div className="pb-4 pt-0">
                      <div className="space-y-1 pt-2">
                        <button
                          onClick={() => changeQuality(-1)}
                          className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
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
                            className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                              playerState.currentQuality === quality.id
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-300 hover:bg-white/10'
                            }`}
                          >
                            {quality.height}p ({quality.bitrate} kbps)
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {playerState.availableSubtitles.length > 0 && (
                <div className="border-b border-white/20">
                  <button
                    onClick={() => setPlayerState(prev => ({ 
                      ...prev, 
                      expandedSection: prev.expandedSection === 'subtitles' ? '' : 'subtitles' 
                    }))}
                    className="flex items-center justify-between w-full py-4 text-white text-base font-medium hover:no-underline"
                  >
                    Subtitles
                    <svg
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                        playerState.expandedSection === 'subtitles' ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {playerState.expandedSection === 'subtitles' && (
                    <div className="pb-4 pt-0">
                      <div className="space-y-1 pt-2">
                        <button
                          onClick={() => changeSubtitle('')}
                          className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
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
                            className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                              playerState.currentSubtitle === subtitle.id
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-300 hover:bg-white/10'
                            }`}
                          >
                            {subtitle.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="border-b border-white/20">
                <button
                  onClick={() => setPlayerState(prev => ({ 
                    ...prev, 
                    expandedSection: prev.expandedSection === 'speed' ? '' : 'speed' 
                  }))}
                  className="flex items-center justify-between w-full py-4 text-white text-base font-medium hover:no-underline"
                >
                  Playback Speed
                  <svg
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                      playerState.expandedSection === 'speed' ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {playerState.expandedSection === 'speed' && (
                  <div className="pb-4 pt-0">
                    <div className="space-y-1 pt-2">
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                        <button
                          key={speed}
                          onClick={() => {
                            if (videoRef.current) videoRef.current.playbackRate = speed;
                            setPlayerState(prev => ({ ...prev, showSettings: false, showControls: true }));
                          }}
                          className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                            videoRef.current?.playbackRate === speed
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          {speed === 1 ? 'Normal' : `${speed}x`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default VideoPlayer;
                
