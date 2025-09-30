// /src/components/VideoPlayer.tsx - Overhauled Controls & Live Stream Logic
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from "sonner";
import {
  Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2,
  AlertCircle, RotateCcw, Settings, PictureInPicture2, Subtitles
} from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// ... (Interface definitions remain the same) ...
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
const CONTROLS_HIDE_DELAY = 3000; // A bit shorter for better UX

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamUrl,
  channelName,
  autoPlay = true,
  muted = false,
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

  // Seeking state
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
    playerTypeRef.current = null;
  }, []);

  const initializePlayer = useCallback(async () => {
    isMountedRef.current = true;
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
  }, [streamUrl, autoPlay, muted, destroyPlayer]);


  const initHlsPlayer = async (url: string, video: HTMLVideoElement) => {
    try {
      const HlsModule = await import('hls.js');
      const Hls = HlsModule.default;
      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) initNativePlayer(url, video);
        else throw new Error('HLS is not supported in this browser.');
        return;
      }
      const hls = new Hls({ lowLatencyMode: true, backBufferLength: 90 });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        if (!isMountedRef.current) return;
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        const isLive = data.details.live;
        setPlayerState(prev => ({...prev, isLoading: false, error: null, isLive, duration: isLive ? 0 : video.duration}));
        if (autoPlay) video.play().catch(console.warn);
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            setPlayerState(prev => ({ ...prev, isLoading: false, error: `Playback Error: ${data.details}.`}));
        }
      });
    } catch (error) {
        setPlayerState(prev => ({ ...prev, isLoading: false, error: error instanceof Error ? error.message : "Failed to load HLS."}));
    }
  };

  const initShakaPlayer = async (url: string, video: HTMLVideoElement, drmInfo?: any) => {
     try {
        const shaka = await import('shaka-player/dist/shaka-player.ui.js');
        shaka.default.polyfill.installAll();
        if (!shaka.default.Player.isBrowserSupported()) throw new Error('Shaka Player not supported');
        const player = new shaka.default.Player(video);
        shakaPlayerRef.current = player;
        if (drmInfo?.scheme === 'clearkey' && drmInfo.license?.includes(':')) {
            const [keyId, key] = drmInfo.license.split(':');
            player.configure({ drm: { clearKeys: { [keyId]: key } } });
        }
        await player.load(url);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        const isLive = player.isLive();
        setPlayerState(prev => ({...prev, isLoading: false, error: null, isLive, duration: isLive ? 0 : video.duration}));
        if (autoPlay) video.play().catch(console.warn);
    } catch (error) {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        setPlayerState(prev => ({ ...prev, isLoading: false, error: error instanceof Error ? `Shaka Error: ${error.message}` : 'Failed to init Shaka' }));
    }
  };

  const initNativePlayer = (url: string, video: HTMLVideoElement) => {
    video.src = url;
    const onCanPlay = () => {
      if (!isMountedRef.current) return;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      const isLive = !isFinite(video.duration);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: null, isLive, duration: isLive ? 0 : video.duration }));
      if (autoPlay) video.play().catch(console.warn);
    };
    video.addEventListener('canplay', onCanPlay, { once: true });
  };
  
  // --- CONTROLS VISIBILITY LOGIC ---

  const startControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current && playerState.isPlaying && !playerState.isSeeking && !playerState.showSettings) {
            setPlayerState(prev => ({ ...prev, showControls: false }));
        }
    }, CONTROLS_HIDE_DELAY);
  }, [playerState.isPlaying, playerState.isSeeking, playerState.showSettings]);

  const handleUserActivity = useCallback(() => {
    setPlayerState(prev => ({ ...prev, showControls: true }));
    startControlsTimer();
  }, [startControlsTimer]);

  const handlePlayerClick = useCallback(() => {
    setPlayerState(prev => {
      const newShowControls = !prev.showControls;
      if (newShowControls && prev.isPlaying) {
        startControlsTimer();
      } else if (!newShowControls && controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      return { ...prev, showControls: newShowControls };
    });
  }, [startControlsTimer]);

  // --- PLAYER ACTIONS ---

  const togglePlay = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) video.play().catch(console.error);
      else video.pause();
      handleUserActivity();
  }, [handleUserActivity]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      const video = videoRef.current;
      if (video) video.muted = !video.muted;
      handleUserActivity();
  }, [handleUserActivity]);

  const toggleFullscreen = useCallback(async (e: React.MouseEvent) => {
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      // ... (fullscreen logic from previous version) ...
  }, []);

  // --- SEEKING LOGIC ---
  
  const handleSeekStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (playerState.isLive) return;
    wasPlayingBeforeSeekRef.current = playerState.isPlaying;
    setPlayerState(p => ({...p, isSeeking: true}));
    if (wasPlayingBeforeSeekRef.current) videoRef.current?.pause();
  }, [playerState.isLive, playerState.isPlaying]);

  const handleSeekMove = useCallback((e: MouseEvent) => {
    if (!playerState.isSeeking) return;
    const video = videoRef.current;
    const progress = containerRef.current?.querySelector('.progress-bar');
    if(!video || !progress) return;

    const rect = progress.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = pos * video.duration;
    setPlayerState(p => ({...p, currentTime: video.currentTime}));
  }, [playerState.isSeeking]);

  const handleSeekEnd = useCallback(() => {
    if (!playerState.isSeeking) return;
    setPlayerState(p => ({...p, isSeeking: false}));
    if (wasPlayingBeforeSeekRef.current) videoRef.current?.play().catch(console.error);
    handleUserActivity();
  }, [playerState.isSeeking, handleUserActivity]);
  
  // --- LIFECYCLE AND EVENT LISTENERS ---

  useEffect(() => {
    isMountedRef.current = true;
    initializePlayer();
    document.addEventListener('mouseup', handleSeekEnd);
    document.addEventListener('mousemove', handleSeekMove);

    return () => {
      isMountedRef.current = false;
      destroyPlayer();
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      document.removeEventListener('mouseup', handleSeekEnd);
      document.removeEventListener('mousemove', handleSeekMove);
    };
  }, [streamUrl]);
  
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handlePlay = () => isMountedRef.current && setPlayerState(p => ({ ...p, isPlaying: true, isLoading: false }));
    const handlePause = () => isMountedRef.current && setPlayerState(p => ({ ...p, isPlaying: false }));
    const handleWaiting = () => isMountedRef.current && setPlayerState(p => ({ ...p, isLoading: true }));
    const handlePlaying = () => isMountedRef.current && setPlayerState(p => ({ ...p, isLoading: false }));
    const handleTimeUpdate = () => {
        if (isMountedRef.current && !playerState.isSeeking) {
            setPlayerState(p => ({...p, currentTime: video.currentTime, buffered: video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0}));
        }
    }
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [playerState.isSeeking]);
  
  useEffect(() => {
    if (playerState.isPlaying && playerState.showControls) {
        startControlsTimer();
    }
    if(controlsTimeoutRef.current && !playerState.showControls) {
        clearTimeout(controlsTimeoutRef.current)
    }
  }, [playerState.isPlaying, playerState.showControls, startControlsTimer]);


  const isSeekable = !playerState.isLive && playerState.duration > 0 && isFinite(playerState.duration);
  const currentTimePercentage = isSeekable ? (playerState.currentTime / playerState.duration) * 100 : 0;
  const bufferedPercentage = isSeekable ? (playerState.buffered / playerState.duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`relative bg-black w-full h-full group/player ${className}`}
      onMouseMove={handleUserActivity}
      onClick={handlePlayerClick}
    >
      <video ref={videoRef} className="w-full h-full object-contain" playsInline />
      
      {/* ... (Loading and Error overlays remain the same) ... */}

      <div className={`absolute inset-0 transition-opacity duration-300 z-10 ${playerState.showControls ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/50 pointer-events-none"></div>
        
        {/* Top Controls */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center pointer-events-none">
            <h3 className="text-white text-lg font-bold drop-shadow-md">{channelName}</h3>
            {/* Settings button here */}
        </div>

        {/* Center Play/Pause Button */}
        <div className="absolute inset-0 flex items-center justify-center">
            <button onClick={togglePlay} className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all scale-100 hover:scale-110">
                {playerState.isPlaying ? <Pause size={36} /> : <Play size={36} fill="white" className="ml-1" />}
            </button>
        </div>
        
        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
          {/* Seek Bar or Live Indicator */}
          {isSeekable ? (
            <div className="progress-bar relative h-1.5 bg-white/20 rounded-full cursor-pointer" onMouseDown={handleSeekStart}>
              <div className="absolute h-full bg-white/40 rounded-full" style={{ width: `${bufferedPercentage}%` }} />
              <div className="absolute h-full bg-red-500 rounded-full" style={{ width: `${currentTimePercentage}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-red-500" style={{ left: `${currentTimePercentage}%` }}/>
            </div>
          ) : (
             <div className="flex items-center">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-semibold uppercase text-white">LIVE</span>
                </div>
             </div>
          )}

          {/* Controls Row */}
          <div className="flex items-center gap-4 text-white">
            <button onClick={togglePlay}>{playerState.isPlaying ? <Pause size={24} /> : <Play size={24} />}</button>
            <button onClick={toggleMute}>{playerState.isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}</button>
            {isSeekable && (<div className="text-sm font-mono">{formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}</div>)}
            <div className="flex-grow"></div>
            <button onClick={toggleFullscreen}>{playerState.isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}</button>
          </div>
        </div>
      </div>
      
      {/* ... (Settings Drawer remains the same) ... */}
    </div>
  );
};

export default VideoPlayer;


