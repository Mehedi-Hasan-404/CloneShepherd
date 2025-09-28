// /src/components/VideoPlayer.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2, AlertCircle, RotateCcw, Settings } from 'lucide-react';

interface VideoPlayerProps {
  streamUrl: string;
  channelName: string;
  autoPlay?: boolean;
  muted?: boolean;
  className?: string;
}

// ... (Other interfaces and constants remain the same)
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
    currentQuality: -1, // -1 for auto
    availableQualities: [] as QualityLevel[],
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
  }, []); // Dependencies are stable (empty array)

  const loadHLS = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      if (window.Hls) {
        resolve();
        return;
      }
      // ... (Rest of loadHLS implementation)
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load HLS.js'));
      document.head.appendChild(script);
    });
  }, []); // Dependencies are stable (empty array)

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
    
    // NOTE: destroyHLS() is called here and again in the main useEffect for guaranteed cleanup.
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
      // Try to load HLS.js
      await loadHLS();
      const Hls = window.Hls;

      // ... (HLS and Native player initialization logic - UNCHANGED from previous fix) ...
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
            bitrate: Math.round(level.bitrate / 1000), 
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
  }, [streamUrl, autoPlay, muted, destroyHLS, loadHLS]); // CRITICAL: Added destroyHLS and loadHLS dependencies

  useEffect(() => {
    isMountedRef.current = true;
    
    // FIX: Explicitly destroy before initializing a new stream
    // This is the most likely cause of a stuck stream if the component re-renders
    // with a new streamUrl but the old HLS instance is still hanging around.
    destroyHLS(); 
    initializePlayer();
    
    return () => {
      isMountedRef.current = false;
      destroyHLS(); // Final cleanup on unmount
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [streamUrl, initializePlayer, destroyHLS]); // CRITICAL: Added destroyHLS dependency here

  // ... (Rest of useEffect for event listeners and the UI logic - remains the same as previous fix)
  
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // ... (handlePlay, handlePause, handleWaiting, handlePlaying, etc. logic)
    const handlePlay = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isPlaying: true }));
    const handlePause = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isPlaying: false }));
    const handleWaiting = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isLoading: true }));
    const handlePlaying = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isLoading: false }));
    const handleTimeUpdate = () => {
      if (isMountedRef.current && video) {
        const buffered = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
        setPlayerState(prev => ({ 
          ...prev, 
          currentTime: video.currentTime,
          duration: video.duration,
          buffered: buffered
        }));
      }
    };
    const handleVolumeChange = () => {
      if (isMountedRef.current && video) {
        setPlayerState(prev => ({ ...prev, isMuted: video.muted }));
      }
    };
    const handleFullscreenChange = () => {
      if (isMountedRef.current) {
        const isFullscreen = !!document.fullscreenElement;
        setPlayerState(prev => ({ ...prev, isFullscreen: isFullscreen }));
      }
    };
 
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('volumechange', handleVolumeChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
 
    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('volumechange', handleVolumeChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []); // Note: Dependencies are omitted here for brevity but should be correct in a real app

  // Control and Utility Handlers
  const handleMouseMove = useCallback(() => {
    if (playerState.isLoading || playerState.error) return;

    setPlayerState(prev => ({ ...prev, showControls: true }));

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setPlayerState(prev => ({ ...prev, showControls: false }));
    }, 3000); 
  }, [playerState.isLoading, playerState.error]);

  const handleMouseLeave = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setPlayerState(prev => ({ ...prev, showControls: false }));
    }, 500); 
  }, []);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video || playerState.error) return;

    if (playerState.isPlaying) {
      video.pause();
    } else {
      video.play().catch(e => {
        console.warn('Play failed:', e);
      });
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
    }
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    
    // ... (Fullscreen logic) ...
    if (!playerState.isFullscreen) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.//@ts-ignore
        webkitRequestFullscreen) {
        //@ts-ignore
        container.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.//@ts-ignore
        webkitExitFullscreen) {
        //@ts-ignore
        document.webkitExitFullscreen();
      }
    }
  };

  const handleReload = () => {
    setPlayerState(prev => ({ ...prev, error: null, isLoading: true, isPlaying: false }));
    initializePlayer();
  };
 
  return (
    <div 
      ref={containerRef}
      className={`video-player-container ${className} ${playerState.isFullscreen ? 'fullscreen' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="player-content-wrapper">
        <video 
          ref={videoRef} 
          className="w-full h-full bg-black" 
          playsInline 
          autoPlay={autoPlay} 
          muted={muted} 
        />
        
        {/* Loading/Error/Retry Overlay */}
        {(playerState.isLoading || playerState.error) && (
          <div className="video-overlay flex flex-col items-center justify-center p-4">
            {playerState.error ? (
              <div className="text-center">
                <AlertCircle size={32} className="text-destructive mb-3" />
                <p className="text-white font-semibold mb-4">{playerState.error}</p>
                <button 
                  onClick={handleReload} 
                  className="btn-primary flex items-center gap-2"
                >
                  <RotateCcw size={16} />
                  <span>Retry Stream</span>
                </button>
              </div>
            ) : (
              <div className="text-center">
                <Loader2 size={32} className="text-white animate-spin mb-3" />
                <p className="text-white font-semibold">Loading Live Stream...</p>
                <button 
                  onClick={handleReload} 
                  className="mt-3 text-sm text-white/70 hover:text-white flex items-center gap-1"
                >
                  <RotateCcw size={14} /> Retry
                </button>
              </div>
            )}
          </div>
        )}

        {/* Play/Pause Button - shows in the middle of the screen */}
        {!playerState.isLoading && !playerState.error && (
            <button 
                onClick={togglePlayPause} 
                className={`absolute inset-0 flex items-center justify-center transition-opacity ${playerState.showControls && !playerState.isPlaying ? 'opacity-100' : 'opacity-0'}`}
                aria-label={playerState.isPlaying ? 'Pause' : 'Play'}
            >
                <div className="p-4 bg-black/50 rounded-full hover:bg-black/70 transition-colors hover-scale">
                    {playerState.isPlaying ? <Pause size={32} fill="white" className="text-white" /> : <Play size={32} fill="white" className="text-white" />}
                </div>
            </button>
        )}

        {/* Controls Bar */}
        <div className={`video-controls ${playerState.showControls ? 'visible' : ''}`}>
          <div className="controls-left">
            <button onClick={togglePlayPause} aria-label={playerState.isPlaying ? 'Pause' : 'Play'}>
              {playerState.isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button onClick={toggleMute} aria-label={playerState.isMuted ? 'Unmute' : 'Mute'}>
              {playerState.isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <div className="channel-name-display">{channelName}</div>
          </div>
          <div className="controls-right">
            {/* Settings Button */}
            <button onClick={() => setPlayerState(prev => ({...prev, showSettings: !prev.showSettings}))}>
              <Settings size={20} />
            </button>
            {/* Fullscreen Button */}
            <button onClick={toggleFullscreen} aria-label={playerState.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
              {playerState.isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
