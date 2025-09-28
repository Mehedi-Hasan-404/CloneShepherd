// /src/components/VideoPlayer.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2, AlertCircle, RotateCcw, Settings, PictureInPicture2 } from 'lucide-react';

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
  index: number;
}

const PLAYER_LOAD_TIMEOUT = 30000; // 30 seconds

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamUrl,
  channelName,
  autoPlay = true,
  muted = true,
  className = ""
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const progressRef = useRef<HTMLDivElement>(null);

  // Refs for robust seeking logic to prevent stale state issues
  const dragStartRef = useRef<{ isDragging: boolean; } | null>(null);
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
    isSeeking: false,
    isPipActive: false, // State for Picture-in-Picture
  });

  const destroyHLS = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (e) {
        console.warn('Error destroying HLS instance:', e);
      }
      hlsRef.current = null;
    }
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
  }, []);

  const loadHLS = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      if (window.Hls) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load HLS.js'));
      document.head.appendChild(script);
    });
  }, []);

  const formatTime = (time: number): string => {
    if (!isFinite(time)) return "LIVE";
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const initializePlayer = useCallback(async () => {
    if (!streamUrl || !videoRef.current) {
        setPlayerState(prev => ({ ...prev, error: 'No stream URL provided', isLoading: false }));
        return;
      }
  
      const video = videoRef.current;
      destroyHLS();
  
      setPlayerState(prev => ({ ...prev, isLoading: true, error: null, isPlaying: false, showSettings: false }));
  
      // Set loading timeout
      loadingTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setPlayerState(prev => ({
            ...prev,
            isLoading: false,
            error: "Stream took too long to load. Please try again.",
          }));
          destroyHLS();
        }
      }, PLAYER_LOAD_TIMEOUT);
  
      try {
        await loadHLS();
        const Hls = window.Hls;
  
        if (Hls && Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: 30,
            maxBufferSize: 60 * 1000 * 1000,
            fragLoadingTimeOut: 20000,
            manifestLoadingTimeOut: 10000,
            enableWorker: false,
          });
          
          hlsRef.current = hls;
  
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
  
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!isMountedRef.current) return;
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            
            const levels = hls.levels.map((level: any, index: number) => ({
              height: level.height || 0,
              bitrate: Math.round(level.bitrate / 1000), // Convert to kbps
              index: index
            }));
            
            video.muted = muted;
            
            if (autoPlay) {
              video.play().catch((e) => {
                console.warn('Autoplay was prevented:', e);
                setPlayerState(prev => ({ ...prev, error: 'Click play to start the stream' }));
              });
            }
            setPlayerState(prev => ({ 
              ...prev, 
              isLoading: false, 
              error: null,
              availableQualities: levels,
              currentQuality: hls.currentLevel,
              isMuted: video.muted
            }));
          });
  
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (!isMountedRef.current) return;
            console.error('HLS Error:', data.type, data.details, data);
  
            if (data.fatal) {
              if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
              let errorMessage = 'Stream playback failed';
              
              switch(data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  errorMessage = 'Network error - check your connection';
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  errorMessage = 'Media error - trying to recover...';
                  hls.recoverMediaError();
                  return;
                default:
                  errorMessage = `Stream error: ${data.details}`;
                  break;
              }
              
              setPlayerState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
              destroyHLS();
            }
          });
  
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Native HLS support (Safari)
          video.src = streamUrl;
          
          const onLoadedMetadata = () => {
            if (!isMountedRef.current) return;
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            video.muted = muted;
            
            if (autoPlay) {
              video.play().catch((e) => {
                console.warn('Autoplay was prevented:', e);
              });
            }
            setPlayerState(prev => ({ ...prev, isLoading: false, error: null, isMuted: video.muted }));
          };
  
          const onError = () => {
            if (!isMountedRef.current) return;
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Failed to load stream' }));
          };
  
          video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
          video.addEventListener('error', onError, { once: true });
          
        } else {
          if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
          setPlayerState(prev => ({ 
            ...prev, 
            isLoading: false, 
            error: "HLS streams are not supported in this browser. Please try a different browser." 
          }));
        }
  
      } catch (error) {
        console.error('Player initialization error:', error);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        setPlayerState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: error instanceof Error ? error.message : 'Failed to initialize player' 
        }));
      }
  }, [streamUrl, autoPlay, muted, destroyHLS, loadHLS]);

  // Rewritten seek logic functions for reliability
  const calculateNewTime = useCallback((clientX: number): number | null => {
    const video = videoRef.current;
    const progressBar = progressRef.current;
    if (!video || !progressBar || !isFinite(video.duration)) return null;
    const rect = progressBar.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = clickX / rect.width;
    return percentage * video.duration;
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || !isFinite(video.duration)) return;
    wasPlayingBeforeSeekRef.current = !video.paused;
    dragStartRef.current = { isDragging: true };
    setPlayerState(prev => ({ ...prev, isSeeking: true }));
    video.pause();
  }, []);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current?.isDragging) return;
    const newTime = calculateNewTime(e.clientX);
    if (newTime !== null) {
      setPlayerState(prev => ({ ...prev, currentTime: newTime }));
      seekTimeRef.current = newTime;
    }
  }, [calculateNewTime]);

  const handleDragEnd = useCallback(() => {
    if (!dragStartRef.current?.isDragging) return;
    const video = videoRef.current;
    if (video) {
      video.currentTime = seekTimeRef.current;
      if (wasPlayingBeforeSeekRef.current) {
        video.play().catch(console.error);
      }
    }
    dragStartRef.current = null;
    setPlayerState(prev => ({ ...prev, isSeeking: false, isPlaying: !video?.paused }));
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const newTime = calculateNewTime(e.clientX);
    if (newTime !== null && videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  }, [calculateNewTime]);

  useEffect(() => {
    isMountedRef.current = true;
    initializePlayer();
    return () => {
      isMountedRef.current = false;
      destroyHLS();
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [streamUrl, initializePlayer, destroyHLS]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isPlaying: true }));
    const handlePause = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isPlaying: false }));
    const handleWaiting = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isLoading: true }));
    const handlePlaying = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isLoading: false }));
    const handleTimeUpdate = () => {
      if (isMountedRef.current && video && !playerState.isSeeking) {
          const buffered = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
          setPlayerState(prev => ({ ...prev, currentTime: video.currentTime, duration: video.duration, buffered: buffered }));
      }
    };
    const handleVolumeChange = () => isMountedRef.current && video && setPlayerState(prev => ({ ...prev, isMuted: video.muted }));
    const handleEnterPip = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isPipActive: true }));
    const handleLeavePip = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isPipActive: false }));
    const handleFullscreenChange = () => {
        if (isMountedRef.current) {
            const isFullscreen = !!document.fullscreenElement;
            setPlayerState(prev => ({ ...prev, isFullscreen: isFullscreen }));
            if (!isFullscreen && screen.orientation && typeof screen.orientation.unlock === 'function') {
                screen.orientation.unlock();
            }
        }
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
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);

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
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, [playerState.isSeeking, handleDragMove, handleDragEnd]);
  
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(console.error);
    else video.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            if (screen.orientation && typeof screen.orientation.unlock === 'function') {
                screen.orientation.unlock();
            }
        } else {
            await container.requestFullscreen();
            try {
                if (screen.orientation && typeof screen.orientation.lock === 'function') {
                    await screen.orientation.lock('landscape');
                }
            } catch (err) {
                console.warn('Could not lock screen to landscape:', err);
            }
        }
    } catch (err) {
        console.error('Fullscreen or orientation lock error:', err);
    }
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
    } catch (err) {
        console.error('PiP error:', err);
    }
  }, []);

  const changeQuality = useCallback((qualityIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = qualityIndex;
      setPlayerState(prev => ({ ...prev, currentQuality: qualityIndex, showSettings: false }));
    }
  }, []);
  
  const handleRetry = useCallback(() => {
    initializePlayer();
  }, [initializePlayer]);

  const showControlsTemporarily = useCallback(() => {
    if (!isMountedRef.current) return;
    setPlayerState(prev => ({ ...prev, showControls: true }));
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && playerState.isPlaying && !playerState.showSettings && !playerState.isSeeking) {
        setPlayerState(prev => ({ ...prev, showControls: false }));
      }
    }, 3000);
  }, [playerState.isPlaying, playerState.showSettings, playerState.isSeeking]);

  const handlePlayerClick = useCallback(() => {
    if (playerState.showSettings) {
      setPlayerState(prev => ({ ...prev, showSettings: false }));
      return;
    }
    if (playerState.showControls) {
      setPlayerState(prev => ({ ...prev, showControls: false }));
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else {
      showControlsTemporarily();
    }
  }, [playerState.showControls, playerState.showSettings, showControlsTemporarily]);

  const handleMouseMove = useCallback(() => {
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  const handleMouseLeave = useCallback(() => {
    if (playerState.isPlaying && !playerState.showSettings && !playerState.isSeeking) {
      setPlayerState(prev => ({ ...prev, showControls: false }));
    }
  }, [playerState.isPlaying, playerState.showSettings, playerState.isSeeking]);

  if (playerState.error && !playerState.isLoading) {
    return (
        <div className={`aspect-video bg-black flex items-center justify-center ${className}`}>
          <div className="text-center text-white p-6">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-400" />
            <div className="text-lg font-medium mb-2">Stream Error</div>
            <div className="text-sm text-gray-300 mb-4">{playerState.error}</div>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
            >
              <RotateCcw size={14} />
              Retry
            </button>
          </div>
        </div>
      );
  }

  const currentTimePercentage = isFinite(playerState.duration) && playerState.duration > 0 
    ? (playerState.currentTime / playerState.duration) * 100 
    : 0;

  return (
    <div 
      ref={containerRef}
      className={`relative bg-black ${playerState.isFullscreen ? 'fixed inset-0 z-50' : 'aspect-video'} ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
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
          playerState.showControls || !playerState.isPlaying || playerState.isSeeking ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ pointerEvents: playerState.showControls || !playerState.isPlaying || playerState.isSeeking ? 'auto' : 'none' }}
      >
        {playerState.showSettings && (
            <div className="absolute top-4 right-4 bg-black/90 rounded-lg p-2 min-w-48">
            <div className="text-white text-sm font-medium mb-2 px-2">Quality</div>
            <div className="space-y-1">
              <button
                onClick={() => changeQuality(-1)}
                className={`w-full text-left px-2 py-1 text-sm rounded transition-colors ${
                  playerState.currentQuality === -1 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                Auto
              </button>
              {playerState.availableQualities.map((quality) => (
                <button
                  key={quality.index}
                  onClick={() => changeQuality(quality.index)}
                  className={`w-full text-left px-2 py-1 text-sm rounded transition-colors ${
                    playerState.currentQuality === quality.index 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {quality.height}p ({quality.bitrate} kbps)
                </button>
              ))}
            </div>
          </div>
        )}

        {!playerState.isPlaying && !playerState.isLoading && !playerState.error && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <button
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="w-16 h-16 bg-white bg-opacity-20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-opacity-30 transition-all pointer-events-auto"
                >
                <Play size={24} fill="white" className="ml-1" />
                </button>
            </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
          <div className="mb-4 pointer-events-auto">
            <div 
              ref={progressRef}
              className="relative h-2 py-2 -my-2 bg-transparent cursor-pointer group" 
              onClick={handleProgressClick}
            >
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-white bg-opacity-30 rounded-full">
                <div 
                  className="absolute top-0 left-0 h-full bg-white bg-opacity-50 rounded-full"
                  style={{ width: isFinite(playerState.duration) && playerState.duration > 0 ? `${(playerState.buffered / playerState.duration) * 100}%` : '0%' }}
                />
                <div 
                  className="absolute top-0 left-0 h-full bg-red-500 rounded-full"
                  style={{ width: `${currentTimePercentage}%` }}
                />
                <div 
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-red-500 transition-all duration-150 ease-out 
                    ${playerState.isSeeking ? 'scale-150' : 'group-hover:scale-150'}`}
                  style={{ left: `${currentTimePercentage}%` }}
                  onMouseDown={handleDragStart}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pointer-events-auto">
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="text-white hover:text-blue-300 transition-colors p-2">
              {playerState.isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            
            <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="text-white hover:text-blue-300 transition-colors p-2">
              {playerState.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            {isFinite(playerState.duration) && playerState.duration > 0 && (
              <div className="text-white text-sm">
                {formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}
              </div>
            )}

            <div className="flex-1"></div>

            {playerState.availableQualities.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setPlayerState(prev => ({ ...prev, showSettings: !prev.showSettings })); }}
                className={`text-white hover:text-blue-300 transition-colors p-2 ${playerState.showSettings ? 'text-blue-400' : ''}`}
                title="Settings"
              >
                <Settings size={18} />
              </button>
            )}

            {document.pictureInPictureEnabled && (
              <button
                onClick={(e) => { e.stopPropagation(); togglePip(); }}
                className="text-white hover:text-blue-300 transition-colors p-2"
                title="Picture-in-picture"
              >
                <PictureInPicture2 size={18} />
              </button>
            )}

            <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="text-white hover:text-blue-300 transition-colors p-2" title="Fullscreen">
              {playerState.isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

declare global {
  interface Window {
    Hls: any;
  }
}

export default VideoPlayer;
