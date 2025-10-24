// /src/components/VideoPlayer.tsx - Responsive Player with Desktop & Mobile Layouts
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2, AlertCircle, RotateCcw, Settings, PictureInPicture2, Subtitles, Rewind, FastForward, ChevronRight, Volume1, Music } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

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

interface AudioTrack {
  id: number;
  label: string;
  language: string;
}

const PLAYER_LOAD_TIMEOUT = 15000;
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
  
  const hlsRef = useRef<any>(null);
  const shakaPlayerRef = useRef<any>(null);
  const playerTypeRef = useRef<'hls' | 'shaka' | 'native' | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const progressRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const dragStartRef = useRef<{ isDragging: boolean; } | null>(null);
  const wasPlayingBeforeSeekRef = useRef(false);
  const seekTimeRef = useRef(0);

  const isMobile = useIsMobile();
  const [isLandscape, setIsLandscape] = useState(false);
  const [volume, setVolume] = useState(100);
  const [expandedSettingItem, setExpandedSettingItem] = useState<string | null>(null);

  const [sheetDragY, setSheetDragY] = useState(0);
  const touchStartYRef = useRef<number | null>(null);

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
    availableAudioTracks: [] as AudioTrack[],
    currentSubtitle: '',
    currentAudioTrack: -1,
    isSeeking: false,
    isPipActive: false,
  });

  const detectStreamType = useCallback((url: string): { type: 'hls' | 'dash' | 'native'; cleanUrl: string; drmInfo?: any } => {
    let cleanUrl = url;
    let drmInfo = null;
    
    if (url.includes('?|')) {
       const [baseUrl, drmParams] = url.split('?|');
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
    
    if (urlLower.includes('.mpd') || urlLower.includes('/dash/')) {
      return { type: 'dash', cleanUrl, drmInfo };
    }
    if (urlLower.includes('.m3u8') || urlLower.includes('/hls/')) {
      return { type: 'hls', cleanUrl, drmInfo };
    }
    if (urlLower.includes('manifest') || drmInfo) {
      return { type: 'dash', cleanUrl, drmInfo };
    }
    if (urlLower.includes('.mp4') || urlLower.includes('.webm') || urlLower.includes('.mov') || 
        urlLower.includes('.mkv') || urlLower.includes('.avi') || urlLower.includes('.flv') || 
        urlLower.includes('.ts') || urlLower.includes('.ogg') || urlLower.includes('.ogv') ||
        (urlLower.includes('pixeldrain') && urlLower.includes('download'))) {
      return { type: 'native', cleanUrl, drmInfo };
    }
    if (urlLower.includes('dash')) {
      return { type: 'dash', cleanUrl, drmInfo };
    }
    if (urlLower.includes('hls')) {
      return { type: 'hls', cleanUrl, drmInfo };
    }
    return { type: 'hls', cleanUrl, drmInfo };
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
      showControls: true 
    }));

    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setPlayerState(prev => ({ ...prev, isLoading: false, error: "Stream took too long to load. Please try again." }));
        destroyPlayer();
      }
    }, PLAYER_LOAD_TIMEOUT);

    try {
      const { type, cleanUrl, drmInfo } = detectStreamType(streamUrl);
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
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: error instanceof Error ? error.message : 'Failed to initialize player' }));
    }
  }, [streamUrl, autoPlay, muted, destroyPlayer, detectStreamType]);

  const initHlsPlayer = async (url: string, video: HTMLVideoElement) => {
    try {
      const Hls = (await import('hls.js')).default;
      if (Hls && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, debug: false, capLevelToPlayerSize: true, maxLoadingDelay: 1, maxBufferLength: 15, maxBufferSize: 20 * 1000 * 1000, fragLoadingTimeOut: 8000, manifestLoadingTimeOut: 4000, startLevel: -1, startPosition: -1 });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!isMountedRef.current) return;
          if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
          const levels: QualityLevel[] = hls.levels.map((level: any, index: number) => ({ height: level.height || 0, bitrate: Math.round(level.bitrate / 1000), id: index }));
          
          const audioTracks: AudioTrack[] = hls.audioTracks.map((track: any, index: number) => ({
            id: index,
            label: track.name || track.lang || `Audio ${index + 1}`,
            language: track.lang || 'unknown'
          }));
          
          video.muted = muted;
          if (autoPlay) video.play().catch(console.warn);
          setPlayerState(prev => ({ ...prev, isLoading: false, error: null, availableQualities: levels, availableAudioTracks: audioTracks, currentQuality: hls.currentLevel, currentAudioTrack: hls.audioTrack, isMuted: video.muted, isPlaying: true, showControls: true }));
          startControlsTimer();
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!isMountedRef.current) return;
          if (data.fatal) {
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
              case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
              default: setPlayerState(prev => ({ ...prev, isLoading: false, error: `HLS Error: ${data.details}` })); destroyPlayer(); break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        initNativePlayer(url, video);
      } else {
        throw new Error('HLS is not supported in this browser');
      }
    } catch (error) { throw error; }
  };
  
  const initShakaPlayer = async (url: string, video: HTMLVideoElement, drmInfo?: any) => {
    try {
      // @ts-expect-error - Dynamic import workaround for shaka-player
      const shakaModule = await import('shaka-player');
      const shaka = shakaModule.default || shakaModule;
      
      if (shaka.polyfill) {
        shaka.polyfill.installAll();
      }
      
      const Player = shaka.Player;
      if (!Player || !Player.isBrowserSupported()) {
        throw new Error('This browser is not supported by Shaka Player');
      }
      if (shakaPlayerRef.current) await shakaPlayerRef.current.destroy();
      const player = new Player(video);
      shakaPlayerRef.current = player;
      player.configure({ streaming: { bufferingGoal: 15, rebufferingGoal: 8, bufferBehind: 15, retryParameters: { timeout: 4000, maxAttempts: 2, baseDelay: 300, backoffFactor: 1.3, fuzzFactor: 0.2 }, useNativeHlsOnSafari: true }, manifest: { retryParameters: { timeout: 4000, maxAttempts: 2, baseDelay: 300, backoffFactor: 1.3, fuzzFactor: 0.2 }, dash: { clockSyncUri: '' } }, abr: { enabled: true, defaultBandwidthEstimate: 1500000, bandwidthUpgradeSeconds: 3, bandwidthDowngradeSeconds: 6 } });
      if (drmInfo && drmInfo.scheme === 'clearkey' && drmInfo.license && drmInfo.license.includes(':')) {
        const [keyId, key] = drmInfo.license.split(':');
        player.configure({ drm: { clearKeys: { [keyId]: key } } });
      }
      const onError = (event: any) => {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        const errorCode = event.detail.code;
        let errorMessage = `Stream error (${errorCode})`;
        if (errorCode >= 6000 && errorCode < 7000) errorMessage = 'Network error - please check your connection';
        else if (errorCode >= 4000 && errorCode < 5000) errorMessage = 'Media format not supported';
        else if (errorCode >= 1000 && errorCode < 2000) errorMessage = 'DRM error - content may be protected';
        setPlayerState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
        destroyPlayer();
      };
      player.addEventListener('error', onError);
      await player.load(url);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      const tracks = player.getVariantTracks();
      const qualities: QualityLevel[] = tracks.map(track => ({ height: track.height || 0, bitrate: Math.round(track.bandwidth / 1000), id: track.id }));
      const textTracks = player.getTextTracks();
      const subtitles: SubtitleTrack[] = textTracks.map(track => ({ id: track.id.toString(), label: track.label || track.language || 'Unknown', language: track.language || 'unknown' }));
      
      const audioTracks: AudioTrack[] = player.getAudioLanguagesAndRoles().map((audioInfo: any, index: number) => ({
        id: index,
        label: audioInfo.language || `Audio ${index + 1}`,
        language: audioInfo.language || 'unknown'
      }));
      
      video.muted = muted;
      if (autoPlay) video.play().catch(console.warn);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: null, availableQualities: qualities, availableSubtitles: subtitles, availableAudioTracks: audioTracks, currentQuality: -1, isMuted: video.muted, isPlaying: true, showControls: true }));
      startControlsTimer();
      return () => player.removeEventListener('error', onError);
    } catch (error) { throw error; }
  };

  const initNativePlayer = (url: string, video: HTMLVideoElement) => {
    video.src = url;
    const onLoadedMetadata = () => {
      if (!isMountedRef.current) return;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      video.muted = muted;
      if (autoPlay) video.play().catch(console.warn);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: null, isMuted: video.muted, isPlaying: true, showControls: true }));
      startControlsTimer();
    };
    const onError = () => {
      if (!isMountedRef.current) return;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Failed to load stream with native player' }));
    };
    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    video.addEventListener('error', onError, { once: true });
    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);
    };
  };

  const formatTime = (time: number): string => {
    if (!isFinite(time) || time <= 0) return "0:00";
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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
        if (targetTrack) shakaPlayerRef.current.selectVariantTrack(targetTrack, true);
      }
    }
    setPlayerState(prev => ({ ...prev, currentQuality: qualityId, showControls: true, showSettings: false }));
    setExpandedSettingItem(null);
    lastActivityRef.current = Date.now();
  }, []);

  const changeSubtitle = useCallback((subtitleId: string) => {
    if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
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
    setPlayerState(prev => ({ ...prev, currentSubtitle: subtitleId, showControls: true, showSettings: false }));
    setExpandedSettingItem(null);
    lastActivityRef.current = Date.now();
  }, []);

  const changeAudioTrack = useCallback((trackId: number) => {
    if (playerTypeRef.current === 'hls' && hlsRef.current) {
      hlsRef.current.audioTrack = trackId;
    } else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      const audioLanguages = shakaPlayerRef.current.getAudioLanguagesAndRoles();
      if (audioLanguages[trackId]) {
        shakaPlayerRef.current.selectAudioLanguage(audioLanguages[trackId].language);
      }
    }
    setPlayerState(prev => ({ ...prev, currentAudioTrack: trackId, showControls: true, showSettings: false }));
    setExpandedSettingItem(null);
    lastActivityRef.current = Date.now();
  }, []);

  const changePlaybackSpeed = useCallback((speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setPlayerState(prev => ({ ...prev, showControls: true, showSettings: false }));
    setExpandedSettingItem(null);
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
      controlsTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) setPlayerState(prev => ({ ...prev, showControls: false }));
      }, CONTROLS_HIDE_DELAY);
    }
  }, [playerState.isPlaying, playerState.showSettings]);
  
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
    const handlePlay = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isPlaying: true })); lastActivityRef.current = Date.now(); };
    const handlePause = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isPlaying: false })); lastActivityRef.current = Date.now(); };
    const handleWaiting = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isLoading: true })); };
    const handlePlaying = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isLoading: false, isPlaying: true })); lastActivityRef.current = Date.now(); };
    const handleTimeUpdate = () => { if (!isMountedRef.current || !video || playerState.isSeeking) return; const buffered = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0; setPlayerState(prev => ({ ...prev, currentTime: video.currentTime, duration: video.duration || 0, buffered: buffered })); };
    const handleVolumeChange = () => { if (!isMountedRef.current || !video) return; setPlayerState(prev => ({ ...prev, isMuted: video.muted })); };
    const handleEnterPip = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isPipActive: true })); };
    const handleLeavePip = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isPipActive: false })); };
    const handleFullscreenChange = () => { if (!isMountedRef.current) return; const isFullscreen = !!document.fullscreenElement; setPlayerState(prev => ({ ...prev, isFullscreen })); if (isFullscreen) resetControlsTimer(); };
    video.addEventListener('play', handlePlay); video.addEventListener('pause', handlePause); video.addEventListener('waiting', handleWaiting); video.addEventListener('playing', handlePlaying); video.addEventListener('timeupdate', handleTimeUpdate); video.addEventListener('volumechange', handleVolumeChange); video.addEventListener('enterpictureinpicture', handleEnterPip); video.addEventListener('leavepictureinpicture', handleLeavePip); document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => { video.removeEventListener('play', handlePlay); video.removeEventListener('pause', handlePause); video.removeEventListener('waiting', handleWaiting); video.removeEventListener('playing', handlePlaying); video.removeEventListener('timeupdate', handleTimeUpdate); video.removeEventListener('volumechange', handleVolumeChange); video.removeEventListener('enterpictureinpicture', handleEnterPip); video.removeEventListener('leavepictureinpicture', handleLeavePip); document.removeEventListener('fullscreenchange', handleFullscreenChange); };
  }, [playerState.isSeeking, resetControlsTimer]);

  useEffect(() => {
    if (!playerState.showSettings && playerState.isPlaying) {
      startControlsTimer();
    }
  }, [playerState.showSettings, playerState.isPlaying, startControlsTimer]);

  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window !== 'undefined' && window.screen?.orientation) {
        const type = window.screen.orientation.type;
        setIsLandscape(type.includes('landscape'));
      } else {
        setIsLandscape(window.innerWidth > window.innerHeight);
      }
    };
    
    checkOrientation();
    window.addEventListener('orientationchange', checkOrientation);
    window.addEventListener('resize', checkOrientation);
    
    return () => {
      window.removeEventListener('orientationchange', checkOrientation);
      window.removeEventListener('resize', checkOrientation);
    };
  }, []);

  const handleSheetTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    setSheetDragY(0);
  };

  const handleSheetTouchMove = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartYRef.current;
    if (deltaY > 0) {
      setSheetDragY(deltaY);
    }
  };

  const handleSheetTouchEnd = () => {
    if (sheetDragY > 100) {
      setPlayerState(prev => ({ ...prev, showSettings: false }));
      setExpandedSettingItem(null);
    }
    setSheetDragY(0);
    touchStartYRef.current = null;
  };

  const calculateNewTime = useCallback((clientX: number): number | null => {
    const video = videoRef.current; const progressBar = progressRef.current; if (!video || !progressBar || !isFinite(video.duration) || video.duration <= 0) return null; const rect = progressBar.getBoundingClientRect(); const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width)); const percentage = clickX / rect.width; return percentage * video.duration;
  }, []);
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); const video = videoRef.current; if (!video || !isFinite(video.duration) || video.duration <= 0) return; wasPlayingBeforeSeekRef.current = !video.paused; dragStartRef.current = { isDragging: true }; setPlayerState(prev => ({ ...prev, isSeeking: true, showControls: true })); video.pause(); lastActivityRef.current = Date.now();
  }, []);
  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current?.isDragging) return; const newTime = calculateNewTime(e.clientX); if (newTime !== null) { setPlayerState(prev => ({ ...prev, currentTime: newTime, showControls: true })); seekTimeRef.current = newTime; } lastActivityRef.current = Date.now();
  }, [calculateNewTime]);
  const handleDragEnd = useCallback(() => {
    if (!dragStartRef.current?.isDragging) return; const video = videoRef.current; if (video) { video.currentTime = seekTimeRef.current; if (wasPlayingBeforeSeekRef.current) video.play().catch(console.error); } dragStartRef.current = null; setPlayerState(prev => ({ ...prev, isSeeking: false, isPlaying: !video?.paused, showControls: true })); lastActivityRef.current = Date.now();
  }, []);
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const newTime = calculateNewTime(e.clientX); if (newTime !== null && videoRef.current) videoRef.current.currentTime = newTime; setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now();
  }, [calculateNewTime]);
  const togglePlay = useCallback(() => {
    const video = videoRef.current; if (!video) return; if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) { if (video.paused) shakaPlayerRef.current.play().catch(console.error); else shakaPlayerRef.current.pause(); } else { if (video.paused) video.play().catch(console.error); else video.pause(); } setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now();
  }, []);
  const toggleMute = useCallback(() => {
    const video = videoRef.current; 
    if (video) { 
      video.muted = !video.muted; 
      setPlayerState(prev => ({ ...prev, showControls: true })); 
      lastActivityRef.current = Date.now(); 
    }
  }, []);

  const handleVolumeChange = useCallback((newVolume: number) => {
    const video = videoRef.current;
    if (video) {
      video.volume = newVolume / 100;
      video.muted = newVolume === 0;
      setVolume(newVolume);
      setPlayerState(prev => ({ ...prev, isMuted: newVolume === 0, showControls: true }));
      lastActivityRef.current = Date.now();
    }
  }, []);

  const seekBackward = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = Math.max(0, video.currentTime - 10);
      setPlayerState(prev => ({ ...prev, showControls: true }));
      lastActivityRef.current = Date.now();
    }
  }, []);

  const seekForward = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = Math.min(video.duration, video.currentTime + 10);
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
        if (screen.orientation && 'unlock' in screen.orientation) {
          try {
            (screen.orientation as any).unlock();
          } catch (e) { }
        }
      } else {
        await container.requestFullscreen();
        if (screen.orientation && 'lock' in screen.orientation && isMobile) {
          try {
            await (screen.orientation as any).lock('landscape').catch(() => {});
          } catch (e) { }
        }
      }
    } catch (error) { }
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
  }, [isMobile]);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (error) { }
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

  const handleMouseMove = useCallback(() => {
    if (!playerState.showSettings) resetControlsTimer();
  }, [playerState.showSettings, resetControlsTimer]);

  const handlePlayerClick = useCallback(() => {
    if (playerState.showSettings) {
      setPlayerState(prev => ({ ...prev, showSettings: false }));
      setExpandedSettingItem(null);
    } else {
      if (playerState.showControls) {
        setPlayerState(prev => ({ ...prev, showControls: false }));
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      } else {
        resetControlsTimer();
      }
    }
  }, [playerState.showSettings, playerState.showControls, resetControlsTimer]);

  const handleSettingsToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPlayerState(prev => {
      const newShowSettings = !prev.showSettings;
      if (!newShowSettings) {
        setExpandedSettingItem(null);
      }
      return { ...prev, showSettings: newShowSettings, showControls: true };
    });
    lastActivityRef.current = Date.now();
  };

  const handleSettingClick = (setting: string) => {
    setExpandedSettingItem(expandedSettingItem === setting ? null : setting);
  };

  const getCurrentQualityLabel = () => {
    if (playerState.currentQuality === -1) return '720p';
    const quality = playerState.availableQualities.find(q => q.id === playerState.currentQuality);
    return quality ? `${quality.height}p` : '720p';
  };

  const getCurrentSpeedLabel = () => {
    const speed = videoRef.current?.playbackRate || 1;
    return speed === 1 ? 'Normal' : `${speed}`;
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (dragStartRef.current?.isDragging) handleDragMove(e);
    };
    const handleGlobalMouseUp = () => {
      if (dragStartRef.current?.isDragging) handleDragEnd();
    };
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [handleDragMove, handleDragEnd]);

  const currentTimePercentage = isFinite(playerState.duration) && playerState.duration > 0 ? (playerState.currentTime / playerState.duration) * 100 : 0;

  const getControlSizes = () => {
    const isFullscreenLandscape = playerState.isFullscreen && isLandscape;
    const isMobileLandscape = isMobile && isLandscape;
    const isMobilePortrait = isMobile && !isLandscape;
    
    if (isFullscreenLandscape) {
      return {
        iconSmall: 28,
        iconMedium: 32,
        iconLarge: 36,
        centerButtonClass: 'w-24 h-24',
        centerIcon: 40,
        paddingClass: 'p-4',
        gapClass: 'gap-4',
        textClass: 'text-lg',
        progressBarClass: 'h-2',
        progressThumbClass: 'w-5 h-5',
        containerPaddingClass: 'p-6'
      };
    }
    
    if (isMobileLandscape) {
      return {
        iconSmall: 22,
        iconMedium: 26,
        iconLarge: 28,
        centerButtonClass: 'w-20 h-20',
        centerIcon: 32,
        paddingClass: 'p-3',
        gapClass: 'gap-3',
        textClass: 'text-base',
        progressBarClass: 'h-1.5',
        progressThumbClass: 'w-4 h-4',
        containerPaddingClass: 'p-4'
      };
    }
    
    if (isMobilePortrait) {
      return {
        iconSmall: 18,
        iconMedium: 22,
        iconLarge: 24,
        centerButtonClass: 'w-16 h-16',
        centerIcon: 28,
        paddingClass: 'p-2',
        gapClass: 'gap-2',
        textClass: 'text-sm',
        progressBarClass: 'h-1',
        progressThumbClass: 'w-3 h-3',
        containerPaddingClass: 'p-3'
      };
    }
    
    return {
      iconSmall: 20,
      iconMedium: 24,
      iconLarge: 26,
      centerButtonClass: 'w-16 h-16',
      centerIcon: 28,
      paddingClass: 'p-2',
      gapClass: 'gap-3',
      textClass: 'text-sm',
      progressBarClass: 'h-1',
      progressThumbClass: 'w-3 h-3',
      containerPaddingClass: 'p-4'
    };
  };

  const sizes = getControlSizes();

  return (
    <div ref={containerRef} className={`relative bg-black w-full h-full ${className}`} onMouseMove={handleMouseMove} onClick={handlePlayerClick}>
      <video ref={videoRef} className="w-full h-full object-contain" playsInline controls={false} />
      
      {playerState.isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
            <div className={`${sizes.textClass}`}>Loading stream...</div>
          </div>
        </div>
      )}
      
      {playerState.error && (
        <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4">
          <div className="text-center text-white max-w-md">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold mb-2">Playback Error</h3>
            <p className={`text-gray-300 mb-4 ${sizes.textClass}`}>{playerState.error}</p>
            <button onClick={handleRetry} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 mx-auto transition-colors">
              <RotateCcw size={16} />
              Retry
            </button>
          </div>
        </div>
      )}
      
      <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity duration-300 ${playerState.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {isMobile && (
          <div className="absolute top-4 right-4 z-10">
            <button 
              onClick={handleSettingsToggle}
              className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass} bg-black/50 backdrop-blur-sm rounded-full`}
              data-testid="button-settings-mobile"
            >
              <Settings size={sizes.iconSmall} />
            </button>
          </div>
        )}

        {!playerState.isLoading && !playerState.error && playerState.showControls && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button 
              onClick={(e) => { e.stopPropagation(); togglePlay(); }} 
              className={`${sizes.centerButtonClass} bg-white bg-opacity-20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-opacity-30 transition-all pointer-events-auto`}
              data-testid="button-play-pause-center"
            >
              {playerState.isPlaying ? (
                <Pause size={sizes.centerIcon} fill="white" />
              ) : (
                <Play size={sizes.centerIcon} fill="white" className="ml-1" />
              )}
            </button>
          </div>
        )}
        
        <div className={`absolute bottom-0 left-0 right-0 ${sizes.containerPaddingClass}`}>
          <div className="mb-2 md:mb-3">
            <div ref={progressRef} className="relative h-2 py-2 -my-2 bg-transparent cursor-pointer group" onClick={handleProgressClick}>
              <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 ${sizes.progressBarClass} bg-white bg-opacity-30 rounded-full`}>
                <div className="absolute top-0 left-0 h-full bg-white bg-opacity-50 rounded-full" style={{ width: isFinite(playerState.duration) && playerState.duration > 0 ? `${(playerState.buffered / playerState.duration) * 100}%` : '0%' }}/>
                <div className="absolute top-0 left-0 h-full bg-red-500 rounded-full" style={{ width: `${currentTimePercentage}%` }}/>
                <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 ${sizes.progressThumbClass} rounded-full bg-red-500 transition-all duration-150 ease-out ${playerState.isSeeking ? 'scale-150' : 'group-hover:scale-150'}`} style={{ left: `${currentTimePercentage}%` }} onMouseDown={handleDragStart} onClick={(e) => e.stopPropagation()}/>
              </div>
            </div>
          </div>
          
          <div className={`flex items-center ${sizes.gapClass}`}>
            {!isMobile && (
              <div className={`flex items-center ${sizes.gapClass} flex-1`}>
              <div className="flex items-center gap-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleMute(); }} 
                  className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass}`}
                  data-testid="button-volume"
                >
                  {playerState.isMuted ? <VolumeX size={sizes.iconSmall} /> : volume > 50 ? <Volume2 size={sizes.iconSmall} /> : <Volume1 size={sizes.iconSmall} />}
                </button>
                
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className={`w-24 ${sizes.progressBarClass} bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:${sizes.progressThumbClass} [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:${sizes.progressThumbClass} [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0`}
                  data-testid="slider-volume"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              
              {isFinite(playerState.duration) && playerState.duration > 0 && (
                <div className={`text-white ${sizes.textClass} whitespace-nowrap`} data-testid="text-time">
                  {formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}
                </div>
              )}
              
              <button 
                onClick={(e) => { e.stopPropagation(); seekBackward(); }} 
                className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass}`}
                title="Seek backward 10s"
                data-testid="button-rewind"
              >
                <Rewind size={sizes.iconSmall} />
              </button>
              
              <button 
                onClick={(e) => { e.stopPropagation(); togglePlay(); }} 
                className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass}`}
                data-testid="button-play-pause"
              >
                {playerState.isPlaying ? <Pause size={sizes.iconMedium} /> : <Play size={sizes.iconMedium} />}
              </button>
              
              <button 
                onClick={(e) => { e.stopPropagation(); seekForward(); }} 
                className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass}`}
                title="Seek forward 10s"
                data-testid="button-forward"
              >
                <FastForward size={sizes.iconSmall} />
              </button>
              
              <div className="flex-1"></div>
              
              {document.pictureInPictureEnabled && (
                <button 
                  onClick={(e) => { e.stopPropagation(); togglePip(); }} 
                  className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass}`}
                  title="Picture-in-picture"
                  data-testid="button-pip"
                >
                  <PictureInPicture2 size={sizes.iconSmall} />
                </button>
              )}
              
              <button 
                onClick={handleSettingsToggle}
                className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass}`}
                title="Settings"
                data-testid="button-settings"
              >
                <Settings size={sizes.iconSmall} />
              </button>
              
              <button 
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} 
                className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass}`}
                title="Fullscreen"
                data-testid="button-fullscreen"
              >
                {playerState.isFullscreen ? <Minimize size={sizes.iconSmall} /> : <Maximize size={sizes.iconSmall} />}
              </button>
              </div>
            )}
            
            {isMobile && (
              <div className={`flex items-center ${sizes.gapClass} flex-1`}>
              <button 
                onClick={(e) => { e.stopPropagation(); toggleMute(); }} 
                className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass}`}
                data-testid="button-volume-mobile"
              >
                {playerState.isMuted ? <VolumeX size={sizes.iconSmall} /> : <Volume2 size={sizes.iconSmall} />}
              </button>
              
              {isFinite(playerState.duration) && playerState.duration > 0 && (
                <div className={`text-white ${sizes.textClass} whitespace-nowrap`} data-testid="text-time-mobile">
                  {formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}
                </div>
              )}
              
              <button 
                onClick={(e) => { e.stopPropagation(); seekBackward(); }} 
                className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass}`}
                data-testid="button-rewind-mobile"
              >
                <Rewind size={sizes.iconSmall} />
              </button>
              
              <button 
                onClick={(e) => { e.stopPropagation(); togglePlay(); }} 
                className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass}`}
                data-testid="button-play-pause-mobile"
              >
                {playerState.isPlaying ? <Pause size={sizes.iconMedium} /> : <Play size={sizes.iconMedium} />}
              </button>
              
              <button 
                onClick={(e) => { e.stopPropagation(); seekForward(); }} 
                className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass}`}
                data-testid="button-forward-mobile"
              >
                <FastForward size={sizes.iconSmall} />
              </button>
              
              <div className="flex-1"></div>
              
              {document.pictureInPictureEnabled && (
                <button 
                  onClick={(e) => { e.stopPropagation(); togglePip(); }} 
                  className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass}`}
                  title="Picture-in-picture"
                  data-testid="button-pip-mobile"
                >
                  <PictureInPicture2 size={sizes.iconSmall} />
                </button>
              )}
              
              <button 
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} 
                className={`text-white hover:text-blue-300 transition-colors ${sizes.paddingClass}`}
                data-testid="button-fullscreen-mobile"
              >
                {playerState.isFullscreen ? <Minimize size={sizes.iconSmall} /> : <Maximize size={sizes.iconSmall} />}
              </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings Overlay - Desktop Only */}
      {playerState.showSettings && !isMobile && (
        <>
          <div 
            className="absolute inset-0 bg-black/40 z-40"
            onClick={handleSettingsToggle}
          />
          
          <div 
            className="absolute z-50 bg-black/90 backdrop-blur-md rounded-lg bottom-20 right-4 w-[280px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="py-2">
              {!expandedSettingItem ? (
                <>
                  {playerState.availableQualities.length > 0 && (
                    <button
                      onClick={() => handleSettingClick('quality')}
                      className="w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Settings size={18} />
                        <span className="text-sm">Quality</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/70">{getCurrentQualityLabel()}</span>
                        <ChevronRight size={16} className="text-white/70" />
                      </div>
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleSettingClick('speed')}
                    className="w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Play size={18} />
                      <span className="text-sm">Playback speed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/70">{getCurrentSpeedLabel()}</span>
                      <ChevronRight size={16} className="text-white/70" />
                    </div>
                  </button>
                  
                  <button
                    onClick={() => handleSettingClick('more')}
                    className="w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Settings size={18} />
                      <span className="text-sm">More</span>
                    </div>
                    <ChevronRight size={16} className="text-white/70" />
                  </button>
                </>
              ) : expandedSettingItem === 'quality' ? (
                <div>
                  <button
                    onClick={() => setExpandedSettingItem(null)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-white"
                  >
                    <ChevronRight size={18} className="rotate-180" />
                    <span className="text-sm">Quality</span>
                  </button>
                  <button
                    onClick={() => { changeQuality(-1); }}
                    className={`w-full text-left px-12 py-2 text-sm text-white transition-colors ${
                      playerState.currentQuality === -1 ? 'bg-white/20' : 'hover:bg-white/10'
                    }`}
                  >
                    Auto
                  </button>
                  {playerState.availableQualities.map((quality) => (
                    <button
                      key={quality.id}
                      onClick={() => { changeQuality(quality.id); }}
                      className={`w-full text-left px-12 py-2 text-sm text-white transition-colors ${
                        playerState.currentQuality === quality.id ? 'bg-white/20' : 'hover:bg-white/10'
                      }`}
                    >
                      {quality.height}p
                    </button>
                  ))}
                </div>
              ) : expandedSettingItem === 'speed' ? (
                <div>
                  <button
                    onClick={() => setExpandedSettingItem(null)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-white"
                  >
                    <ChevronRight size={18} className="rotate-180" />
                    <span className="text-sm">Playback speed</span>
                  </button>
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => (
                    <button
                      key={speed}
                      onClick={() => { changePlaybackSpeed(speed); }}
                      className={`w-full text-left px-12 py-2 text-sm text-white transition-colors ${
                        videoRef.current?.playbackRate === speed ? 'bg-white/20' : 'hover:bg-white/10'
                      }`}
                    >
                      {speed === 1 ? 'Normal' : `${speed}`}
                    </button>
                  ))}
                </div>
              ) : expandedSettingItem === 'more' ? (
                <div>
                  <button
                    onClick={() => setExpandedSettingItem(null)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-white"
                  >
                    <ChevronRight size={18} className="rotate-180" />
                    <span className="text-sm">More</span>
                  </button>
                  
                  {playerState.availableSubtitles.length > 0 && (
                    <button
                      onClick={() => handleSettingClick('captions')}
                      className="w-full flex items-center justify-between px-12 py-2 text-sm text-white hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Subtitles size={16} />
                        <span>Captions</span>
                      </div>
                      <ChevronRight size={14} className="text-white/70" />
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleSettingClick('audio')}
                    className="w-full flex items-center justify-between px-12 py-2 text-sm text-white hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Music size={16} />
                      <span>Audio</span>
                    </div>
                    <ChevronRight size={14} className="text-white/70" />
                  </button>
                </div>
              ) : expandedSettingItem === 'captions' ? (
                <div>
                  <button
                    onClick={() => handleSettingClick('more')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-white"
                  >
                    <ChevronRight size={18} className="rotate-180" />
                    <span className="text-sm">Captions</span>
                  </button>
                  <button
                    onClick={() => { changeSubtitle(''); }}
                    className={`w-full text-left px-12 py-2 text-sm text-white transition-colors ${
                      playerState.currentSubtitle === '' ? 'bg-white/20' : 'hover:bg-white/10'
                    }`}
                  >
                    Off
                  </button>
                  {playerState.availableSubtitles.map((subtitle) => (
                    <button
                      key={subtitle.id}
                      onClick={() => { changeSubtitle(subtitle.id); }}
                      className={`w-full text-left px-12 py-2 text-sm text-white transition-colors ${
                        playerState.currentSubtitle === subtitle.id ? 'bg-white/20' : 'hover:bg-white/10'
                      }`}
                    >
                      {subtitle.label}
                    </button>
                  ))}
                </div>
              ) : expandedSettingItem === 'audio' ? (
                <div>
                  <button
                    onClick={() => handleSettingClick('more')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-white"
                  >
                    <ChevronRight size={18} className="rotate-180" />
                    <span className="text-sm">Audio</span>
                  </button>
                  {playerState.availableAudioTracks.length > 0 ? (
                    playerState.availableAudioTracks.map((audioTrack) => (
                      <button
                        key={audioTrack.id}
                        onClick={() => { changeAudioTrack(audioTrack.id); }}
                        className={`w-full text-left px-12 py-2 text-sm text-white transition-colors ${
                          playerState.currentAudioTrack === audioTrack.id ? 'bg-white/20' : 'hover:bg-white/10'
                        }`}
                      >
                        {audioTrack.label}
                      </button>
                    ))
                  ) : (
                    <div className="px-12 py-2 text-xs text-white/50">
                      No audio tracks available
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
      
      {/* Settings Overlay - Mobile */}
      {playerState.showSettings && isMobile && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            style={{ backgroundColor: 'rgba(15, 15, 15, 0.92)' }}
            onClick={handleSettingsToggle}
          />
          
          {isLandscape ? (
            <div 
              className="fixed z-50 bg-[#212121] bottom-0 left-0 right-0 rounded-t-[18px]"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
              style={{ transform: `translateY(${sheetDragY}px)` }}
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-white/30 rounded-full" />
              </div>
              
              <div className="overflow-y-auto pb-4" style={{ maxHeight: '70vh' }}>
                {!expandedSettingItem ? (
                  <>
                    {playerState.availableQualities.length > 0 && (
                      <button
                        onClick={() => handleSettingClick('quality')}
                        className="w-full flex items-center justify-between px-8 py-4 text-white hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <Settings size={20} />
                          <span style={{ fontSize: '15px', fontWeight: 400 }}>Quality</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                            {playerState.currentQuality === -1 ? 'Auto' : ''} ({getCurrentQualityLabel()})
                          </span>
                          <ChevronRight size={16} className="text-white/70" />
                        </div>
                      </button>
                    )}
                    
                    {playerState.availableSubtitles.length > 0 && (
                      <button
                        onClick={() => handleSettingClick('captions')}
                        className="w-full flex items-center justify-between px-8 py-4 text-white hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <Subtitles size={20} />
                          <span style={{ fontSize: '15px', fontWeight: 400 }}>Subtitles</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                            {playerState.currentSubtitle === '' ? 'Off' : playerState.availableSubtitles.find(s => s.id === playerState.currentSubtitle)?.label || 'Off'}
                          </span>
                          <ChevronRight size={16} className="text-white/70" />
                        </div>
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleSettingClick('audio')}
                      className="w-full flex items-center justify-between px-8 py-4 text-white hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <Music size={20} />
                        <span style={{ fontSize: '15px', fontWeight: 400 }}>Audio</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                          {playerState.availableAudioTracks.length > 0 
                            ? playerState.availableAudioTracks.find(a => a.id === playerState.currentAudioTrack)?.label || 'Default'
                            : 'Default'}
                        </span>
                        <ChevronRight size={16} className="text-white/70" />
                      </div>
                    </button>
                    
                    <button
                      onClick={() => handleSettingClick('speed')}
                      className="w-full flex items-center justify-between px-8 py-4 text-white hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <Play size={20} />
                        <span style={{ fontSize: '15px', fontWeight: 400 }}>Playback speed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                          {getCurrentSpeedLabel()}
                        </span>
                        <ChevronRight size={16} className="text-white/70" />
                      </div>
                    </button>
                  </>
                ) : expandedSettingItem === 'quality' ? (
                  <div className="px-4">
                    <button
                      onClick={() => setExpandedSettingItem(null)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-white"
                    >
                      <ChevronRight size={18} className="rotate-180" />
                      <span className="text-sm">Quality</span>
                    </button>
                    <button
                      onClick={() => { changeQuality(-1); }}
                      className={`w-full text-left px-12 py-2 text-sm text-white transition-colors ${
                        playerState.currentQuality === -1 ? 'bg-white/20' : 'hover:bg-white/10'
                      }`}
                    >
                      Auto
                    </button>
                    {playerState.availableQualities.map((quality) => (
                      <button
                        key={quality.id}
                        onClick={() => { changeQuality(quality.id); }}
                        className={`w-full text-left px-12 py-2 text-sm text-white transition-colors ${
                          playerState.currentQuality === quality.id ? 'bg-white/20' : 'hover:bg-white/10'
                        }`}
                      >
                        {quality.height}p
                      </button>
                    ))}
                  </div>
                ) : expandedSettingItem === 'speed' ? (
                  <div className="px-4">
                    <button
                      onClick={() => setExpandedSettingItem(null)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-white"
                    >
                      <ChevronRight size={18} className="rotate-180" />
                      <span className="text-sm">Playback speed</span>
                    </button>
                    {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => (
                      <button
                        key={speed}
                        onClick={() => { changePlaybackSpeed(speed); }}
                        className={`w-full text-left px-12 py-2 text-sm text-white transition-colors ${
                          videoRef.current?.playbackRate === speed ? 'bg-white/20' : 'hover:bg-white/10'
                        }`}
                      >
                        {speed === 1 ? 'Normal' : `${speed}`}
                      </button>
                    ))}
                  </div>
                ) : expandedSettingItem === 'captions' ? (
                  <div className="px-4">
                    <button
                      onClick={() => setExpandedSettingItem(null)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-white"
                    >
                      <ChevronRight size={18} className="rotate-180" />
                      <span className="text-sm">Captions</span>
                    </button>
                    <button
                      onClick={() => { changeSubtitle(''); }}
                      className={`w-full text-left px-12 py-2 text-sm text-white transition-colors ${
                        playerState.currentSubtitle === '' ? 'bg-white/20' : 'hover:bg-white/10'
                      }`}
                    >
                      Off
                    </button>
                    {playerState.availableSubtitles.map((subtitle) => (
                      <button
                        key={subtitle.id}
                        onClick={() => { changeSubtitle(subtitle.id); }}
                        className={`w-full text-left px-12 py-2 text-sm text-white transition-colors ${
                          playerState.currentSubtitle === subtitle.id ? 'bg-white/20' : 'hover:bg-white/10'
                        }`}
                      >
                        {subtitle.label}
                      </button>
                    ))}
                  </div>
                ) : expandedSettingItem === 'audio' ? (
                  <div className="px-4">
                    <button
                      onClick={() => setExpandedSettingItem(null)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-white"
                    >
                      <ChevronRight size={18} className="rotate-180" />
                      <span className="text-sm">Audio</span>
                    </button>
                    {playerState.availableAudioTracks.length > 0 ? (
                      playerState.availableAudioTracks.map((audioTrack) => (
                        <button
                          key={audioTrack.id}
                          onClick={() => { changeAudioTrack(audioTrack.id); }}
                          className={`w-full text-left px-12 py-2 text-sm text-white transition-colors ${
                            playerState.currentAudioTrack === audioTrack.id ? 'bg-white/20' : 'hover:bg-white/10'
                          }`}
                        >
                          {audioTrack.label}
                        </button>
                      ))
                    ) : (
                      <div className="px-12 py-2 text-xs text-white/50">
                        No audio tracks available
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div 
              className="fixed z-50 bg-[#212121] bottom-0 left-0 right-0 rounded-t-[18px]"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
              style={{ maxHeight: '60vh', transform: `translateY(${sheetDragY}px)` }}
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-white/30 rounded-full" />
              </div>
              
              <div className="overflow-y-auto pb-4" style={{ maxHeight: '50vh' }}>
                {!expandedSettingItem ? (
                  <>
                    {playerState.availableQualities.length > 0 && (
                      <button
                        onClick={() => handleSettingClick('quality')}
                        className="w-full flex items-center justify-between px-8 py-4 text-white hover:bg-white/10 transition-colors"
                        style={{ minHeight: '56px' }}
                      >
                        <div className="flex items-center gap-4">
                          <Settings size={20} />
                          <span style={{ fontSize: '15px', fontWeight: 500 }}>Quality</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                            {getCurrentQualityLabel()}
                          </span>
                          <ChevronRight size={16} className="text-white/70" />
                        </div>
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleSettingClick('speed')}
                      className="w-full flex items-center justify-between px-8 py-4 text-white hover:bg-white/10 transition-colors"
                      style={{ minHeight: '56px' }}
                    >
                      <div className="flex items-center gap-4">
                        <Play size={20} />
                        <span style={{ fontSize: '15px', fontWeight: 500 }}>Playback speed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                          {getCurrentSpeedLabel()}
                        </span>
                        <ChevronRight size={16} className="text-white/70" />
                      </div>
                    </button>
                    
                    {playerState.availableSubtitles.length > 0 && (
                      <button
                        onClick={() => handleSettingClick('captions')}
                        className="w-full flex items-center justify-between px-8 py-4 text-white hover:bg-white/10 transition-colors"
                        style={{ minHeight: '56px' }}
                      >
                        <div className="flex items-center gap-4">
                          <Subtitles size={20} />
                          <span style={{ fontSize: '15px', fontWeight: 500 }}>Captions</span>
                        </div>
                        <ChevronRight size={16} className="text-white/70" />
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleSettingClick('audio')}
                      className="w-full flex items-center justify-between px-8 py-4 text-white hover:bg-white/10 transition-colors"
                      style={{ minHeight: '56px' }}
                    >
                      <div className="flex items-center gap-4">
                        <Music size={20} />
                        <span style={{ fontSize: '15px', fontWeight: 500 }}>Audio</span>
                      </div>
                      <ChevronRight size={16} className="text-white/70" />
                    </button>
                  </>
                ) : expandedSettingItem === 'quality' ? (
                  <div className="px-4">
                    <button
                      onClick={() => setExpandedSettingItem(null)}
                      className="w-full flex items-center gap-4 px-4 py-4 text-white"
                    >
                      <ChevronRight size={20} className="rotate-180" />
                      <span style={{ fontSize: '15px', fontWeight: 500 }}>Quality</span>
                    </button>
                    <button
                      onClick={() => { changeQuality(-1); }}
                      className={`w-full text-left px-14 py-3 text-white transition-colors ${
                        playerState.currentQuality === -1 ? 'bg-white/20' : 'hover:bg-white/10'
                      }`}
                      style={{ fontSize: '15px', fontWeight: 400 }}
                    >
                      Auto
                    </button>
                    {playerState.availableQualities.map((quality) => (
                      <button
                        key={quality.id}
                        onClick={() => { changeQuality(quality.id); }}
                        className={`w-full text-left px-14 py-3 text-white transition-colors ${
                          playerState.currentQuality === quality.id ? 'bg-white/20' : 'hover:bg-white/10'
                        }`}
                        style={{ fontSize: '15px', fontWeight: 400 }}
                      >
                        {quality.height}p
                      </button>
                    ))}
                  </div>
                ) : expandedSettingItem === 'speed' ? (
                  <div className="px-4">
                    <button
                      onClick={() => setExpandedSettingItem(null)}
                      className="w-full flex items-center gap-4 px-4 py-4 text-white"
                    >
                      <ChevronRight size={20} className="rotate-180" />
                      <span style={{ fontSize: '15px', fontWeight: 500 }}>Playback speed</span>
                    </button>
                    {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => (
                      <button
                        key={speed}
                        onClick={() => { changePlaybackSpeed(speed); }}
                        className={`w-full text-left px-14 py-3 text-white transition-colors ${
                          videoRef.current?.playbackRate === speed ? 'bg-white/20' : 'hover:bg-white/10'
                        }`}
                        style={{ fontSize: '15px', fontWeight: 400 }}
                      >
                        {speed === 1 ? 'Normal' : `${speed}`}
                      </button>
                    ))}
                  </div>
                ) : expandedSettingItem === 'captions' ? (
                  <div className="px-4">
                    <button
                      onClick={() => setExpandedSettingItem(null)}
                      className="w-full flex items-center gap-4 px-4 py-4 text-white"
                    >
                      <ChevronRight size={20} className="rotate-180" />
                      <span style={{ fontSize: '15px', fontWeight: 500 }}>Captions</span>
                    </button>
                    <button
                      onClick={() => { changeSubtitle(''); }}
                      className={`w-full text-left px-14 py-3 text-white transition-colors ${
                        playerState.currentSubtitle === '' ? 'bg-white/20' : 'hover:bg-white/10'
                      }`}
                      style={{ fontSize: '15px', fontWeight: 400 }}
                    >
                      Off
                    </button>
                    {playerState.availableSubtitles.map((subtitle) => (
                      <button
                        key={subtitle.id}
                        onClick={() => { changeSubtitle(subtitle.id); }}
                        className={`w-full text-left px-14 py-3 text-white transition-colors ${
                          playerState.currentSubtitle === subtitle.id ? 'bg-white/20' : 'hover:bg-white/10'
                        }`}
                        style={{ fontSize: '15px', fontWeight: 400 }}
                      >
                        {subtitle.label}
                      </button>
                    ))}
                  </div>
                ) : expandedSettingItem === 'audio' ? (
                  <div className="px-4">
                    <button
                      onClick={() => setExpandedSettingItem(null)}
                      className="w-full flex items-center gap-4 px-4 py-4 text-white"
                    >
                      <ChevronRight size={20} className="rotate-180" />
                      <span style={{ fontSize: '15px', fontWeight: 500 }}>Audio</span>
                    </button>
                    {playerState.availableAudioTracks.length > 0 ? (
                      playerState.availableAudioTracks.map((audioTrack) => (
                        <button
                          key={audioTrack.id}
                          onClick={() => { changeAudioTrack(audioTrack.id); }}
                          className={`w-full text-left px-14 py-3 text-white transition-colors ${
                            playerState.currentAudioTrack === audioTrack.id ? 'bg-white/20' : 'hover:bg-white/10'
                          }`}
                          style={{ fontSize: '15px', fontWeight: 400 }}
                        >
                          {audioTrack.label}
                        </button>
                      ))
                    ) : (
                      <div className="px-14 py-3 text-white/50" style={{ fontSize: '14px' }}>
                        No audio tracks available
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VideoPlayer;
