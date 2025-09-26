import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Loader2, AlertCircle, RotateCcw } from 'lucide-react';

interface VideoPlayerProps {
  streamUrl: string;
  channelName: string;
  autoPlay?: boolean;
  muted?: boolean;
  className?: string;
}

interface VideoState {
  isPlaying: boolean;
  isMuted: boolean;
  isLoading: boolean;
  error: string | null;
  isFullscreen: boolean;
  showControls: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  buffered: number;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  streamUrl, 
  channelName, 
  autoPlay = true, 
  muted = false,
  className = ""
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  const [state, setState] = useState<VideoState>({
    isPlaying: false,
    isMuted: muted,
    isLoading: true,
    error: null,
    isFullscreen: false,
    showControls: true,
    volume: muted ? 0 : 0.5,
    currentTime: 0,
    duration: 0,
    buffered: 0,
  });

  // Cleanup function
  const cleanup = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
  }, []);

  // Retry mechanism
  const retryStream = useCallback(() => {
    if (retryCountRef.current >= 3) {
      setState(prev => ({ ...prev, error: 'Maximum retry attempts reached', isLoading: false }));
      return;
    }

    retryCountRef.current++;
    setState(prev => ({ ...prev, error: null, isLoading: true }));
    
    retryTimeoutRef.current = setTimeout(() => {
      initializePlayer();
    }, 2000 * retryCountRef.current); // Exponential backoff
  }, []);

  // Initialize HLS player
  const initializePlayer = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    // Clean up previous instance
    cleanup();

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 120,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 5,
        maxBufferSize: 60 * 1000 * 1000, // 60MB
        maxBufferHole: 0.5,
        startLevel: -1, // Auto quality
        debug: false,
      });

      hlsRef.current = hls;

      // HLS events
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        console.log('HLS media attached');
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log('HLS manifest parsed, levels:', data.levels.length);
        setState(prev => ({ ...prev, isLoading: false }));
        
        // Set initial volume and muted state
        video.volume = state.volume;
        video.muted = state.isMuted;

        // Auto-play if enabled
        if (autoPlay) {
          video.play().catch(err => {
            console.warn('Autoplay prevented:', err);
            setState(prev => ({ ...prev, isLoading: false }));
          });
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data);
        
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setState(prev => ({ ...prev, error: 'Network error occurred' }));
              retryStream();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setState(prev => ({ ...prev, error: 'Media error occurred' }));
              try {
                hls.recoverMediaError();
              } catch (err) {
                retryStream();
              }
              break;
            default:
              setState(prev => ({ ...prev, error: 'Fatal error occurred', isLoading: false }));
              break;
          }
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        console.log('Quality switched to level:', data.level);
      });

      // Load source
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = streamUrl;
      
      const handleCanPlay = () => {
        setState(prev => ({ ...prev, isLoading: false }));
        video.removeEventListener('canplay', handleCanPlay);
        
        if (autoPlay) {
          video.play().catch(err => {
            console.warn('Autoplay prevented:', err);
          });
        }
      };

      const handleError = () => {
        setState(prev => ({ ...prev, error: 'Failed to load stream', isLoading: false }));
        video.removeEventListener('error', handleError);
        retryStream();
      };

      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('error', handleError);
      
    } else {
      setState(prev => ({ ...prev, error: 'HLS is not supported in this browser', isLoading: false }));
    }
  }, [streamUrl, autoPlay, state.volume, state.isMuted, cleanup, retryStream]);

  // Video event handlers
  const setupVideoEvents = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setState(prev => ({ ...prev, isPlaying: true }));
    const handlePause = () => setState(prev => ({ ...prev, isPlaying: false }));
    const handleWaiting = () => setState(prev => ({ ...prev, isLoading: true }));
    const handleCanPlay = () => setState(prev => ({ ...prev, isLoading: false }));
    const handleVolumeChange = () => {
      setState(prev => ({ 
        ...prev, 
        volume: video.volume,
        isMuted: video.muted 
      }));
    };
    const handleTimeUpdate = () => {
      setState(prev => ({
        ...prev,
        currentTime: video.currentTime,
        duration: video.duration || 0,
      }));
    };
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const buffered = video.buffered.end(video.buffered.length - 1);
        setState(prev => ({ ...prev, buffered }));
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
    };
  }, []);

  // Fullscreen handling
  const handleFullscreenChange = useCallback(() => {
    setState(prev => ({ 
      ...prev, 
      isFullscreen: !!document.fullscreenElement 
    }));
  }, []);

  // Control handlers
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (state.isPlaying) {
      video.pause();
    } else {
      video.play().catch(err => {
        console.error('Play failed:', err);
        setState(prev => ({ ...prev, error: 'Failed to play video' }));
      });
    }
  }, [state.isPlaying]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
  }, []);

  const handleVolumeChange = useCallback((newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = Math.max(0, Math.min(1, newVolume));
    video.muted = newVolume === 0;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
    }
  }, []);

  // Controls visibility
  const showControlsTemporarily = useCallback(() => {
    setState(prev => ({ ...prev, showControls: true }));
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    controlsTimeoutRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, showControls: false }));
    }, 3000);
  }, []);

  const handleMouseMove = useCallback(() => {
    if (state.isPlaying) {
      showControlsTemporarily();
    }
  }, [state.isPlaying, showControlsTemporarily]);

  const handleMouseLeave = useCallback(() => {
    if (state.isPlaying) {
      setState(prev => ({ ...prev, showControls: false }));
    }
  }, [state.isPlaying]);

  // Effects
  useEffect(() => {
    initializePlayer();
    const cleanupEvents = setupVideoEvents();
    
    return () => {
      cleanup();
      if (cleanupEvents) cleanupEvents();
    };
  }, [streamUrl]);

  useEffect(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [handleFullscreenChange]);

  useEffect(() => {
    // Reset retry count when stream URL changes
    retryCountRef.current = 0;
  }, [streamUrl]);

  // Manual retry function
  const handleRetry = () => {
    retryCountRef.current = 0;
    initializePlayer();
  };

  if (state.error) {
    return (
      <div className={`video-player flex items-center justify-center bg-black ${className}`}>
        <div className="text-center text-white p-8">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
          <div className="text-lg font-semibold mb-2">Stream Error</div>
          <div className="text-sm text-gray-400 mb-4">{state.error}</div>
          <button 
            onClick={handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            <RotateCcw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`video-player relative group cursor-pointer ${className} ${state.isFullscreen ? 'fullscreen' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black"
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
      />

      {/* Loading Overlay */}
      {state.isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
            <div className="text-sm">Loading stream...</div>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      <div 
        className={`absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 transition-opacity duration-300 ${
          state.showControls || !state.isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Info Bar */}
        <div className="absolute top-4 left-4 right-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-semibold text-lg">{channelName}</div>
              <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
                LIVE
              </div>
            </div>
            {retryCountRef.current > 0 && (
              <div className="text-yellow-400 text-sm">
                Retry attempt: {retryCountRef.current}/3
              </div>
            )}
          </div>
        </div>

        {/* Center Play Button (when paused) */}
        {!state.isPlaying && !state.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all transform hover:scale-105"
            >
              <Play size={32} fill="white" className="ml-1" />
            </button>
          </div>
        )}

        {/* Bottom Controls */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-center gap-4">
            {/* Play/Pause */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="text-white hover:text-blue-400 transition-colors p-2"
            >
              {state.isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className="text-white hover:text-blue-400 transition-colors p-2"
              >
                {state.isMuted || state.volume === 0 ? 
                  <VolumeX size={20} /> : 
                  <Volume2 size={20} />
                }
              </button>
              
              {/* Volume Slider */}
              <div className="w-20 group/volume">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={state.isMuted ? 0 : state.volume}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleVolumeChange(parseFloat(e.target.value));
                  }}
                  className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                    [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg
                    [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none"
                />
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Stream Quality Info */}
            {hlsRef.current && (
              <div className="text-white/70 text-sm">
                Auto Quality
              </div>
            )}

            {/* Fullscreen */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              className="text-white hover:text-blue-400 transition-colors p-2"
            >
              {state.isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Buffer Progress Bar */}
      {state.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
          <div 
            className="h-full bg-white/40 transition-all duration-200"
            style={{ width: `${(state.buffered / state.duration) * 100}%` }}
          />
          <div 
            className="h-full bg-red-500 transition-all duration-200"
            style={{ width: `${(state.currentTime / state.duration) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
