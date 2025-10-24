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
const CONTROLS_HIDE_DELAY = 4000; // Increased to 4 seconds

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
  const lastActivityRef = useRef<number>(Date.now());
  const isMountedRef = useRef(true);
  const dragStartRef = useRef<{ isDragging: boolean }>({ isDragging: false });
  const seekTimeRef = useRef<number>(0);
  const wasPlayingBeforeSeekRef = useRef<boolean>(false);

  const [playerState, setPlayerState] = useState({
    isPlaying: false,
    isMuted: muted,
    volume: 100,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    showControls: false, // Initially hidden
    isLoading: true,
    error: null as string | null,
    availableQualities: [] as QualityLevel[],
    availableSubtitles: [] as SubtitleTrack[],
    availableAudioTracks: [] as AudioTrack[],
    currentQuality: -1, // -1 for auto
    currentSubtitle: '', // '' for off
    currentAudioTrack: -1, // -1 for default
    isFullscreen: false,
    isPipActive: false,
    showSettings: false,
    isSeeking: false,
  });

  const isMobile = useIsMobile();

  const resetControlsTimer = useCallback(() => {
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
    // Clear any existing timeout
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    // Set new timeout to hide controls
    controlsTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setPlayerState(prev => ({ ...prev, showControls: false }));
      }
    }, CONTROLS_HIDE_DELAY);
  }, []);

  const startControlsTimer = useCallback(() => {
    // Clear any existing timeout
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    // Set new timeout to hide controls
    controlsTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && playerState.isPlaying && !playerState.showSettings) {
        setPlayerState(prev => ({ ...prev, showControls: false }));
      }
    }, CONTROLS_HIDE_DELAY);
  }, [playerState.isPlaying, playerState.showSettings]);

  // Ensure timer restarts when playing state or settings change
  useEffect(() => {
    if (playerState.isPlaying && !playerState.showSettings) {
      startControlsTimer();
    } else {
      // Clear timer if not playing or settings are open
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    }
  }, [playerState.isPlaying, playerState.showSettings, startControlsTimer]);

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
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    playerTypeRef.current = null;
  }, []);

  const detectStreamType = (url: string) => {
    const lowerUrl = url.toLowerCase();
    let cleanUrl = url;
    let drmInfo = null;

    const drmMatch = lowerUrl.match(/#(clearkey|other_scheme):(.+)/i);
    if (drmMatch) {
      const scheme = drmMatch[1].toLowerCase();
      const license = drmMatch[2];
      cleanUrl = url.split('#')[0]; // Remove DRM part from URL
      drmInfo = { scheme, license };
    }

    if (lowerUrl.includes('.mpd') || lowerUrl.includes('format=mpd')) {
      return { type: 'dash', cleanUrl, drmInfo };
    } else if (lowerUrl.includes('.m3u8') || lowerUrl.includes('format=m3u8')) {
      return { type: 'hls', cleanUrl, drmInfo };
    } else {
      return { type: 'native', cleanUrl, drmInfo };
    }
  };

  const initializePlayer = useCallback(async () => {
    if (!streamUrl || !videoRef.current) {
      setPlayerState(prev => ({ ...prev, error: 'No stream URL provided', isLoading: false, showControls: false })); // Hide controls on error
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
      showControls: true // Show controls initially during load
    }));

    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          error: "Stream took too long to load. Please try again.",
          showControls: false // Hide controls on timeout error
        }));
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize player';
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        showControls: false // Hide controls on initialization error
      }));
      destroyPlayer();
    }
  }, [streamUrl, destroyPlayer]);

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

      player.configure({
        streaming: {
          bufferingGoal: 15,
          rebufferingGoal: 8,
          bufferBehind: 15,
          retryParameters: {
            timeout: 4000,
            maxAttempts: 2,
            baseDelay: 300,
            backoffFactor: 1.3,
            fuzzFactor: 0.2,
          },
          useNativeHlsOnSafari: true,
        },
        manifest: {
          retryParameters: {
            timeout: 4000,
            maxAttempts: 2,
            baseDelay: 300,
            backoffFactor: 1.3,
            fuzzFactor: 0.2,
          },
          dash: {
            clockSyncUri: '' // Optional, for live streams
          }
        },
        abr: {
          enabled: true,
          defaultBandwidthEstimate: 1500000,
          bandwidthUpgradeSeconds: 3,
          bandwidthDowngradeSeconds: 6
        }
      });

      if (drmInfo && drmInfo.scheme === 'clearkey' && drmInfo.license && drmInfo.license.includes(':')) {
        const [keyId, key] = drmInfo.license.split(':');
        // Shaka expects base64 encoded keys for clearkey
        // Ensure keyId and key are properly base64 encoded if they aren't already
        player.configure({
          drm: {
            clearKeys: { [keyId]: key }
          }
        });
      }

      const onError = (event: any) => {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        const errorCode = event.detail?.code; // Access code safely
        let errorMessage = `Stream error (${errorCode || 'unknown'})`;
        if (errorCode >= 6000 && errorCode < 7000) errorMessage = 'Network error - please check your connection';
        else if (errorCode >= 4000 && errorCode < 5000) errorMessage = 'Media format not supported';
        else if (errorCode >= 1000 && errorCode < 2000) errorMessage = 'DRM error - content may be protected';
        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
          showControls: false // Hide controls on stream error
        }));
        destroyPlayer();
      };

      player.addEventListener('error', onError);

      try {
        await player.load(url); // Await the load promise
        const textTracks = player.getTextTracks();
        const subtitles: SubtitleTrack[] = textTracks.map((track: any) => ({
          id: track.id.toString(),
          label: track.label || track.language || 'Unknown',
          language: track.language || 'unknown'
        }));

        // @ts-expect-error - Shaka API for audio tracks
        const audioTracks = player.getAudioLanguagesAndRoles().map((audioInfo: any, index: number) => ({
          id: index,
          label: audioInfo.language || `Audio ${index + 1}`,
          language: audioInfo.language || 'unknown'
        }));

        video.muted = muted;
        if (autoPlay) video.play().catch(console.warn);

        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          error: null,
          availableQualities: player.getVariantTracks().map((t: any) => ({ height: t.height, bitrate: t.bandwidth, id: t.id })),
          availableSubtitles: subtitles,
          availableAudioTracks: audioTracks,
          currentQuality: -1, // Default to auto
          isMuted: video.muted,
          isPlaying: true,
          showControls: true // Show controls after successful load
        }));
        startControlsTimer(); // Start the hide timer after successful load

        // Return a function to remove the error listener when needed (e.g., on destroy)
        return () => player.removeEventListener('error', onError);
      } catch (loadError) {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        console.error("Shaka Player load failed:", loadError);
        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          error: `Failed to load MPD: ${loadError.message || 'Unknown error'}`,
          showControls: false // Hide controls on load failure
        }));
        destroyPlayer();
        return; // Exit function early on load failure
      }

    } catch (error) {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize Shaka Player';
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        showControls: false // Hide controls on initialization error
      }));
      destroyPlayer();
    }
  };

  const initHlsPlayer = async (url: string, video: HTMLVideoElement) => {
    try {
      const Hls = (await import('hls.js')).default;
      if (!Hls.isSupported()) {
        throw new Error('HLS is not supported in this browser');
      }

      if (hlsRef.current) hlsRef.current.destroy();

      const hls = new Hls({
        enableWorker: true,
        debug: false,
        capLevelToPlayerSize: true,
        maxLoadingDelay: 1,
        maxBufferLength: 15,
        maxBufferSize: 20 * 1000 * 1000,
        fragLoadingTimeOut: 8000,
        manifestLoadingTimeOut: 4000,
        startLevel: -1,
        startPosition: -1,
      });

      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!isMountedRef.current) return;
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);

        const levels = hls.levels.map((level, index) => ({
          height: level.height,
          bitrate: level.bitrate,
          id: index
        }));

        const audioTracks = hls.audioTracks.map((track, index) => ({
          id: index,
          label: track.name || track.lang || `Audio ${index + 1}`,
          language: track.lang || 'unknown'
        }));

        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          error: null,
          availableQualities: levels,
          availableAudioTracks: audioTracks,
          currentQuality: hls.currentLevel,
          currentAudioTrack: hls.audioTrack,
          isMuted: video.muted,
          isPlaying: true,
          showControls: true // Show controls after successful load
        }));
        startControlsTimer(); // Start the hide timer after successful load
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!isMountedRef.current) return;
        if (data.fatal) {
          if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setPlayerState(prev => ({
                ...prev,
                isLoading: false,
                error: `HLS Error: ${data.details}`,
                showControls: false // Hide controls on stream error
              }));
              destroyPlayer();
              break;
          }
        }
      });
    } catch (error) {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize HLS.js';
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        showControls: false // Hide controls on initialization error
      }));
      destroyPlayer();
    }
  };

  const initNativePlayer = (url: string, video: HTMLVideoElement) => {
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
        showControls: true // Show controls after successful load
      }));
      startControlsTimer(); // Start the hide timer after successful load
    };

    const onError = () => {
      if (!isMountedRef.current) return;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load stream with native player',
        showControls: false // Hide controls on stream error
      }));
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    video.addEventListener('error', onError, { once: true });

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);
    };
  };

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      if (video.paused) shakaPlayerRef.current.play().catch(console.error);
      else shakaPlayerRef.current.pause();
    } else {
      if (video.paused) video.play().catch(console.error);
      else video.pause();
    }
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
      setPlayerState(prev => ({ ...prev, showControls: true, isMuted: video.muted }));
    }
    lastActivityRef.current = Date.now();
  }, []);

  const handleVolumeChange = useCallback((newVolume: number) => {
    const video = videoRef.current;
    if (video) {
      video.volume = newVolume / 100;
      video.muted = newVolume === 0;
      setPlayerState(prev => ({ ...prev, isMuted: newVolume === 0, showControls: true }));
    }
    lastActivityRef.current = Date.now();
  }, []);

  const seekBackward = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = Math.max(0, video.currentTime - 10);
      setPlayerState(prev => ({ ...prev, showControls: true }));
    }
    lastActivityRef.current = Date.now();
  }, []);

  const seekForward = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
      setPlayerState(prev => ({ ...prev, showControls: true }));
    }
    lastActivityRef.current = Date.now();
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
          } catch (e) { /* Ignore unlock errors */ }
        }
      } else {
        await container.requestFullscreen();
        if (screen.orientation && 'lock' in screen.orientation && isMobile) {
          try {
            await (screen.orientation as any).lock('landscape').catch(() => { });
          } catch (e) { /* Ignore lock errors */ }
        }
      }
    } catch (error) {
      // Handle potential errors during fullscreen request
    }
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
    } catch (error) {
      // Handle potential errors during PiP request
    }
    setPlayerState(prev => ({ ...prev, showControls: true }));
    lastActivityRef.current = Date.now();
  }, []);

  const handleMouseMove = useCallback(() => {
    if (!playerState.showSettings) {
      resetControlsTimer();
    }
  }, [playerState.showSettings, resetControlsTimer]);

  const handlePlayerClick = useCallback(() => {
    if (playerState.showSettings) {
      setPlayerState(prev => ({ ...prev, showSettings: false, showControls: true })); // Show controls when closing settings
      lastActivityRef.current = Date.now();
    } else {
      // If settings are not open, clicking the player should show controls
      // and reset the timer if the video is playing.
      setPlayerState(prev => ({ ...prev, showControls: true })); // Explicitly show controls
      lastActivityRef.current = Date.now(); // Update last activity time
      if (playerState.isPlaying && !playerState.showSettings) { // Only restart timer if playing and not in settings
        startControlsTimer(); // <-- Add this line
      }
    }
  }, [playerState.showSettings, playerState.isPlaying, startControlsTimer]);

  const handleRetry = useCallback(() => {
    setPlayerState(prev => ({ ...prev, error: null, isLoading: true, showControls: true })); // Show controls and reset error
    lastActivityRef.current = Date.now();
    initializePlayer(); // Re-initialize the player
  }, [initializePlayer]);

  // --- Seeking Logic ---
  const calculateNewTime = (clientX: number) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = position * (videoRef.current?.duration || 0);
    return isNaN(newTime) ? 0 : newTime;
  };

  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation(); // Prevent triggering handlePlayerClick
    const video = videoRef.current;
    if (!video || !isFinite(video.duration) || video.duration <= 0) return;

    wasPlayingBeforeSeekRef.current = !video.paused;
    dragStartRef.current = { isDragging: true };
    setPlayerState(prev => ({ ...prev, isSeeking: true, showControls: true })); // Show controls during seek
    video.pause(); // Pause video during drag
    lastActivityRef.current = Date.now();
  }, []);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current?.isDragging) return;
    const newTime = calculateNewTime(e.clientX);
    if (isNaN(newTime)) return; // Guard against NaN

    seekTimeRef.current = newTime;
    // Update the display time without changing the actual video time
    setPlayerState(prev => ({ ...prev, currentTime: newTime }));
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!dragStartRef.current?.isDragging) return;
    const video = videoRef.current;
    if (video) {
      video.currentTime = seekTimeRef.current;
      if (wasPlayingBeforeSeekRef.current) video.play().catch(console.error);
    }
    dragStartRef.current = null;
    setPlayerState(prev => ({
      ...prev,
      isSeeking: false,
      isPlaying: !video?.paused,
      showControls: true // Show controls after seeking
    }));
    lastActivityRef.current = Date.now();
    if (playerState.isPlaying) { // Restart timer only if it was playing before
      startControlsTimer();
    }
  }, [playerState.isPlaying, startControlsTimer]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const newTime = calculateNewTime(e.clientX);
    if (isNaN(newTime)) return; // Guard against NaN

    const video = videoRef.current;
    if (video) {
      video.currentTime = newTime;
      // Controls are shown implicitly by the click handler
      // Or explicitly here if needed
      setPlayerState(prev => ({ ...prev, showControls: true }));
      lastActivityRef.current = Date.now();
      if (playerState.isPlaying) { // Restart timer only if it was playing
        startControlsTimer();
      }
    }
  }, [playerState.isPlaying, startControlsTimer]);

  // --- Settings Logic ---
  const [expandedSettingItem, setExpandedSettingItem] = useState<'quality' | 'captions' | 'audio' | 'speed' | 'more' | null>(null);

  const handleSettingClick = useCallback((item: 'quality' | 'captions' | 'audio' | 'speed' | 'more') => {
    setExpandedSettingItem(item);
    setPlayerState(prev => ({ ...prev, showControls: true })); // Ensure controls are visible when navigating settings
    lastActivityRef.current = Date.now();
  }, []);

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
        shakaPlayerRef.current.selectTextTrack(null); // Disable subtitles
      } else {
        const tracks = shakaPlayerRef.current.getTextTracks();
        const targetTrack = tracks.find((t: any) => t.id === subtitleId);
        if (targetTrack) {
          shakaPlayerRef.current.selectTextTrack(targetTrack);
          shakaPlayerRef.current.setTextTrackVisibility(true);
        }
      }
    }
    // For HLS and Native, text tracks are handled differently or may not be available via JS
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
    const video = videoRef.current;
    if (video) {
      video.playbackRate = speed;
    }
    setPlayerState(prev => ({ ...prev, showControls: true, showSettings: false }));
    setExpandedSettingItem(null);
    lastActivityRef.current = Date.now();
  }, []);

  // --- Helper Functions ---
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getCurrentQualityLabel = () => {
    const quality = playerState.availableQualities.find(q => q.id === playerState.currentQuality);
    return quality ? `${quality.height}p` : 'Auto';
  };

  const getCurrentSpeedLabel = () => {
    const speed = videoRef.current?.playbackRate || 1;
    return speed === 1 ? 'Normal' : `${speed}x`;
  };

  // --- Effects ---
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (dragStartRef.current?.isDragging) handleDragMove(e);
    };
    const handleGlobalMouseUp = () => {
      if (dragStartRef.current?.isDragging) handleDragEnd();
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    // Cleanup function to remove global event listeners
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [handleDragMove, handleDragEnd]);

  useEffect(() => {
    isMountedRef.current = true;
    initializePlayer();

    return () => {
      isMountedRef.current = false;
      destroyPlayer();
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
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
      if (!isMountedRef.current || !video || playerState.isSeeking) return; // Don't update time while seeking
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
      const isFullscreen = !!document.fullscreenElement;
      setPlayerState(prev => ({ ...prev, isFullscreen }));
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
  }, [playerState.isSeeking, resetControlsTimer]); // Added resetControlsTimer to dependency array as it affects the timer logic

  // --- Render ---
  const progressPercentage = playerState.duration > 0 ? (playerState.currentTime / playerState.duration) * 100 : 0;
  const bufferedPercentage = playerState.duration > 0 ? (playerState.buffered / playerState.duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`relative bg-black w-full h-full ${className}`}
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

      {playerState.error && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center text-white p-4">
          <AlertCircle className="w-12 h-12 mb-4 text-red-500" />
          <p className="text-center mb-4">{playerState.error}</p>
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
          >
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      )}

      {!playerState.isLoading && !playerState.error && playerState.showControls && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="w-16 h-16 bg-white bg-opacity-20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-opacity-30 transition-all pointer-events-auto"
            data-testid="button-play-pause-center"
          >
            {playerState.isPlaying ? (
              <Pause size={24} fill="white" />
            ) : (
              <Play size={24} fill="white" className="ml-1" />
            )}
          </button>
        </div>
      )}

      {/* Desktop Controls */}
      {!isMobile && !playerState.isLoading && !playerState.error && (
        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300 ${playerState.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          {/* Progress Bar */}
          <div className="relative mb-2">
            <div
              className="w-full h-2 bg-gray-700 rounded-full cursor-pointer overflow-hidden"
              onClick={handleProgressClick}
              onMouseDown={handleDragStart} // Enable dragging on the progress bar
            >
              <div
                className="absolute top-0 left-0 h-full bg-blue-600"
                style={{ width: `${bufferedPercentage}%` }}
              ></div>
              <div
                className="absolute top-0 left-0 h-full bg-white"
                style={{ width: `${progressPercentage}%` }}
              ></div>
              <div
                className="absolute top-1/2 w-3 h-3 bg-white rounded-full transform -translate-y-1/2 -translate-x-1/2 pointer-events-none"
                style={{ left: `${progressPercentage}%` }}
              ></div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="text-white hover:text-blue-300 transition-colors"
              data-testid="button-play-pause"
            >
              {playerState.isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              className="text-white hover:text-blue-300 transition-colors"
            >
              {playerState.isMuted || playerState.volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            <input
              type="range"
              min="0"
              max="100"
              value={playerState.isMuted ? 0 : playerState.volume}
              onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
              className="w-20 accent-white"
            />

            <div className="text-white text-sm whitespace-nowrap" data-testid="text-time">
              {formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); seekBackward(); }}
              className="text-white hover:text-blue-300 transition-colors p-2"
              title="Seek backward 10s"
              data-testid="button-rewind"
            >
              <Rewind size={20} />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); seekForward(); }}
              className="text-white hover:text-blue-300 transition-colors p-2"
              title="Seek forward 10s"
              data-testid="button-forward"
            >
              <FastForward size={20} />
            </button>

            {playerState.availableSubtitles.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); handleSettingClick('captions'); }}
                className="text-white hover:text-blue-300 transition-colors p-2"
                title="Subtitles"
              >
                <Subtitles size={20} />
              </button>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); togglePip(); }}
              className="text-white hover:text-blue-300 transition-colors p-2"
              title={playerState.isPipActive ? "Exit Picture-in-Picture" : "Enter Picture-in-Picture"}
            >
              <PictureInPicture2 size={20} />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              className="text-white hover:text-blue-300 transition-colors p-2"
              title={playerState.isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {playerState.isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); setPlayerState(prev => ({ ...prev, showSettings: !prev.showSettings, showControls: true })); lastActivityRef.current = Date.now(); }}
              className="text-white hover:text-blue-300 transition-colors p-2"
              title="Settings"
            >
              <Settings size={20} />
            </button>
          </div>

          {/* Settings Panel */}
          {playerState.showSettings && (
            <div className="absolute bottom-16 right-4 bg-black/80 backdrop-blur-md rounded-lg overflow-hidden min-w-[200px] z-10">
              <div className="py-1">
                {expandedSettingItem === null ? (
                  <>
                    <button
                      onClick={() => handleSettingClick('more')}
                      className="w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Settings size={16} />
                        <span className="text-sm">Settings</span>
                      </div>
                    </button>
                    {playerState.availableQualities.length > 0 && (
                      <button
                        onClick={() => handleSettingClick('quality')}
                        className="w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">Quality</span>
                        </div>
                        <div className="text-xs text-white/70">{getCurrentQualityLabel()}</div>
                      </button>
                    )}
                    {playerState.availableSubtitles.length > 0 && (
                      <button
                        onClick={() => handleSettingClick('captions')}
                        className="w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Subtitles size={16} />
                          <span className="text-sm">Subtitles</span>
                        </div>
                        <div className="text-xs text-white/70">
                          {playerState.currentSubtitle === '' ? 'Off' : playerState.availableSubtitles.find(s => s.id === playerState.currentSubtitle)?.label || 'Unknown'}
                        </div>
                      </button>
                    )}
                    {playerState.availableAudioTracks.length > 0 && (
                      <button
                        onClick={() => handleSettingClick('audio')}
                        className="w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Music size={16} />
                          <span className="text-sm">Audio</span>
                        </div>
                        <div className="text-xs text-white/70">
                          {playerState.availableAudioTracks.length > 0
                            ? playerState.availableAudioTracks.find(a => a.id === playerState.currentAudioTrack)?.label || 'Default'
                            : 'Default'}
                        </div>
                      </button>
                    )}
                    <button
                      onClick={() => handleSettingClick('speed')}
                      className="w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Play size={16} />
                        <span className="text-sm">Playback Speed</span>
                      </div>
                      <div className="text-xs text-white/70">{getCurrentSpeedLabel()}</div>
                    </button>
                  </>
                ) : expandedSettingItem === 'more' ? (
                  <button
                    onClick={() => setExpandedSettingItem(null)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors"
                  >
                    <ChevronRight size={18} className="rotate-180" />
                    <span className="text-sm">Back</span>
                  </button>
                ) : expandedSettingItem === 'quality' ? (
                  <div>
                    <button
                      onClick={() => setExpandedSettingItem(null)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors"
                    >
                      <ChevronRight size={18} className="rotate-180" />
                      <span className="text-sm">Quality</span>
                    </button>
                    <button
                      onClick={() => { changeQuality(-1); }}
                      className={`w-full text-left px-8 py-2 text-sm text-white transition-colors ${playerState.currentQuality === -1 ? 'bg-white/20' : 'hover:bg-white/10'}`}
                    >
                      Auto
                    </button>
                    {playerState.availableQualities.map((quality) => (
                      <button
                        key={quality.id}
                        onClick={() => { changeQuality(quality.id); }}
                        className={`w-full text-left px-8 py-2 text-sm text-white transition-colors ${playerState.currentQuality === quality.id ? 'bg-white/20' : 'hover:bg-white/10'}`}
                      >
                        {quality.height}p
                      </button>
                    ))}
                  </div>
                ) : expandedSettingItem === 'captions' ? (
                  <div>
                    <button
                      onClick={() => setExpandedSettingItem(null)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors"
                    >
                      <ChevronRight size={18} className="rotate-180" />
                      <span className="text-sm">Subtitles</span>
                    </button>
                    <button
                      onClick={() => { changeSubtitle(''); }}
                      className={`w-full text-left px-8 py-2 text-sm text-white transition-colors ${playerState.currentSubtitle === '' ? 'bg-white/20' : 'hover:bg-white/10'}`}
                    >
                      Off
                    </button>
                    {playerState.availableSubtitles.map((subtitle) => (
                      <button
                        key={subtitle.id}
                        onClick={() => { changeSubtitle(subtitle.id); }}
                        className={`w-full text-left px-8 py-2 text-sm text-white transition-colors ${playerState.currentSubtitle === subtitle.id ? 'bg-white/20' : 'hover:bg-white/10'}`}
                      >
                        {subtitle.label}
                      </button>
                    ))}
                  </div>
                ) : expandedSettingItem === 'audio' ? (
                  <div>
                    <button
                      onClick={() => setExpandedSettingItem(null)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors"
                    >
                      <ChevronRight size={18} className="rotate-180" />
                      <span className="text-sm">Audio</span>
                    </button>
                    {playerState.availableAudioTracks.length > 0 ? (
                      playerState.availableAudioTracks.map((audioTrack) => (
                        <button
                          key={audioTrack.id}
                          onClick={() => { changeAudioTrack(audioTrack.id); }}
                          className={`w-full text-left px-8 py-2 text-sm text-white transition-colors ${playerState.currentAudioTrack === audioTrack.id ? 'bg-white/20' : 'hover:bg-white/10'}`}
                        >
                          {audioTrack.label}
                        </button>
                      ))
                    ) : (
                      <div className="px-8 py-2 text-xs text-white/50">No audio tracks available</div>
                    )}
                  </div>
                ) : expandedSettingItem === 'speed' ? (
                  <div>
                    <button
                      onClick={() => setExpandedSettingItem(null)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors"
                    >
                      <ChevronRight size={18} className="rotate-180" />
                      <span className="text-sm">Playback Speed</span>
                    </button>
                    {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => (
                      <button
                        key={speed}
                        onClick={() => { changePlaybackSpeed(speed); }}
                        className={`w-full text-left px-8 py-2 text-sm text-white transition-colors ${videoRef.current?.playbackRate === speed ? 'bg-white/20' : 'hover:bg-white/10'}`}
                      >
                        {speed === 1 ? 'Normal' : `${speed}x`}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile Controls */}
      {isMobile && !playerState.isLoading && !playerState.error && (
        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 transition-opacity duration-300 ${playerState.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="text-white hover:text-blue-300 transition-colors"
              data-testid="button-play-pause-mobile"
            >
              {playerState.isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>

            <div className="text-white text-xs whitespace-nowrap" data-testid="text-time-mobile">
              {formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); seekForward(); }}
              className="text-white hover:text-blue-300 transition-colors p-2"
              data-testid="button-forward-mobile"
            >
              <FastForward size={18} />
            </button>
          </div>

          {/* Mobile Progress Bar */}
          <div
            className="w-full h-1.5 bg-gray-700 rounded-full cursor-pointer mb-2 overflow-hidden"
            onClick={handleProgressClick}
            onMouseDown={handleDragStart} // Enable dragging on the progress bar for mobile too
          >
            <div
              className="absolute top-0 left-0 h-full bg-blue-600"
              style={{ width: `${bufferedPercentage}%` }}
            ></div>
            <div
              className="absolute top-0 left-0 h-full bg-white"
              style={{ width: `${progressPercentage}%` }}
            ></div>
            <div
              className="absolute top-1/2 w-2 h-2 bg-white rounded-full transform -translate-y-1/2 -translate-x-1/2 pointer-events-none"
              style={{ left: `${progressPercentage}%` }}
            ></div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              className="text-white hover:text-blue-300 transition-colors"
            >
              {playerState.isMuted || playerState.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            <div className="flex items-center gap-2 flex-1 mx-2">
              <input
                type="range"
                min="0"
                max="100"
                value={playerState.isMuted ? 0 : playerState.volume}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                className="w-full accent-white h-1.5"
              />
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              className="text-white hover:text-blue-300 transition-colors"
            >
              {playerState.isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
