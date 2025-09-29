// /src/components/VideoPlayer.tsx - Updated Version
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2,
  AlertCircle, RotateCcw, Settings, PictureInPicture2, Subtitles, Tv
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

const PLAYER_LOAD_TIMEOUT = 20000; // Increased timeout
const CONTROLS_HIDE_DELAY = 4000;

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamUrl,
  channelName,
  autoPlay = true,
  muted = false, // Changed default to false for better user experience
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
    seekableStart: 0,
    seekableEnd: 0,
  });

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
    // Default fallback
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

    const handleRetry = useCallback(() => {
    setPlayerState(prev => ({ ...prev, isLoading: true, error: null }));
    // A short delay before re-initializing can help in some network conditions
    setTimeout(() => {
        if (isMountedRef.current) {
            initializePlayer();
        }
    }, 500);
  }, []);


  const initHlsPlayer = async (url: string, video: HTMLVideoElement) => {
    try {
      const Hls = (await import('hls.js')).default;
      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          initNativePlayer(url, video);
        } else {
          throw new Error('HLS is not supported in this browser.');
        }
        return;
      }
      
      const hls = new Hls({
          enableWorker: true,
          debug: false, // Set to true for verbose logs
          lowLatencyMode: true,
          backBufferLength: 90,
          fragLoadingMaxRetry: 5,
          manifestLoadingMaxRetry: 3,
          levelLoadingMaxRetry: 4,
          fragLoadingTimeOut: 20000,
          manifestLoadingTimeOut: 10000,
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
        setPlayerState(prev => ({ ...prev, isLoading: false, error: null, availableQualities: levels, currentQuality: hls.currentLevel, isMuted: video.muted, isPlaying: true, isLive: data.details.live, duration: video.duration }));
        startControlsTimer();
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!isMountedRef.current) return;
        console.error('HLS.js Error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('HLS network error, trying to recover...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('HLS media error, trying to recover...');
              hls.recoverMediaError();
              break;
            default:
              if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
              setPlayerState(prev => ({ ...prev, isLoading: false, error: `Playback Error: ${data.details}. Please check stream source and CORS policy.` }));
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

        if (shakaPlayerRef.current) {
            await shakaPlayerRef.current.destroy();
        }

        const player = new shaka.default.Player(video);
        shakaPlayerRef.current = player;
        
        // More robust configuration
        player.configure({
            streaming: {
                bufferingGoal: 30,
                rebufferingGoal: 5,
                bufferBehind: 30,
                retryParameters: {
                    timeout: 8000,
                    maxAttempts: 4,
                    baseDelay: 1000,
                    backoffFactor: 2,
                },
            },
            manifest: {
                retryParameters: {
                    timeout: 8000,
                    maxAttempts: 4,
                },
            },
            drm: {
                retryParameters: {
                    timeout: 8000,
                    maxAttempts: 4,
                }
            },
        });
        
        if (drmInfo?.scheme === 'clearkey' && drmInfo.license?.includes(':')) {
            const [keyId, key] = drmInfo.license.split(':');
            player.configure({ drm: { clearKeys: { [keyId]: key } } });
        }

        player.addEventListener('error', (event: any) => {
            console.error('Shaka Player Error:', event.detail);
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            setPlayerState(prev => ({ ...prev, isLoading: false, error: `Error ${event.detail.code}: ${event.detail.message}` }));
            destroyPlayer();
        });

        await player.load(url);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);

        const tracks = player.getVariantTracks();
        const qualities: QualityLevel[] = tracks.map(track => ({ height: track.height || 0, bitrate: Math.round(track.bandwidth / 1000), id: track.id }));
        const textTracks = player.getTextTracks();
        const subtitles: SubtitleTrack[] = textTracks.map(track => ({ id: track.id.toString(), label: track.label || track.language || 'Unknown', language: track.language || 'unknown' }));

        video.muted = muted;
        if (autoPlay) video.play().catch(console.warn);

        setPlayerState(prev => ({
            ...prev,
            isLoading: false,
            error: null,
            availableQualities: qualities,
            availableSubtitles: subtitles,
            currentQuality: -1,
            isMuted: video.muted,
            isPlaying: true,
            isLive: player.isLive(),
            duration: video.duration,
        }));
        startControlsTimer();
    } catch (error) {
        console.error("Shaka Player init failed:", error);
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
      setPlayerState(prev => ({ ...prev, isLoading: false, error: null, isMuted: video.muted, isPlaying: true, duration: video.duration }));
      startControlsTimer();
    };
    video.addEventListener('canplay', onCanPlay, { once: true });
  };
    
  const initializePlayer = useCallback(async () => {
    if (!streamUrl || !videoRef.current) return;
    const video = videoRef.current;
    
    destroyPlayer();
    setPlayerState(prev => ({ ...prev, isLoading: true, error: null, isPlaying: false, showSettings: false, showControls: true }));
    
    loadingTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
            setPlayerState(prev => ({ ...prev, isLoading: false, error: "Stream took too long to load. Check the stream URL and your connection." }));
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

  useEffect(() => {
    isMountedRef.current = true;
    initializePlayer();
    return () => {
      isMountedRef.current = false;
      destroyPlayer();
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      // Ensure orientation is unlocked when component unmounts
      if (screen.orientation && typeof screen.orientation.unlock === 'function') {
        screen.orientation.unlock();
      }
    };
  }, [streamUrl, initializePlayer, destroyPlayer]);

  // Player event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (!isMountedRef.current || !video || playerState.isSeeking) return;
      let seekableStart = 0;
      let seekableEnd = video.duration || 0;
      const isLive = !isFinite(video.duration);

      if(shakaPlayerRef.current && shakaPlayerRef.current.isLive()) {
          const seekRange = shakaPlayerRef.current.seekRange();
          seekableStart = seekRange.start;
          seekableEnd = seekRange.end;
      } else if (video.seekable.length > 0) {
          seekableStart = video.seekable.start(0);
          seekableEnd = video.seekable.end(video.seekable.length - 1);
      }

      setPlayerState(prev => ({
        ...prev,
        currentTime: video.currentTime,
        duration: video.duration || 0,
        buffered: video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0,
        isLive,
        seekableStart,
        seekableEnd,
      }));
    };
    
    const handleFullscreenChange = () => {
      if (!isMountedRef.current) return;
      const isFullscreen = !!document.fullscreenElement;
      setPlayerState(prev => ({ ...prev, isFullscreen }));
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    // ... other listeners ...

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      // ... other removals ...
    };
  }, [playerState.isSeeking]);
    
    
  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
        if (!document.fullscreenElement) {
            await container.requestFullscreen();
            // Attempt to lock orientation on mobile
            if (window.screen.orientation && typeof window.screen.orientation.lock === 'function') {
                try {
                    await window.screen.orientation.lock('landscape');
                } catch (err) {
                    console.warn("Could not lock screen orientation:", err);
                }
            }
        } else {
            await document.exitFullscreen();
            // Unlock orientation
            if (window.screen.orientation && typeof window.screen.orientation.unlock === 'function') {
                window.screen.orientation.unlock();
            }
        }
    } catch (error) {
        console.error('Fullscreen API error:', error);
        toast.error("Fullscreen not available on this device.");
    }
  }, []);

  const formatTime = (time: number): string => {
    if (!isFinite(time) || time < 0) return "00:00";
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

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
    
    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            video.play().catch(err => {
                console.error("Play failed:", err);
                setPlayerState(prev => ({...prev, error: "Autoplay might be blocked by the browser."}));
            });
        } else {
            video.pause();
        }
        setPlayerState(prev => ({ ...prev, isPlaying: !video.paused }));
        resetControlsTimer();
    }, [resetControlsTimer]);

  const handlePlayerClick = useCallback(() => {
      setPlayerState(prev => ({ ...prev, showControls: !prev.showControls }));
  }, []);

  const handleSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (playerState.isLive) return;
    const progress = progressRef.current;
    const video = videoRef.current;
    if (!progress || !video || !isFinite(video.duration)) return;
    
    const rect = progress.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * video.duration;
  };
    
  const isSeekable = playerState.duration > 0 && isFinite(playerState.duration) && !playerState.isLive;
  const currentTimePercentage = isSeekable ? (playerState.currentTime / playerState.duration) * 100 : 0;
  const bufferedPercentage = isSeekable ? (playerState.buffered / playerState.duration) * 100 : 0;

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
                <p className="text-lg font-medium">Loading Stream...</p>
                <p className="text-sm text-gray-400">{channelName}</p>
            </div>
        </div>
      )}

      {playerState.error && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20 text-center text-white p-4">
            <div>
                <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
                <h3 className="text-xl font-bold mb-2">Stream Error</h3>
                <p className="text-gray-300 mb-6 max-w-md mx-auto">{playerState.error}</p>
                <button
                    onClick={handleRetry}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                >
                    <RotateCcw size={16} /> Retry
                </button>
            </div>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 z-10 ${playerState.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={(e) => e.stopPropagation()} // Prevent clicks on controls from toggling visibility
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/50"></div>
        
        {/* Top Controls */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center">
            <h3 className="text-white text-lg font-bold drop-shadow-md">{channelName}</h3>
            <div className="flex items-center gap-2">
                 {(playerState.availableQualities.length > 0 || playerState.availableSubtitles.length > 0) && (
                    <button onClick={() => setPlayerState(p => ({...p, showSettings: true}))} className="p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-all" title="Settings">
                        <Settings size={20} />
                    </button>
                )}
            </div>
        </div>

        {/* Center Play Button */}
        {!playerState.isPlaying && !playerState.isLoading && !playerState.error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button onClick={togglePlay} className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all scale-100 hover:scale-110">
              <Play size={36} fill="white" className="ml-1" />
            </button>
          </div>
        )}
        
        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
            {/* Seek Bar */}
            <div 
                ref={progressRef} 
                className={`relative h-1.5 bg-white/20 rounded-full group/seekbar ${isSeekable ? 'cursor-pointer' : 'cursor-default'}`}
                onClick={handleSeekBarClick}
            >
                <div className="absolute h-full bg-white/40 rounded-full" style={{ width: `${bufferedPercentage}%` }} />
                <div className="absolute h-full bg-red-500 rounded-full" style={{ width: `${currentTimePercentage}%` }} />
                {isSeekable && <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-red-500 transition-transform duration-150 ease-out group-hover/seekbar:scale-125" style={{ left: `${currentTimePercentage}%` }} />}
            </div>

            {/* Main Controls Row */}
            <div className="flex items-center gap-4 text-white">
                <button onClick={togglePlay}>{playerState.isPlaying ? <Pause size={24} /> : <Play size={24} />}</button>
                <div className="flex items-center gap-2">
                    <button>{playerState.isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}</button>
                </div>
                
                {isSeekable ? (
                    <div className="text-xs font-mono">{formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}</div>
                ) : (
                    <div className="text-xs font-semibold bg-red-600 px-2 py-0.5 rounded">LIVE</div>
                )}
                
                <div className="flex-grow"></div>
                
                {document.pictureInPictureEnabled && <button title="Picture-in-picture"><PictureInPicture2 size={20} /></button>}
                <button onClick={toggleFullscreen} title="Fullscreen">{playerState.isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}</button>
            </div>
        </div>
      </div>

      {/* Settings Drawer */}
      <Drawer open={playerState.showSettings} onOpenChange={(isOpen) => setPlayerState(p => ({ ...p, showSettings: isOpen }))}>
        <DrawerContent className="bg-[#0a0a0a] text-white border-t border-gray-700 outline-none landscape:max-w-md landscape:mx-auto">
          <DrawerHeader>
            <DrawerTitle className="text-center text-xl">Stream Settings</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 overflow-y-auto max-h-[60vh]">
            <Accordion type="single" collapsible className="w-full">
              {/* Quality Settings */}
            </Accordion>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default VideoPlayer;

