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
  // Use a generic 'id' that can be a HLS index or Shaka track ID
  id: number; 
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
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Refs for different player instances
  const hlsRef = useRef<any>(null);
  const shakaPlayerRef = useRef<any>(null);
  const playerTypeRef = useRef<'hls' | 'shaka' | 'native' | null>(null);

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
    isPipActive: false,
  });

  // --- Player Loading and Destruction ---

  const loadScript = useCallback((src: string, id: string) => {
    return new Promise<void>((resolve, reject) => {
      if (document.getElementById(id)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.id = id;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
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

  // --- Player Initialization Logic ---

  const initializePlayer = useCallback(async () => {
    if (!streamUrl || !videoRef.current) {
      setPlayerState(prev => ({ ...prev, error: 'No stream URL provided', isLoading: false }));
      return;
    }

    const video = videoRef.current;
    destroyPlayer();
    setPlayerState(prev => ({ ...prev, isLoading: true, error: null, isPlaying: false, showSettings: false }));

    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          error: "Stream took too long to load. Please try again.",
        }));
        destroyPlayer();
      }
    }, PLAYER_LOAD_TIMEOUT);

    try {
      // ** CHOOSE PLAYER BASED ON URL **
      if (streamUrl.includes('.mpd')) {
        playerTypeRef.current = 'shaka';
        await initShakaPlayer(streamUrl, video);
      } else if (streamUrl.includes('.m3u8')) {
        playerTypeRef.current = 'hls';
        await initHlsPlayer(streamUrl, video);
      } else { // Handle native playback for MP4, etc.
        playerTypeRef.current = 'native';
        initNativePlayer(streamUrl, video);
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
  }, [streamUrl, autoPlay, muted, destroyPlayer]);

  const initHlsPlayer = async (url: string, video: HTMLVideoElement) => {
    await loadScript('https://cdn.jsdelivr.net/npm/hls.js@latest', 'hls-script');
    const Hls = window.Hls;
    
    if (Hls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false }); // worker can cause issues in some envs
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
        if (autoPlay) {
          video.play().catch(console.warn);
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
        if (!isMountedRef.current || !data.fatal) return;
        console.error('HLS Error:', data);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        
        setPlayerState(prev => ({ ...prev, isLoading: false, error: `Stream error: ${data.details}` }));
        destroyPlayer();
      });
    } else {
        initNativePlayer(url, video);
    }
  };
  
  const initShakaPlayer = async (url: string, video: HTMLVideoElement) => {
    await loadScript('https://ajax.googleapis.com/ajax/libs/shaka-player/4.3.4/shaka-player.compiled.js', 'shaka-script');
    const shaka = window.shaka;
    shaka.polyfill.installAll();

    if (!shaka.Player.isBrowserSupported()) {
        throw new Error('This browser is not supported by Shaka Player.');
    }
    
    const player = new shaka.Player(video);
    shakaPlayerRef.current = player;
    
    // Custom URL parsing for non-standard DRM info
    const urlParts = url.split('?|');
    if (urlParts.length > 1) {
        const params = new URLSearchParams(urlParts[1]);
        const drmScheme = params.get('drmScheme');
        const drmLicense = params.get('drmLicense');

        if (drmScheme === 'clearkey' && drmLicense && drmLicense.includes(':')) {
            const [keyId, key] = drmLicense.split(':');
            player.configure({
                drm: {
                    clearKeys: { [keyId]: key }
                }
            });
        }
    }

    player.addEventListener('error', (event: any) => {
        console.error('Shaka Player Error:', event.detail);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        setPlayerState(prev => ({ ...prev, isLoading: false, error: `Stream error: ${event.detail.code}` }));
        destroyPlayer();
    });

    await player.load(url);
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    
    const tracks = player.getVariantTracks();
    const qualities: QualityLevel[] = tracks.map(track => ({
        height: track.height || 0,
        bitrate: Math.round(track.bandwidth / 1000),
        id: track.id,
    }));
    
    video.muted = muted;
    if (autoPlay) {
        video.play().catch(console.warn);
    }
    
    setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: null,
        availableQualities: qualities,
        currentQuality: -1, // -1 for auto
        isMuted: video.muted,
    }));
  };

  const initNativePlayer = (url: string, video: HTMLVideoElement) => {
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        const onLoadedMetadata = () => {
            if (!isMountedRef.current) return;
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            video.muted = muted;
            if (autoPlay) video.play().catch(console.warn);
            setPlayerState(prev => ({ ...prev, isLoading: false, error: null, isMuted: video.muted }));
        };
        video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
        video.addEventListener('error', () => {
            if (!isMountedRef.current) return;
            setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Failed to load native stream' }));
        }, { once: true });
    } else {
        throw new Error('HLS streams are not supported in this browser.');
    }
  };

  // --- UI and Control Logic (largely unchanged) ---

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

  const changeQuality = useCallback((qualityId: number) => {
    if (playerTypeRef.current === 'hls' && hlsRef.current) {
        hlsRef.current.currentLevel = qualityId; // qualityId is the index for HLS
    } else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
        if (qualityId === -1) { // -1 for auto
            shakaPlayerRef.current.configure({ abr: { enabled: true } });
        } else {
            shakaPlayerRef.current.configure({ abr: { enabled: false } });
            shakaPlayerRef.current.selectVariantTrack(shakaPlayerRef.current.getVariantTracks().find((t: any) => t.id === qualityId), true);
        }
    }
    setPlayerState(prev => ({ ...prev, currentQuality: qualityId, showSettings: false }));
  }, []);

  const handleRetry = useCallback(() => {
    initializePlayer();
  }, [initializePlayer]);

  // --- Effects and Event Listeners (largely unchanged) ---
  
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
            setPlayerState(prev => ({ ...prev, isFullscreen: !!document.fullscreenElement }));
        }
    };
    
    // These listeners work universally as they are on the HTMLVideoElement
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
  }, [playerState.isSeeking]);

  // --- seeking logic, controls visibility, etc. (all unchanged) ---
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
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await container.requestFullscreen();
    }
  }, []);
  
  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await video.requestPictureInPicture();
    }
  }, []);

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
    setPlayerState(prev => ({ ...prev, showControls: !prev.showControls }));
  }, [playerState.showControls, playerState.showSettings]);

  const handleMouseMove = useCallback(() => {
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  useEffect(() => {
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, [handleDragMove, handleDragEnd]);
  
  // --- Render Logic (unchanged) ---

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
        {/* Settings Menu */}
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
                  key={quality.id}
                  onClick={() => changeQuality(quality.id)}
                  className={`w-full text-left px-2 py-1 text-sm rounded transition-colors ${
                    playerState.currentQuality === quality.id 
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

        {/* Play Button Overlay */}
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

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
          {/* Progress Bar */}
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
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-red-500 transition-all duration-150 ease-out ${playerState.isSeeking ? 'scale-150' : 'group-hover:scale-150'}`}
                  style={{ left: `${currentTimePercentage}%` }}
                  onMouseDown={handleDragStart}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </div>
          
          {/* Buttons and Time */}
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
    shaka: any; // Add Shaka Player to the window object
  }
}

export default VideoPlayer;
