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

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  streamUrl, 
  channelName, 
  autoPlay = false, // Changed to false to prevent autoplay issues
  muted = true, // Changed to true to prevent audio issues
  className = ""
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const lastStreamUrl = useRef<string>('');
  
  // Simple state management to prevent flickering
  const [playerState, setPlayerState] = useState({
    isPlaying: false,
    isMuted: muted,
    isLoading: false,
    error: null as string | null,
    isFullscreen: false,
    showControls: true,
    volume: muted ? 0 : 0.8,
    canPlay: false
  });

  // Destroy HLS instance cleanly
  const destroyHLS = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (e) {
        console.warn('HLS destroy error:', e);
      }
      hlsRef.current = null;
    }
  }, []);

  // Initialize video player
  const initializePlayer = useCallback(async () => {
    if (!streamUrl || !videoRef.current || !mountedRef.current) {
      return;
    }

    // Skip if same URL is already loaded
    if (streamUrl === lastStreamUrl.current && playerState.canPlay) {
      return;
    }

    const video = videoRef.current;

    // Clean up previous instance
    destroyHLS();
    
    // Reset video element
    video.pause();
    video.removeAttribute('src');
    video.load();

    // Update state to loading
    setPlayerState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      canPlay: false,
      isPlaying: false
    }));

    lastStreamUrl.current = streamUrl;

    try {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: false, // Disable worker to prevent issues
          lowLatencyMode: false, // Disable low latency for stability
          backBufferLength: 30,
          maxBufferLength: 60,
          startLevel: -1,
          debug: false,
          autoStartLoad: true,
          capLevelToPlayerSize: true,
          maxLoadingDelay: 4,
          maxBufferSize: 60 * 1000 * 1000,
          fragLoadingTimeOut: 20000,
          manifestLoadingTimeOut: 10000
        });

        hlsRef.current = hls;

        // Handle successful manifest parsing
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!mountedRef.current) return;
          
          console.log('Stream manifest loaded');
          
          // Set video properties
          video.volume = playerState.volume;
          video.muted = playerState.isMuted;

          setPlayerState(prev => ({
            ...prev,
            isLoading: false,
            canPlay: true,
            error: null
          }));

          // Auto-play if enabled
          if (autoPlay) {
            video.play().catch(err => {
              console.warn('Autoplay prevented:', err);
            });
          }
        });

        // Handle errors
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (!mountedRef.current) return;

          console.error('HLS Error:', data.type, data.details);
          
          if (data.fatal) {
            setPlayerState(prev => ({
              ...prev,
              isLoading: false,
              error: `Stream error: ${data.details}`,
              canPlay: false
            }));
          }
        });

        // Load the stream
        hls.loadSource(streamUrl);
        hls.attachMedia(video);

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        video.src = streamUrl;
        
        const handleLoadedData = () => {
          if (!mountedRef.current) return;
          
          setPlayerState(prev => ({
            ...prev,
            isLoading: false,
            canPlay: true,
            error: null
          }));

          if (autoPlay) {
            video.play().catch(err => {
              console.warn('Autoplay prevented:', err);
            });
          }
          
          video.removeEventListener('loadeddata', handleLoadedData);
        };

        const handleError = () => {
          if (!mountedRef.current) return;
          
          setPlayerState(prev => ({
            ...prev,
            isLoading: false,
            error: 'Failed to load stream',
            canPlay: false
          }));
          
          video.removeEventListener('error', handleError);
        };

        video.addEventListener('loadeddata', handleLoadedData);
        video.addEventListener('error', handleError);
        
      } else {
        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Video streaming not supported in this browser',
          canPlay: false
        }));
      }
    } catch (err) {
      console.error('Player initialization error:', err);
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to initialize player',
        canPlay: false
      }));
    }
  }, [streamUrl, autoPlay, playerState.volume, playerState.isMuted, destroyHLS]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      if (mountedRef.current) {
        setPlayerState(prev => ({ ...prev, isPlaying: true }));
      }
    };

    const handlePause = () => {
      if (mountedRef.current) {
        setPlayerState(prev => ({ ...prev, isPlaying: false }));
      }
    };

    const handleWaiting = () => {
      if (mountedRef.current) {
        setPlayerState(prev => ({ ...prev, isLoading: true }));
      }
    };

    const handleCanPlay = () => {
      if (mountedRef.current) {
        setPlayerState(prev => ({ ...prev, isLoading: false }));
      }
    };

    const handleVolumeChange = () => {
      if (mountedRef.current) {
        setPlayerState(prev => ({
          ...prev,
          volume: video.volume,
          isMuted: video.muted
        }));
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('volumechange', handleVolumeChange);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('volumechange', handleVolumeChange);
    };
  }, []);

  // Initialize player when stream URL changes
  useEffect(() => {
    if (streamUrl) {
      const timer = setTimeout(() => {
        initializePlayer();
      }, 500); // Delay to prevent rapid initialization

      return () => clearTimeout(timer);
    }
  }, [streamUrl, initializePlayer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      destroyHLS();
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [destroyHLS]);

  // Fullscreen handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (mountedRef.current) {
        setPlayerState(prev => ({
          ...prev,
          isFullscreen: !!document.fullscreenElement
        }));
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Control functions
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || playerState.isLoading || !playerState.canPlay) return;

    if (playerState.isPlaying) {
      video.pause();
    } else {
      video.play().catch(err => {
        console.error('Play error:', err);
        setPlayerState(prev => ({ 
          ...prev, 
          error: 'Unable to play stream' 
        }));
      });
    }
  }, [playerState.isPlaying, playerState.isLoading, playerState.canPlay]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const handleVolumeChange = useCallback((newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    const volume = Math.max(0, Math.min(1, newVolume));
    video.volume = volume;
    video.muted = volume === 0;
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
      console.error('Fullscreen error:', err);
    }
  }, []);

  const handleRetry = useCallback(() => {
    lastStreamUrl.current = '';
    initializePlayer();
  }, [initializePlayer]);

  // Controls visibility
  const showControlsTemporarily = useCallback(() => {
    setPlayerState(prev => ({ ...prev, showControls: true }));
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    controlsTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current && playerState.isPlaying) {
        setPlayerState(prev => ({ ...prev, showControls: false }));
      }
    }, 3000);
  }, [playerState.isPlaying]);

  const handleMouseMove = useCallback(() => {
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  const handleMouseLeave = useCallback(() => {
    if (playerState.isPlaying) {
      setPlayerState(prev => ({ ...prev, showControls: false }));
    }
  }, [playerState.isPlaying]);

  // Error state
  if (playerState.error) {
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

  return (
    <div 
      ref={containerRef}
      className={`relative bg-black ${playerState.isFullscreen ? 'fixed inset-0 z-50' : 'aspect-video'} ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        preload="none"
        controls={false}
      />

      {/* Loading overlay */}
      {playerState.isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
            <div className="text-sm">Loading stream...</div>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div 
        className={`absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 transition-opacity duration-300 ${
          playerState.showControls || !playerState.isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={togglePlay}
      >
        {/* Channel info */}
        <div className="absolute top-4 left-4 pointer-events-none">
          <div className="text-white font-medium text-lg">{channelName}</div>
          <div className="flex items-center gap-2 text-red-400 text-sm mt-1">
            <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
            LIVE
          </div>
        </div>

        {/* Play button */}
        {!playerState.isPlaying && !playerState.isLoading && playerState.canPlay && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="w-16 h-16 bg-white bg-opacity-20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-opacity-30 transition-all pointer-events-auto"
            >
              <Play size={24} fill="white" className="ml-1" />
            </button>
          </div>
        )}

        {/* Bottom controls */}
        <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
          <div className="flex items-center gap-3 pointer-events-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="text-white hover:text-blue-300 transition-colors p-2"
              disabled={!playerState.canPlay}
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
              {playerState.isMuted || playerState.volume === 0 ? 
                <VolumeX size={18} /> : 
                <Volume2 size={18} />
              }
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={playerState.isMuted ? 0 : playerState.volume}
              onChange={(e) => {
                e.stopPropagation();
                handleVolumeChange(parseFloat(e.target.value));
              }}
              className="w-16 h-1 bg-white bg-opacity-30 rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                [&::-webkit-slider-thumb]:cursor-pointer"
            />

            <div className="flex-1"></div>

            <span className="text-white text-opacity-70 text-sm">Auto Quality</span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              className="text-white hover:text-blue-300 transition-colors p-2"
            >
              {playerState.isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
