import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
  autoPlay = true, 
  muted = false,
  className = ""
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializingRef = useRef(false);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  // Stable state to prevent flickering
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [volume, setVolume] = useState(muted ? 0 : 0.5);

  // Memoize stream URL to prevent unnecessary re-initialization
  const stableStreamUrl = useMemo(() => streamUrl, [streamUrl]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (e) {
        console.warn('HLS cleanup error:', e);
      }
      hlsRef.current = null;
    }
    isInitializingRef.current = false;
  }, []);

  // Retry with exponential backoff
  const retryStream = useCallback(() => {
    if (!mountedRef.current || retryCountRef.current >= 3) {
      if (mountedRef.current) {
        setError('Failed to load stream after multiple attempts');
        setIsLoading(false);
      }
      return;
    }

    retryCountRef.current++;
    setError(null);
    
    retryTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current && !isInitializingRef.current) {
        initializePlayer();
      }
    }, Math.min(1000 * Math.pow(2, retryCountRef.current), 5000));
  }, []);

  // Initialize player - only once per URL change
  const initializePlayer = useCallback(() => {
    if (!mountedRef.current || isInitializingRef.current || !stableStreamUrl) {
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    isInitializingRef.current = true;
    setIsLoading(true);
    setError(null);

    // Clean up previous instance
    cleanup();

    // Check HLS support
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000,
        startLevel: -1,
        debug: false,
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 10000,
        levelLoadingTimeOut: 10000,
      });

      hlsRef.current = hls;

      // Set up event listeners
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!mountedRef.current) return;
        
        console.log('Stream loaded successfully');
        setIsLoading(false);
        isInitializingRef.current = false;
        retryCountRef.current = 0;

        // Set initial properties
        video.volume = volume;
        video.muted = isMuted;

        // Auto-play if enabled
        if (autoPlay) {
          const playPromise = video.play();
          if (playPromise) {
            playPromise.catch(err => {
              console.warn('Autoplay prevented:', err);
              setIsLoading(false);
            });
          }
        } else {
          setIsLoading(false);
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (!mountedRef.current) return;

        console.error('HLS Error:', data.type, data.details, data.fatal);
        
        if (data.fatal) {
          isInitializingRef.current = false;
          
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('Network error - attempting retry');
              retryStream();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Media error - attempting recovery');
              try {
                hls.recoverMediaError();
              } catch (e) {
                retryStream();
              }
              break;
            default:
              setError('Stream is currently unavailable');
              setIsLoading(false);
              break;
          }
        }
      });

      // Load and attach media
      try {
        hls.loadSource(stableStreamUrl);
        hls.attachMedia(video);
      } catch (err) {
        console.error('Failed to load stream:', err);
        setError('Failed to initialize stream');
        setIsLoading(false);
        isInitializingRef.current = false;
      }

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = stableStreamUrl;
      
      const handleLoadStart = () => {
        if (mountedRef.current) {
          setIsLoading(true);
        }
      };

      const handleCanPlay = () => {
        if (!mountedRef.current) return;
        setIsLoading(false);
        isInitializingRef.current = false;
        retryCountRef.current = 0;
        
        if (autoPlay) {
          video.play().catch(err => {
            console.warn('Autoplay prevented:', err);
          });
        }
        
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('loadstart', handleLoadStart);
      };

      const handleError = () => {
        if (!mountedRef.current) return;
        console.error('Native video error');
        isInitializingRef.current = false;
        retryStream();
        
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadstart', handleLoadStart);
      };

      video.addEventListener('loadstart', handleLoadStart);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('error', handleError);
      
    } else {
      setError('Video streaming is not supported in this browser');
      setIsLoading(false);
      isInitializingRef.current = false;
    }
  }, [stableStreamUrl, autoPlay, volume, isMuted, cleanup, retryStream]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => mountedRef.current && setIsPlaying(true);
    const handlePause = () => mountedRef.current && setIsPlaying(false);
    const handleWaiting = () => mountedRef.current && setIsLoading(true);
    const handleCanPlay = () => mountedRef.current && setIsLoading(false);
    const handleVolumeChange = () => {
      if (mountedRef.current) {
        setVolume(video.volume);
        setIsMuted(video.muted);
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

  // Fullscreen handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (mountedRef.current) {
        setIsFullscreen(!!document.fullscreenElement);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Initialize player when URL changes
  useEffect(() => {
    if (stableStreamUrl) {
      // Small delay to prevent rapid re-initialization
      const initTimer = setTimeout(() => {
        if (mountedRef.current) {
          initializePlayer();
        }
      }, 100);

      return () => clearTimeout(initTimer);
    }
  }, [stableStreamUrl, initializePlayer]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  // Control handlers
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || isLoading) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(err => {
        console.error('Play failed:', err);
        setError('Unable to play stream');
      });
    }
  }, [isPlaying, isLoading]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const handleVolumeChange = useCallback((newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    video.volume = clampedVolume;
    video.muted = clampedVolume === 0;
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

  // Controls visibility with debouncing
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    controlsTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current && isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  }, [isPlaying]);

  const handleMouseMove = useCallback(() => {
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  const handleMouseLeave = useCallback(() => {
    if (isPlaying) {
      setShowControls(false);
    }
  }, [isPlaying]);

  const handleRetry = useCallback(() => {
    retryCountRef.current = 0;
    setError(null);
    initializePlayer();
  }, [initializePlayer]);

  // Error state
  if (error) {
    return (
      <div className={`video-player flex items-center justify-center bg-black min-h-[300px] ${className}`}>
        <div className="text-center text-white p-8">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
          <div className="text-lg font-semibold mb-2">Stream Unavailable</div>
          <div className="text-sm text-gray-400 mb-4">{error}</div>
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
      className={`video-player relative bg-black ${isFullscreen ? 'fixed inset-0 z-50' : 'aspect-video'} ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        preload="none"
        muted={isMuted}
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin" />
            <div className="text-sm font-medium">Loading stream...</div>
            {retryCountRef.current > 0 && (
              <div className="text-xs text-gray-400 mt-1">
                Attempt {retryCountRef.current}/3
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      {(!isLoading || showControls) && (
        <div 
          className={`absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 transition-opacity duration-300 ${
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={togglePlay}
        >
          {/* Top Info */}
          <div className="absolute top-4 left-4 right-4 pointer-events-none">
            <div className="text-white font-semibold text-lg">{channelName}</div>
            <div className="flex items-center gap-2 text-red-400 text-sm font-medium mt-1">
              <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
              LIVE
            </div>
          </div>

          {/* Center Play Button */}
          {!isPlaying && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                  className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all"
                >
                  <Play size={32} fill="white" className="ml-1" />
                </button>
              </div>
            </div>
          )}

          {/* Bottom Controls */}
          <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
            <div className="flex items-center gap-4 pointer-events-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="text-white hover:text-blue-400 transition-colors p-2 rounded"
                disabled={isLoading}
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute();
                  }}
                  className="text-white hover:text-blue-400 transition-colors p-2 rounded"
                >
                  {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleVolumeChange(parseFloat(e.target.value));
                  }}
                  className="w-20 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                    [&::-webkit-slider-thumb]:cursor-pointer"
                />
              </div>

              <div className="flex-1" />

              <div className="text-white/70 text-sm">Auto Quality</div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="text-white hover:text-blue-400 transition-colors p-2 rounded"
              >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
