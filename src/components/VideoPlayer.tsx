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

const PLAYER_LOAD_TIMEOUT = 15000; // 15 seconds

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamUrl,
  channelName,
  autoPlay = true,
  muted = true,
  className = ""
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const [playerState, setPlayerState] = useState({
    isPlaying: false,
    isMuted: muted,
    isLoading: true,
    error: null as string | null,
    isFullscreen: false,
    showControls: true,
    volume: muted ? 0 : 0.8,
  });

  const destroyHLS = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
  }, []);

  const initializePlayer = useCallback(() => {
    if (!streamUrl || !videoRef.current) return;

    const video = videoRef.current;
    destroyHLS();

    setPlayerState(prev => ({ ...prev, isLoading: true, error: null, isPlaying: false }));

    loadingTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
            setPlayerState(prev => ({
                ...prev,
                isLoading: false,
                error: "Stream timed out. Please try again.",
            }));
            destroyHLS();
        }
    }, PLAYER_LOAD_TIMEOUT);

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxBufferSize: 60 * 1000 * 1000,
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 10000,
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!isMountedRef.current) return;
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        
        video.muted = playerState.isMuted;
        video.volume = playerState.volume;
        if (autoPlay) {
          video.play().catch(() => console.warn('Autoplay was prevented.'));
        }
        setPlayerState(prev => ({ ...prev, isLoading: false }));
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!isMountedRef.current) return;
        console.error('HLS Error:', data.type, data.details);

        if (data.fatal) {
          if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
          switch(data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setPlayerState(prev => ({ ...prev, isLoading: false, error: `Network error: ${data.details}` }));
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setPlayerState(prev => ({ ...prev, isLoading: false, error: `Media error: ${data.details}` }));
              hls.recoverMediaError();
              break;
            default:
              setPlayerState(prev => ({ ...prev, isLoading: false, error: `Stream error: ${data.details}` }));
              destroyHLS();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      const onLoadedMetadata = () => {
        if (!isMountedRef.current) return;
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        video.muted = playerState.isMuted;
        if (autoPlay) {
          video.play().catch(() => console.warn('Autoplay was prevented.'));
        }
        setPlayerState(prev => ({ ...prev, isLoading: false }));
      };
      video.addEventListener('loadedmetadata', onLoadedMetadata);
    } else {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        setPlayerState(prev => ({ ...prev, isLoading: false, error: "HLS is not supported in this browser." }));
    }
  }, [streamUrl, autoPlay, playerState.isMuted, playerState.volume, destroyHLS]);

  useEffect(() => {
    isMountedRef.current = true;
    initializePlayer();
    return () => {
      isMountedRef.current = false;
      destroyHLS();
    };
  }, [streamUrl, initializePlayer]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handlePlay = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isPlaying: true }));
    const handlePause = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isPlaying: false }));
    const handleWaiting = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isLoading: true }));
    const handlePlaying = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isLoading: false }));
    const handleVolumeChange = () => {
        if (isMountedRef.current && video) {
            setPlayerState(prev => ({ ...prev, volume: video.volume, isMuted: video.muted }));
        }
    };
    const handleFullscreenChange = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isFullscreen: !!document.fullscreenElement }));

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('volumechange', handleVolumeChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('volumechange', handleVolumeChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
  }, []);

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
    initializePlayer();
  }, [initializePlayer]);

  const showControlsTemporarily = useCallback(() => {
    if (!isMountedRef.current) return;
    setPlayerState(prev => ({ ...prev, showControls: true }));
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && playerState.isPlaying) {
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
        className={`absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 transition-opacity duration-300 ${
          playerState.showControls || !playerState.isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={togglePlay}
      >
        <div className="absolute top-4 left-4 pointer-events-none">
          <div className="text-white font-medium text-lg">{channelName}</div>
          <div className="flex items-center gap-2 text-red-400 text-sm mt-1">
            <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
            LIVE
          </div>
        </div>

        {!playerState.isPlaying && !playerState.isLoading && !playerState.error && (
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

        <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
          <div className="flex items-center gap-3 pointer-events-auto">
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="text-white hover:text-blue-300 transition-colors p-2"
            >
              {playerState.isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              className="text-white hover:text-blue-300 transition-colors p-2"
            >
              {playerState.isMuted || playerState.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
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
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
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
