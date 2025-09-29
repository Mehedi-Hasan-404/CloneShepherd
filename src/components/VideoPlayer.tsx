// /src/components/VideoPlayer.tsx - Fixed Settings Drawer and Seeking
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { toast } from "sonner";
import {
  Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2,
  AlertCircle, RotateCw, Settings, PictureInPicture2, Subtitles
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
const CONTROLS_HIDE_DELAY = 3000;

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamUrl,
  channelName,
  autoPlay = true,
  muted = false,
  className = ""
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const hlsRef = useRef<any>(null);
  const shakaPlayerRef = useRef<any>(null);
  const playerTypeRef = useRef<'hls' | 'shaka' | 'native' | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Seeking state
  const dragStartRef = useRef<{ isDragging: boolean } | null>(null);
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
    isLive: false,
  });

  // --- STREAM TYPE DETECTION ---
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
    // Fallback for URLs without extensions
    return { type: 'hls', cleanUrl, drmInfo };
  }, []);

  // --- PLAYER INITIALIZATION AND DESTRUCTION ---
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

  const initializePlayer = useCallback(async () => {
    if (!streamUrl || !videoRef.current) {
        setPlayerState(prev => ({...prev, error: "Stream URL is missing.", isLoading: false}));
        return;
    };
    const video = videoRef.current;
    
    destroyPlayer();
    setPlayerState(prev => ({ ...prev, isLoading: true, error: null, isPlaying: false, showSettings: false, showControls: true, isLive: false, duration: 0, currentTime: 0 }));
    
    loadingTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
            setPlayerState(prev => ({ ...prev, isLoading: false, error: "Stream took too long to load. Check the URL and your connection." }));
            destroyPlayer();
        }
    }, PLAYER_LOAD_TIMEOUT);

    try {
        const { type, cleanUrl, drmInfo } = detectStreamType(streamUrl);
        playerTypeRef.current = type;
        if (type === 'dash') await initShakaPlayer(cleanUrl, video, drmInfo);
        else if (type === 'hls') await initHlsPlayer(cleanUrl, video);
        else initNativePlayer(cleanUrl, video);
    } catch (error) {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        setPlayerState(prev => ({ ...prev, isLoading: false, error: error instanceof Error ? error.message : 'Failed to initialize player' }));
    }
  }, [streamUrl, autoPlay, muted, destroyPlayer, detectStreamType]);

  const initHlsPlayer = async (url: string, video: HTMLVideoElement) => {
    try {
      const HlsModule = await import('hls.js');
      const Hls = HlsModule.default;
      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          initNativePlayer(url, video);
        } else {
          throw new Error('HLS is not supported in this browser.');
        }
        return;
      }
      
      const hls = new Hls({
          lowLatencyMode: true,
          backBufferLength: 90,
          fragLoadingMaxRetry: 6,
          manifestLoadingMaxRetry: 4,
          levelLoadingMaxRetry: 5,
      });

      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        if (!isMountedRef.current) return;
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        const levels: QualityLevel[] = hls.levels.map((level: any, index: number) => ({ height: level.height || 0, bitrate: Math.round(level.bitrate / 1000), id: index }));
        video.muted = muted;
        if (autoPlay) video.play().catch(console.warn);
        
        // Always treat as seekable for now - many "live" streams support seeking
        const isLive = data.details.live;
        const duration = data.details.totalduration > 0 ? data.details.totalduration : (isLive ? 0 : video.duration);
        
        setPlayerState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: null, 
          availableQualities: levels, 
          currentQuality: hls.currentLevel, 
          isMuted: video.muted, 
          isPlaying: !video.paused, 
          isLive, 
          duration 
        }));
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!isMountedRef.current) return;
        console.error('HLS.js Error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
              setPlayerState(prev => ({ ...prev, isLoading: false, error: `Playback Error: ${data.details}. This could be due to CORS policy or a broken stream link.` }));
              destroyPlayer();
              break;
          }
        }
      });
    } catch (error) {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        setPlayerState(prev => ({ ...prev, isLoading: false, error: error instanceof Error ? error.message : "Failed to load HLS player."}));
    }
  };

  const initShakaPlayer = async (url: string, video: HTMLVideoElement, drmInfo?: any) => {
    try {
        const shaka = await import('shaka-player/dist/shaka-player.ui.js');
        shaka.default.polyfill.installAll();
        if (!shaka.default.Player.isBrowserSupported()) {
            throw new Error('This browser is not supported by Shaka Player');
        }

        if (shakaPlayerRef.current) await shakaPlayerRef.current.destroy();
        const player = new shaka.default.Player(video);
        shakaPlayerRef.current = player;
        
        player.configure({
            streaming: { bufferingGoal: 30, rebufferingGoal: 4, bufferBehind: 30, retryParameters: { timeout: 10000, maxAttempts: 5, backoffFactor: 2 }},
            manifest: { retryParameters: { timeout: 10000, maxAttempts: 4 }},
            drm: { retryParameters: { timeout: 10000, maxAttempts: 5 }}
        });
        
        if (drmInfo?.scheme === 'clearkey' && drmInfo.license?.includes(':')) {
            const [keyId, key] = drmInfo.license.split(':');
            player.configure({ drm: { clearKeys: { [keyId]: key } } });
        }

        player.addEventListener('error', (event: any) => {
            console.error('Shaka Player Error:', event.detail);
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            setPlayerState(prev => ({ ...prev, isLoading: false, error: `Error ${event.detail.code}: ${event.detail.message}` }));
        });

        await player.load(url);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);

        const tracks = player.getVariantTracks();
        const qualities: QualityLevel[] = tracks.map(track => ({ height: track.height || 0, bitrate: Math.round(track.bandwidth / 1000), id: track.id }));
        const textTracks = player.getTextTracks();
        const subtitles: SubtitleTrack[] = textTracks.map(track => ({ id: track.id.toString(), label: track.label || track.language || 'Unknown', language: track.language || 'unknown' }));

        video.muted = muted;
        if (autoPlay) video.play().catch(console.warn);
        
        // Always treat as seekable for now - many "live" streams support seeking
        const isLive = player.isLive();
        let duration = 0;
        try {
          const seekRange = player.seekRange();
          duration = seekRange.end - seekRange.start;
        } catch (e) {
          duration = isLive ? 0 : video.duration;
        }
        
        setPlayerState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: null, 
          availableQualities: qualities, 
          availableSubtitles: subtitles, 
          isMuted: video.muted, 
          isPlaying: !video.paused, 
          isLive, 
          duration 
        }));
    } catch (error) {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        setPlayerState(prev => ({ ...prev, isLoading: false, error: error instanceof Error ? `Shaka Error: ${error.message}` : 'Failed to initialize Shaka player' }));
    }
  };

  const initNativePlayer = (url: string, video: HTMLVideoElement) => {
    video.src = url;
    const onCanPlay = () => {
      if (!isMountedRef.current) return;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      video.muted = muted;
      if (autoPlay) video.play().catch(console.warn);
      const isLive = !isFinite(video.duration);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: null, isMuted: video.muted, isPlaying: !video.paused, isLive, duration: isLive ? 0 : video.duration }));
    };
    video.addEventListener('canplay', onCanPlay, { once: true });
    video.addEventListener('error', () => {
        setPlayerState(p => ({...p, error: "The native player could not play this stream format.", isLoading: false}))
    }, { once: true });
  };

  // --- CONTROLS VISIBILITY LOGIC ---
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

  // FIXED: This now properly shows controls when clicking anywhere on the player
  const handlePlayerClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Only prevent controls toggle if clicking on actual controls
    if (target.closest('.no-toggle-controls')) return;
    
    // Always show controls on player click
    setPlayerState(prev => ({ ...prev, showControls: true }));
    resetControlsTimer();
  }, [resetControlsTimer]);

  // --- PLAYER ACTIONS ---
  const togglePlay = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) {
          video.play().catch(err => console.error("Play failed:", err));
      } else {
          video.pause();
      }
      resetControlsTimer();
  }, [resetControlsTimer]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      const video = videoRef.current;
      if (video) {
          video.muted = !video.muted;
          resetControlsTimer();
      }
  }, [resetControlsTimer]);

  const togglePip = useCallback(async (e: React.MouseEvent) => {
      e.stopPropagation();
      const video = videoRef.current;
      if (!video || !document.pictureInPictureEnabled) return;
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      } catch(error) { console.error("PiP failed:", error)}
  }, []);

  const toggleFullscreen = useCallback(async (e: React.MouseEvent) => {
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      try {
          if (!document.fullscreenElement) {
              await container.requestFullscreen();
              if (window.screen.orientation?.lock) {
                  await window.screen.orientation.lock('landscape').catch(err => console.warn("Could not lock orientation:", err));
              }
          } else {
              await document.exitFullscreen();
              if (window.screen.orientation?.unlock) {
                  window.screen.orientation.unlock();
              }
          }
      } catch (error) {
          console.error('Fullscreen API error:', error);
          toast.error("Fullscreen not available on this device.");
      }
  }, []);

  // --- SEEKING LOGIC ---
  const calculateNewTime = useCallback((clientX: number): number | null => {
    const progressBar = progressRef.current;
    const video = videoRef.current;
    if (!progressBar || !video) return null;
    
    const rect = progressBar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    
    // For all content including "live" streams that support seeking
    if (playerTypeRef.current === 'hls' && hlsRef.current) {
      const seekable = hlsRef.current.media.seekable;
      if (seekable.length > 0) {
        const startTime = seekable.start(0);
        const endTime = seekable.end(0);
        return startTime + pos * (endTime - startTime);
      }
    } else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      try {
        const seekRange = shakaPlayerRef.current.seekRange();
        return seekRange.start + pos * (seekRange.end - seekRange.start);
      } catch (e) {
        // Fallback to duration-based seeking
        return pos * video.duration;
      }
    } else {
      // Native video or fallback
      return pos * video.duration;
    }
    
    return null;
  }, []);

  const handleSeekStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    wasPlayingBeforeSeekRef.current = !video.paused;
    dragStartRef.current = { isDragging: true };
    setPlayerState(prev => ({ ...prev, isSeeking: true }));
    video.pause();
  }, []);

  const handleSeekMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragStartRef.current?.isDragging) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const newTime = calculateNewTime(clientX);
    if (newTime !== null) {
      if(videoRef.current) videoRef.current.currentTime = newTime;
      setPlayerState(prev => ({ ...prev, currentTime: newTime }));
    }
  }, [calculateNewTime]);

  const handleSeekEnd = useCallback(() => {
    if (!dragStartRef.current?.isDragging) return;
    dragStartRef.current = null;
    setPlayerState(prev => ({ ...prev, isSeeking: false }));
    const video = videoRef.current;
    if (video && wasPlayingBeforeSeekRef.current) {
        video.play().catch(console.error);
    }
    resetControlsTimer();
  }, [resetControlsTimer]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const newTime = calculateNewTime(e.clientX);
    if (newTime !== null && videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  }, [calculateNewTime]);

  // Touch event handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    handleSeekStart(e);
  }, [handleSeekStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling while seeking
    handleSeekMove(e);
  }, [handleSeekMove]);

  const handleTouchEnd = useCallback(() => {
    handleSeekEnd();
  }, [handleSeekEnd]);

  // --- SETTINGS LOGIC ---
  const changeQuality = useCallback((qualityId: number) => {
    if (playerTypeRef.current === 'hls' && hlsRef.current) {
      hlsRef.current.currentLevel = qualityId;
    } else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
        if (qualityId === -1) {
            shakaPlayerRef.current.configure({ abr: { enabled: true }});
        } else {
            shakaPlayerRef.current.configure({ abr: { enabled: false }});
            const tracks = shakaPlayerRef.current.getVariantTracks();
            const targetTrack = tracks.find((t: any) => t.id === qualityId);
            if (targetTrack) shakaPlayerRef.current.selectVariantTrack(targetTrack, true);
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
            if(targetTrack) {
                shakaPlayerRef.current.selectTextTrack(targetTrack);
                shakaPlayerRef.current.setTextTrackVisibility(true);
            }
        }
    }
    setPlayerState(prev => ({ ...prev, currentSubtitle: subtitleId }));
  }, []);

  // --- UTILITY FUNCTIONS ---
  const formatTime = (time: number): string => {
    if (!isFinite(time) || time < 0) return "00:00";
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleRetry = useCallback(() => {
    initializePlayer();
  }, [initializePlayer]);

  // --- LIFECYCLE AND EVENT LISTENERS ---
  useEffect(() => {
    isMountedRef.current = true;
    initializePlayer();
    return () => {
      isMountedRef.current = false;
      destroyPlayer();
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      if (screen.orientation && typeof screen.orientation.unlock === 'function') {
        screen.orientation.unlock();
      }
    };
  }, [streamUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleTimeUpdate = () => {
      if (!isMountedRef.current || playerState.isSeeking) return;
      
      let currentTime = video.currentTime;
      let buffered = 0;
      let duration = playerState.duration;
      
      if (video.buffered.length > 0) {
        buffered = video.buffered.end(video.buffered.length - 1);
      }
      
      // Update duration for seekable content
      if (playerTypeRef.current === 'hls' && hlsRef.current) {
        const seekable = hlsRef.current.media.seekable;
        if (seekable.length > 0) {
          duration = seekable.end(seekable.length - 1) - seekable.start(0);
        }
      } else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
        try {
          const seekRange = shakaPlayerRef.current.seekRange();
          duration = seekRange.end - seekRange.start;
        } catch (e) {
          // Keep existing duration
        }
      }
      
      setPlayerState(prev => ({ 
        ...prev, 
        currentTime, 
        buffered, 
        duration: playerState.isLive && duration === 0 ? 0 : duration 
      }));
    };
    const handlePlay = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isPlaying: true }));
    const handlePause = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isPlaying: false }));
    const handleWaiting = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isLoading: true }));
    const handlePlaying = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isLoading: false, isPlaying: true }));
    const handleVolumeChange = () => isMountedRef.current && video && setPlayerState(prev => ({ ...prev, isMuted: video.muted }));
    const handleFullscreenChange = () => isMountedRef.current && setPlayerState(prev => ({ ...prev, isFullscreen: !!document.fullscreenElement }));

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('volumechange', handleVolumeChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('volumechange', handleVolumeChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [playerState.isSeeking, playerState.isLive]);
  
  useEffect(() => {
    // Mouse events
    document.addEventListener('mousemove', handleSeekMove);
    document.addEventListener('mouseup', handleSeekEnd);
    
    // Touch events
    document.addEventListener('touchmove', handleSeekMove, { passive: false });
    document.addEventListener('touchend', handleSeekEnd);
    
    return () => {
      document.removeEventListener('mousemove', handleSeekMove);
      document.removeEventListener('mouseup', handleSeekEnd);
      document.removeEventListener('touchmove', handleSeekMove);
      document.removeEventListener('touchend', handleSeekEnd);
    };
  }, [handleSeekMove, handleSeekEnd]);

  useEffect(() => {
    if (playerState.isPlaying && playerState.showControls) {
        startControlsTimer();
    }
    if(controlsTimeoutRef.current && !playerState.showControls) {
        clearTimeout(controlsTimeoutRef.current)
    }
  }, [playerState.isPlaying, playerState.showControls, startControlsTimer]);

  // --- PERFORMANCE OPTIMIZATIONS ---
  // FIXED: Always show seekbar for content that has duration or is seekable
  const isSeekable = useMemo(() => 
    (playerState.duration > 0 && isFinite(playerState.duration)) || 
    (playerState.isLive && playerState.buffered > 0),
    [playerState.duration, playerState.isLive, playerState.buffered]
  );

  const currentTimePercentage = useMemo(() => {
    if (!isSeekable || playerState.duration <= 0) return 0;
    
    // Calculate percentage based on actual seekable range
    if (playerTypeRef.current === 'hls' && hlsRef.current) {
      const seekable = hlsRef.current.media.seekable;
      if (seekable.length > 0) {
        const startTime = seekable.start(0);
        const endTime = seekable.end(0);
        if (endTime > startTime) {
          return ((playerState.currentTime - startTime) / (endTime - startTime)) * 100;
        }
      }
    } else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      try {
        const seekRange = shakaPlayerRef.current.seekRange();
        if (seekRange.end > seekRange.start) {
          return ((playerState.currentTime - seekRange.start) / (seekRange.end - seekRange.start)) * 100;
        }
      } catch (e) {
        // Fallback to duration-based calculation
      }
    }
    
    // Fallback to simple duration-based calculation
    return playerState.duration > 0 ? (playerState.currentTime / playerState.duration) * 100 : 0;
  }, [isSeekable, playerState.currentTime, playerState.duration]);

  const bufferedPercentage = useMemo(() => {
    if (!isSeekable || playerState.duration <= 0) return 0;
    
    // Calculate buffered percentage based on actual seekable range
    if (playerTypeRef.current === 'hls' && hlsRef.current) {
      const seekable = hlsRef.current.media.seekable;
      if (seekable.length > 0) {
        const startTime = seekable.start(0);
        const endTime = seekable.end(0);
        if (endTime > startTime && playerState.buffered > 0) {
          return ((playerState.buffered - startTime) / (endTime - startTime)) * 100;
        }
      }
    } else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      try {
        const seekRange = shakaPlayerRef.current.seekRange();
        if (seekRange.end > seekRange.start && playerState.buffered > 0) {
          return ((playerState.buffered - seekRange.start) / (seekRange.end - seekRange.start)) * 100;
        }
      } catch (e) {
        // Fallback to duration-based calculation
      }
    }
    
    // Fallback to simple duration-based calculation
    return playerState.duration > 0 ? (playerState.buffered / playerState.duration) * 100 : 0;
  }, [isSeekable, playerState.buffered, playerState.duration]);

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
              <p>Loading Stream...</p>
            </div>
        </div>
      )}

      {playerState.error && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20 text-center p-4">
            <div>
                <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
                <h3 className="text-xl font-bold mb-2">Stream Error</h3>
                <p className="text-gray-300 mb-6 max-w-md mx-auto">{playerState.error}</p>
                <button 
                  onClick={handleRetry} 
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg"
                >
                    <RotateCw size={16} /> Retry
                </button>
            </div>
        </div>
      )}

      <div className={`controls-area absolute inset-0 transition-opacity duration-300 z-10 ${playerState.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/50 pointer-events-none"></div>
        
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center">
            <h3 className="text-white text-lg font-bold drop-shadow-md">{channelName}</h3>
            {(playerState.availableQualities.length > 0 || playerState.availableSubtitles.length > 0) && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setPlayerState(p => ({ ...p, showSettings: true }));
                }}
                className="p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-all no-toggle-controls"
                title="Settings"
              >
                <Settings size={20} />
              </button>
            )}
        </div>

        {!playerState.isPlaying && !playerState.isLoading && !playerState.error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button 
              onClick={togglePlay} 
              className="pointer-events-auto w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all scale-100 hover:scale-110 no-toggle-controls"
            >
              <Play size={36} fill="white" className="ml-1" />
            </button>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
          {/* Seek Bar - Always shown for content with duration or seekable ranges */}
          <div 
            ref={progressRef} 
            className="relative h-1.5 bg-white/20 rounded-full group/seekbar cursor-pointer" 
            onClick={handleProgressClick}
            onMouseDown={handleSeekStart}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
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
              onTouchStart={handleTouchStart}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          
          <div className="flex items-center gap-4 text-white">
            <button 
              onClick={togglePlay} 
              className="hover:scale-110 transition-transform no-toggle-controls"
            >
              {playerState.isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            
            <button 
              onClick={toggleMute} 
              className="hover:scale-110 transition-transform no-toggle-controls"
            >
              {playerState.isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
            </button>
            
            {/* Show time for all content including "live" streams with seek capability */}
            <div className="text-sm font-mono">
              {formatTime(playerState.currentTime)}{playerState.duration > 0 ? ` / ${formatTime(playerState.duration)}` : ''}
            </div>
            
            <div className="flex-grow"></div>
            
            {document.pictureInPictureEnabled && (
              <button 
                onClick={togglePip} 
                className="hover:scale-110 transition-transform no-toggle-controls" 
                title="Picture-in-picture"
              >
                <PictureInPicture2 size={20} />
              </button>
            )}
            
            <button 
              onClick={toggleFullscreen} 
              className="hover:scale-110 transition-transform no-toggle-controls" 
              title="Fullscreen"
            >
              {playerState.isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
            </button>
          </div>
        </div>
      </div>
      
      {/* FIXED: Settings drawer with proper positioning for both portrait and landscape */}
      <Drawer 
        open={playerState.showSettings} 
        onOpenChange={(isOpen) => setPlayerState(p => ({ ...p, showSettings: isOpen }))}
        modal={true}
      >
        <DrawerContent 
          className="bg-[#0a0a0a] text-white border-t border-gray-700 outline-none max-h-[80vh]"
          style={{ 
            maxHeight: '80vh',
            height: 'auto',
            bottom: '0',
            top: 'auto'
          }}
        >
          <DrawerHeader className="border-b border-gray-700">
            <DrawerTitle className="text-center text-xl">Stream Settings</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 80px)' }}>
            <Accordion type="single" collapsible className="w-full">
              {playerState.availableQualities.length > 0 && (
                <AccordionItem value="quality" className="border-b border-gray-700">
                  <AccordionTrigger className="text-white hover:no-underline">Quality</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1 pt-2">
                      <button 
                        onClick={() => changeQuality(-1)} 
                        className={`w-full text-left px-3 py-2 rounded transition-colors ${playerState.currentQuality === -1 ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}
                      >
                        Auto
                      </button>
                      {playerState.availableQualities.map((quality) => (
                        <button 
                          key={quality.id} 
                          onClick={() => changeQuality(quality.id)} 
                          className={`w-full text-left px-3 py-2 rounded transition-colors ${playerState.currentQuality === quality.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}
                        >
                          {quality.height}p ({quality.bitrate} kbps)
                        </button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
              
              {playerState.availableSubtitles.length > 0 && (
                <AccordionItem value="subtitles" className="border-b border-gray-700">
                  <AccordionTrigger className="text-white hover:no-underline">Subtitles</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1 pt-2">
                      <button 
                        onClick={() => changeSubtitle('')} 
                        className={`w-full text-left px-3 py-2 rounded transition-colors ${playerState.currentSubtitle === '' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}
                      >
                        Off
                      </button>
                      {playerState.availableSubtitles.map((subtitle) => (
                        <button 
                          key={subtitle.id} 
                          onClick={() => changeSubtitle(subtitle.id)} 
                          className={`w-full text-left px-3 py-2 rounded transition-colors ${playerState.currentSubtitle === subtitle.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}
                        >
                          {subtitle.label}
                        </button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
              
              <AccordionItem value="playback-speed" className="border-b-0">
                <AccordionTrigger className="text-white hover:no-underline">Playback Speed</AccordionTrigger>
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
                        className={`w-full text-left px-3 py-2 rounded transition-colors ${videoRef.current?.playbackRate === speed ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}
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
