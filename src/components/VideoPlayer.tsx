// /src/components/VideoPlayer.tsx - Fixed Version
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
  id: number; 
}

const PLAYER_LOAD_TIMEOUT = 30000; // 30 seconds
const CONTROLS_HIDE_DELAY = 3000; // 3 seconds

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
  const lastActivityRef = useRef<number>(Date.now());

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

  // Enhanced stream type detection
  const detectStreamType = useCallback((url: string): { type: 'hls' | 'dash' | 'native'; cleanUrl: string; drmInfo?: any } => {
    console.log('Detecting stream type for:', url);
    
    // Handle custom DRM format with ?| separator
    let cleanUrl = url;
    let drmInfo = null;
    
    if (url.includes('?|')) {
      const [baseUrl, drmParams] = url.split('?|');
      cleanUrl = baseUrl;
      
      // Parse DRM parameters
      if (drmParams) {
        const params = new URLSearchParams(drmParams);
        const drmScheme = params.get('drmScheme');
        const drmLicense = params.get('drmLicense');
        
        if (drmScheme && drmLicense) {
          drmInfo = { scheme: drmScheme, license: drmLicense };
          console.log('DRM detected:', drmInfo);
        }
      }
    }
    
    // Detect stream type from clean URL
    const urlLower = cleanUrl.toLowerCase();
    
    // DASH detection
    if (urlLower.includes('.mpd') || urlLower.includes('/dash/') || urlLower.includes('dash')) {
      return { type: 'dash', cleanUrl, drmInfo };
    }
    
    // HLS detection
    if (urlLower.includes('.m3u8') || urlLower.includes('/hls/') || urlLower.includes('hls')) {
      return { type: 'hls', cleanUrl, drmInfo };
    }
    
    // MP4 and other native formats
    if (urlLower.includes('.mp4') || urlLower.includes('.webm') || urlLower.includes('.mov')) {
      return { type: 'native', cleanUrl, drmInfo };
    }
    
    // Default fallback based on content hints
    if (urlLower.includes('manifest') || drmInfo) {
      return { type: 'dash', cleanUrl, drmInfo }; // Often DASH manifests
    }
    
    // Final fallback - try HLS first as it's more common
    return { type: 'hls', cleanUrl, drmInfo };
  }, []);

  // --- Player Loading and Destruction ---

  const destroyPlayer = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (e) {
        console.warn('Error destroying HLS player:', e);
      }
      hlsRef.current = null;
    }
    if (shakaPlayerRef.current) {
      try {
        shakaPlayerRef.current.destroy();
      } catch (e) {
        console.warn('Error destroying Shaka player:', e);
      }
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
    setPlayerState(prev => ({ ...prev, isLoading: true, error: null, isPlaying: false, showSettings: false, showControls: true }));

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
      // Enhanced stream type detection
      const { type, cleanUrl, drmInfo } = detectStreamType(streamUrl);
      console.log(`Detected stream type: ${type}, Clean URL: ${cleanUrl}`);
      
      if (drmInfo) {
        console.log('DRM info:', drmInfo);
      }

      // Initialize appropriate player
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
      console.error('Player initialization error:', error);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize player'
      }));
    }
  }, [streamUrl, autoPlay, muted, destroyPlayer, detectStreamType]);

  const initHlsPlayer = async (url: string, video: HTMLVideoElement) => {
    console.log('Initializing HLS player with URL:', url);
    
    try {
      const Hls = (await import('hls.js')).default;
      
      if (Hls && Hls.isSupported()) {
        const hls = new Hls({ 
          enableWorker: false,
          debug: true,
          capLevelToPlayerSize: true,
          maxLoadingDelay: 4,
          maxBufferLength: 30,
          maxBufferSize: 60 * 1000 * 1000,
          fragLoadingTimeOut: 20000,
          manifestLoadingTimeOut: 10000
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
          if (autoPlay) {
            video.play().catch(console.warn);
          }
          
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
          
          console.log('HLS player initialized successfully');
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!isMountedRef.current) return;
          console.error('HLS Error:', data);
          
          if (data.fatal) {
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            
            // Try to recover from fatal errors
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('Network error, trying to recover...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Media error, trying to recover...');
                hls.recoverMediaError();
                break;
              default:
                setPlayerState(prev => ({ 
                  ...prev, 
                  isLoading: false, 
                  error: `HLS Error: ${data.details}` 
                }));
                destroyPlayer();
                break;
            }
          }
        });

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        console.log('Using native HLS support');
        initNativePlayer(url, video);
      } else {
        throw new Error('HLS is not supported in this browser');
      }
    } catch (error) {
      console.error('Error initializing HLS player:', error);
      throw error;
    }
  };
  
  const initShakaPlayer = async (url: string, video: HTMLVideoElement, drmInfo?: any) => {
    console.log('Initializing Shaka player with URL:', url);
    
    try {
      // Dynamically import shaka-player
      const shaka = await import('shaka-player/dist/shaka-player.ui.js');
      
      // Install polyfills
      shaka.default.polyfill.installAll();

      if (!shaka.default.Player.isBrowserSupported()) {
        throw new Error('This browser is not supported by Shaka Player');
      }
      
      // Destroy any existing player
      if (shakaPlayerRef.current) {
        await shakaPlayerRef.current.destroy();
      }
      
      const player = new shaka.default.Player(video);
      shakaPlayerRef.current = player;
      
      // Configure player
      player.configure({
        streaming: {
          bufferingGoal: 30,
          rebufferingGoal: 15,
          bufferBehind: 30,
          retryParameters: {
            timeout: 10000,
            maxAttempts: 4,
            baseDelay: 1000,
            backoffFactor: 2,
            fuzzFactor: 0.5
          }
        },
        manifest: {
          retryParameters: {
            timeout: 10000,
            maxAttempts: 4,
            baseDelay: 1000,
            backoffFactor: 2,
            fuzzFactor: 0.5
          }
        }
      });

      // Handle DRM if present
      if (drmInfo) {
        console.log('Configuring DRM:', drmInfo);
        
        if (drmInfo.scheme === 'clearkey' && drmInfo.license) {
          if (drmInfo.license.includes(':')) {
            const [keyId, key] = drmInfo.license.split(':');
            player.configure({
              drm: {
                clearKeys: { [keyId]: key }
              }
            });
            console.log('ClearKey DRM configured');
          }
        }
      }

      // Error handling
      const onError = (event: any) => {
        console.error('Shaka Player Error:', event.detail);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        
        const errorCode = event.detail.code;
        let errorMessage = `Stream error (${errorCode})`;
        
        // Provide more user-friendly error messages
        if (errorCode >= 6000 && errorCode < 7000) {
          errorMessage = 'Network error - please check your connection';
        } else if (errorCode >= 4000 && errorCode < 5000) {
          errorMessage = 'Media format not supported';
        } else if (errorCode >= 1000 && errorCode < 2000) {
          errorMessage = 'DRM error - content may be protected';
        }
        
        setPlayerState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: errorMessage 
        }));
        destroyPlayer();
      };

      player.addEventListener('error', onError);

      // State change handlers for Shaka player
      const onShakaStateChange = () => {
        if (!isMountedRef.current || !video) return;
        setPlayerState(prev => ({
          ...prev,
          isPlaying: !video.paused,
          isMuted: video.muted
        }));
      };

      video.addEventListener('play', onShakaStateChange);
      video.addEventListener('pause', onShakaStateChange);
      video.addEventListener('volumechange', onShakaStateChange);

      // Load the manifest
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
        isPlaying: true,
        showControls: true
      }));
      
      console.log('Shaka player initialized successfully');
      
      // Cleanup function
      return () => {
        player.removeEventListener('error', onError);
        video.removeEventListener('play', onShakaStateChange);
        video.removeEventListener('pause', onShakaStateChange);
        video.removeEventListener('volumechange', onShakaStateChange);
      };
      
    } catch (error) {
      console.error('Error initializing Shaka player:', error);
      throw error;
    }
  };

  const initNativePlayer = (url: string, video: HTMLVideoElement) => {
    console.log('Initializing native player with URL:', url);
    
    // Check if the browser can play the content type
    const canPlay = video.canPlayType('application/vnd.apple.mpegurl') ||
                    video.canPlayType('video/mp4') ||
                    video.canPlayType('video/webm');
    
    if (canPlay) {
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
        console.log('Native player initialized successfully');
      };
      
      const onError = () => {
        if (!isMountedRef.current) return;
        console.error('Native player error');
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        setPlayerState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Failed to load stream with native player' 
        }));
      };
      
      video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      video.addEventListener('error', onError, { once: true });
      
      // Cleanup function
      return () => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('error', onError);
      };
    } else {
      throw new Error('Media format not supported by this browser');
    }
  };

  // --- UI and Control Logic ---

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
    setPlayerState(prev => ({ ...prev, currentQuality: qualityId, showSettings: false }));
  }, []);

  const handleRetry = useCallback(() => {
    console.log('Retrying stream initialization');
    initializePlayer();
  }, [initializePlayer]);

  // --- Effects and Event Listeners ---
  
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
        buffered: buffered 
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
      setPlayerState(prev => ({ ...prev, isFullscreen: !!document.fullscreenElement }));
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
  }, [playerState.isSeeking]);

  // --- Seeking logic, controls visibility, etc. ---
  const calculateNewTime = useCallback((clientX: number): number | null => {
    const video = videoRef.current;
    const progressBar = progressRef.current;
    if (!video || !progressBar || !isFinite(video.duration) || video.duration <= 0) return null;
    const rect = progressBar.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = clickX / rect.width;
    return percentage * video.duration;
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || !isFinite(video.duration) || video.duration <= 0) return;
    wasPlayingBeforeSeekRef.current = !video.paused;
    dragStartRef.current = { isDragging: true };
    setPlayerState(prev => ({ ...prev, isSeeking: true, showControls: true }));
    video.pause();
    lastActivityRef.current = Date.now();
  }, []);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current?.isDragging) return;
    const newTime = calculateNewTime(e.clientX);
    if (newTime !== null) {
      setPlayerState(prev => ({ ...prev, currentTime: newTime, showControls: true }));
      seekTimeRef.current = newTime;
    }
    lastActivityRef.current = Date.now();
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
    setPlayerState(prev => ({ ...prev, isSeeking: false, isPlaying: !video?.paused, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
    
    if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      if (video.paused) {
        shakaPlayerRef.current.play().catch(console.error);
      } else {
        shakaPlayerRef.current.pause();
      }
    } else {
      if (video.paused) {
        video.play().catch(console.error);
      } else {
        video.pause();
      }
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
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await container.requestFullscreen();
    }
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);
  
  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await video.requestPictureInPicture();
    }
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

  const showControlsTemporarily = useCallback(() => {
    if (!isMountedRef.current) return;
    
    // Always show controls when there's user activity
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
    
    // Clear any existing timeout
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    // Set new timeout to hide controls after inactivity
    controlsTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        // Only hide controls if:
        // 1. Player is actually playing
        // 2. No settings menu is open
        // 3. Not currently seeking
        // 4. No recent activity (within last 3 seconds)
        const timeSinceLastActivity = Date.now() - lastActivityRef.current;
        if (playerState.isPlaying && 
            !playerState.showSettings && 
            !playerState.isSeeking && 
            timeSinceLastActivity > CONTROLS_HIDE_DELAY - 100) {
          setPlayerState(prev => ({ ...prev, showControls: false }));
        }
      }
    }, CONTROLS_HIDE_DELAY);
  }, [playerState.isPlaying, playerState.showSettings, playerState.isSeeking]);

  const handlePlayerClick = useCallback(() => {
    if (playerState.showSettings) {
      setPlayerState(prev => ({ ...prev, showSettings: false, showControls: true }));
      lastActivityRef.current = Date.now();
      return;
    }
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
  }, [playerState.showSettings]);

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
  
  // --- Render Logic ---

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
          playerState.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Settings Menu */}
        {playerState.showSettings && (
          <div className="absolute top-4 right-4 bg-black/90 rounded-lg p-2 min-w-48 z-10">
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
            <div className="absolute inset-0 flex items-center justify-center">
                <button
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="w-16 h-16 bg-white bg-opacity-20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-opacity-30 transition-all"
               >
                <Play size={24} fill="white" className="ml-1" />
                </button>
            </div>
        )}

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          {/* Progress Bar */}
          <div className="mb-4">
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
          <div className="flex items-center gap-3">
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

export default VideoPlayer;
