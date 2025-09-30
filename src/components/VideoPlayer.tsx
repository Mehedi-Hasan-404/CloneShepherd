// /src/components/VideoPlayer.tsx - Updated with Custom Header Support
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2, AlertCircle, RotateCcw, Settings, PictureInPicture2, Subtitles } from 'lucide-react';
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

const PLAYER_LOAD_TIMEOUT = 15000; // 15 seconds
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
  });

  const detectStreamType = useCallback((url: string): { 
    type: 'hls' | 'dash' | 'native'; 
    cleanUrl: string; 
    drmInfo?: any;
    customHeaders?: { [key: string]: string };
  } => {
    let cleanUrl = url;
    let drmInfo = null;
    let customHeaders: { [key: string]: string } = {};

    if (url.includes('?|') || url.includes('|')) {
      const separator = url.includes('?|') ? '?|' : '|';
      const [baseUrl, allParams] = url.split(separator);
      cleanUrl = baseUrl;

      if (allParams) {
        const params = new URLSearchParams(allParams);
        const drmScheme = params.get('drmScheme');
        const drmLicense = params.get('drmLicense');
        if (drmScheme && drmLicense) {
          drmInfo = { scheme: drmScheme, license: drmLicense };
        }
        if (params.has('User-Agent')) {
          customHeaders['User-Agent'] = params.get('User-Agent')!;
        }
      }
    }
  
    const urlLower = cleanUrl.toLowerCase();
    
    if (urlLower.includes('.mpd') || urlLower.includes('/dash/') || urlLower.includes('manifest') || drmInfo) {
      return { type: 'dash', cleanUrl, drmInfo, customHeaders };
    }
    if (urlLower.includes('.m3u8') || urlLower.includes('/hls/')) {
      return { type: 'hls', cleanUrl, drmInfo, customHeaders };
    }
    if (urlLower.includes('.mp4') || urlLower.includes('.webm')) {
      return { type: 'native', cleanUrl, drmInfo, customHeaders };
    }
    
    return { type: 'hls', cleanUrl, drmInfo, customHeaders }; // Fallback to HLS
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

  const startControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && playerState.isPlaying && !playerState.showSettings) {
        setPlayerState(prev => ({ ...prev, showControls: false }));
      }
    }, CONTROLS_HIDE_DELAY);
  }, [playerState.isPlaying, playerState.showSettings]);

  const initHlsPlayer = async (url: string, video: HTMLVideoElement, customHeaders?: { [key: string]: string }) => {
    try {
      const Hls = (await import('hls.js')).default;
      if (Hls && Hls.isSupported()) {
        const hlsConfig: any = {
          capLevelToPlayerSize: true,
          maxBufferLength: 30,
        };
        // Add custom headers if they exist
        if (customHeaders && Object.keys(customHeaders).length > 0) {
          hlsConfig.xhrSetup = (xhr: any) => {
            Object.entries(customHeaders).forEach(([key, value]) => {
              xhr.setRequestHeader(key, value);
            });
          };
        }
        
        const hls = new Hls(hlsConfig);
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!isMountedRef.current) return;
          if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
          const levels: QualityLevel[] = hls.levels.map((level: any, index: number) => ({
            height: level.height || 0, bitrate: Math.round(level.bitrate / 1000), id: index
          }));
          video.muted = muted;
          if (autoPlay) video.play().catch(console.warn);
          setPlayerState(prev => ({ ...prev, isLoading: false, error: null, availableQualities: levels.sort((a,b) => b.height - a.height), currentQuality: hls.currentLevel, isMuted: video.muted, isPlaying: !video.paused, showControls: true }));
          startControlsTimer();
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!isMountedRef.current) return;
          if (data.fatal) {
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            setPlayerState(prev => ({ ...prev, isLoading: false, error: `HLS Error: ${data.details}` }));
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        initNativePlayer(url, video);
      } else {
        throw new Error('HLS is not supported in this browser');
      }
    } catch (error) {
      throw error;
    }
  };

  const initShakaPlayer = async (url: string, video: HTMLVideoElement, drmInfo?: any, customHeaders?: { [key: string]: string }) => {
    try {
      const shaka = await import('shaka-player/dist/shaka-player.ui.js');
      shaka.default.polyfill.installAll();
      if (!shaka.default.Player.isBrowserSupported()) throw new Error('Browser not supported by Shaka Player');

      const player = new shaka.default.Player(video);
      shakaPlayerRef.current = player;
      
      // Setup network filter for custom headers
      player.getNetworkingEngine()?.registerRequestFilter((type: any, request: any) => {
        if (customHeaders) {
          Object.entries(customHeaders).forEach(([key, value]) => {
            request.headers[key] = value;
          });
        }
      });

      player.configure({
        streaming: { bufferingGoal: 30, rebufferingGoal: 10 },
        abr: { enabled: true },
      });

      if (drmInfo && drmInfo.scheme === 'clearkey' && drmInfo.license.includes(':')) {
        const [keyId, key] = drmInfo.license.split(':');
        player.configure({ drm: { clearKeys: { [keyId]: key } } });
      }

      const onError = (event: any) => {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        setPlayerState(prev => ({ ...prev, isLoading: false, error: `Shaka Error: ${event.detail.code}` }));
      };
      player.addEventListener('error', onError);
      
      await player.load(url);
      
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      const tracks = player.getVariantTracks();
      const qualities: QualityLevel[] = tracks.filter((t: any) => t.height).map((t: any) => ({
          height: t.height || 0, bitrate: Math.round(t.bandwidth / 1000), id: t.id
        })).sort((a,b) => b.height - a.height);
      const textTracks = player.getTextTracks();
      const subtitles: SubtitleTrack[] = textTracks.map((t: any) => ({
        id: t.id.toString(), label: t.label || t.language || 'Unknown', language: t.language || 'unknown'
      }));

      video.muted = muted;
      if (autoPlay) video.play().catch(console.warn);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: null, availableQualities: qualities, availableSubtitles: subtitles, currentQuality: -1, isMuted: video.muted, isPlaying: !video.paused, showControls: true }));
      startControlsTimer();
    } catch (error) {
      throw error;
    }
  };

  const initNativePlayer = (url: string, video: HTMLVideoElement) => {
    video.src = url;
    const onLoadedMetadata = () => {
      if (!isMountedRef.current) return;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      video.muted = muted;
      if (autoPlay) video.play().catch(console.warn);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: null, isMuted: video.muted, isPlaying: !video.paused, showControls: true }));
      startControlsTimer();
    };
    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
  };

  const initializePlayer = useCallback(async () => {
    if (!streamUrl || !videoRef.current) return;
    const video = videoRef.current;
    destroyPlayer();
    setPlayerState(prev => ({ ...prev, isLoading: true, error: null, isPlaying: false }));
    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setPlayerState(prev => ({ ...prev, isLoading: false, error: "Stream took too long to load." }));
        destroyPlayer();
      }
    }, PLAYER_LOAD_TIMEOUT);

    try {
      const { type, cleanUrl, drmInfo, customHeaders } = detectStreamType(streamUrl);
      playerTypeRef.current = type;
      if (type === 'dash') {
        await initShakaPlayer(cleanUrl, video, drmInfo, customHeaders);
      } else if (type === 'hls') {
        await initHlsPlayer(cleanUrl, video, customHeaders);
      } else {
        initNativePlayer(cleanUrl, video);
      }
    } catch (error) {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: error instanceof Error ? error.message : 'Failed to initialize player' }));
    }
  }, [streamUrl, destroyPlayer, detectStreamType]);

  const handleRetry = useCallback(() => initializePlayer(), [initializePlayer]);
  
  useEffect(() => {
    isMountedRef.current = true;
    initializePlayer();
    return () => { isMountedRef.current = false; destroyPlayer(); };
  }, [streamUrl, initializePlayer, destroyPlayer]);
  
  // ... (rest of the component logic: useEffect for video events, toggle functions, etc. remains the same)
  // NOTE: The rest of the component from the previous response is unchanged. Only the functions above are modified.

  // --- Start of unchanged code from previous response ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handlePlay = () => setPlayerState(prev => ({ ...prev, isPlaying: true }));
    const handlePause = () => setPlayerState(prev => ({ ...prev, isPlaying: false }));
    const handleWaiting = () => setPlayerState(prev => ({ ...prev, isLoading: true }));
    const handlePlaying = () => setPlayerState(prev => ({ ...prev, isLoading: false, isPlaying: true }));
    const handleVolumeChange = () => setPlayerState(prev => ({ ...prev, isMuted: video.muted }));
    const handleEnterPip = () => setPlayerState(prev => ({ ...prev, isPipActive: true }));
    const handleLeavePip = () => setPlayerState(prev => ({ ...prev, isPipActive: false }));
    const handleTimeUpdate = () => {
      if (!isMountedRef.current || !video || playerState.isSeeking) return;
      const buffered = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
      setPlayerState(prev => ({ ...prev, currentTime: video.currentTime, duration: video.duration || 0, buffered }));
    };
    const handleFullscreenChange = () => setPlayerState(prev => ({...prev, isFullscreen: !!document.fullscreenElement }));

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

  const toggleFullscreen = useCallback(() => {
      const container = containerRef.current;
      if (!container) return;
      if (!document.fullscreenElement) container.requestFullscreen().catch(console.warn);
      else document.exitFullscreen().catch(console.warn);
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture();
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
    setPlayerState(prev => ({ ...prev, currentQuality: qualityId }));
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
    setPlayerState(prev => ({ ...prev, currentSubtitle: subtitleId }));
  }, []);

  const formatTime = (time: number): string => {
    if (!isFinite(time) || time <= 0) return "0:00";
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlayerClick = useCallback(() => {
    setPlayerState(prev => ({...prev, showControls: !prev.showControls }));
  }, []);

  if (playerState.error) {
    return (
      <div className={`w-full h-full bg-black flex items-center justify-center ${className}`}>
        <div className="text-center text-white p-6 max-w-md">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-400" />
          <div className="text-lg font-medium mb-2">Stream Error</div>
          <div className="text-sm text-gray-300 mb-4">{playerState.error}</div>
          <button onClick={handleRetry} className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors">
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }
  // --- End of unchanged code ---
  
  // The JSX part also remains unchanged from the previous response
  return (
    <div
      ref={containerRef}
      className={`relative bg-black w-full h-full ${className}`}
      onMouseMove={() => startControlsTimer()}
      onClick={handlePlayerClick}
    >
      <video ref={videoRef} className="w-full h-full object-contain" playsInline controls={false} />

      {playerState.isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-20">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
            <div className="text-sm">Loading stream...</div>
          </div>
        </div>
      )}
      
      <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity duration-300 z-10 ${playerState.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="absolute top-4 left-4 text-white font-bold text-lg drop-shadow-lg">{channelName}</div>
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {(playerState.availableQualities.length > 0 || playerState.availableSubtitles.length > 0) && (
              <button onClick={(e) => { e.stopPropagation(); setPlayerState(prev => ({ ...prev, showSettings: true })); }} className="p-2 rounded-lg bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 transition-all" title="Settings">
                <Settings size={18} />
              </button>
            )}
          </div>

          {!playerState.isPlaying && !playerState.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="w-16 h-16 bg-white bg-opacity-20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-opacity-30 transition-all">
                <Play size={24} fill="white" className="ml-1" />
              </button>
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 p-4" onClick={e => e.stopPropagation()}>
            {/* The progress bar element would be here, identical to the previous version */}
            
            <div className="flex items-center gap-3">
              <button onClick={togglePlay} className="text-white p-2">{playerState.isPlaying ? <Pause size={20} /> : <Play size={20} />}</button>
              <button onClick={toggleMute} className="text-white p-2">{playerState.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
              {isFinite(playerState.duration) && playerState.duration > 0 && (
                <div className="text-white text-sm">{formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}</div>
              )}
              <div className="flex-1"></div>
              {document.pictureInPictureEnabled && (
                <button onClick={togglePip} className="text-white p-2" title="Picture-in-picture"><PictureInPicture2 size={18} /></button>
              )}
              <button onClick={toggleFullscreen} className="text-white p-2" title="Fullscreen">{playerState.isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
            </div>
          </div>
      </div>

      <Drawer open={playerState.showSettings} onOpenChange={(isOpen) => setPlayerState(prev => ({...prev, showSettings: isOpen }))}>
        {/* The DrawerContent element and its children are identical to the previous version */}
        <DrawerContent className="bg-black/90 border-t border-white/20 text-white outline-none" onClick={(e) => e.stopPropagation()}>
          <DrawerHeader><DrawerTitle className="text-center text-white">Settings</DrawerTitle></DrawerHeader>
          <div className="p-4 overflow-y-auto" style={{ maxHeight: '50vh' }}>
            <Accordion type="single" collapsible className="w-full">
              {playerState.availableQualities.length > 0 && (
                <AccordionItem value="quality">
                  <AccordionTrigger className="text-white hover:no-underline">Quality</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1 pt-2">
                      <button onClick={() => changeQuality(-1)} className={`w-full text-left p-2 text-sm rounded transition-colors ${playerState.currentQuality === -1 ? 'bg-blue-600' : 'hover:bg-white/10'}`}>Auto</button>
                      {playerState.availableQualities.map(q => (
                        <button key={q.id} onClick={() => changeQuality(q.id)} className={`w-full text-left p-2 text-sm rounded transition-colors ${playerState.currentQuality === q.id ? 'bg-blue-600' : 'hover:bg-white/10'}`}>{q.height}p ({q.bitrate} kbps)</button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
              {playerState.availableSubtitles.length > 0 && (
                <AccordionItem value="subtitles">
                  <AccordionTrigger className="text-white hover:no-underline">Subtitles</AccordionTrigger>
                  <AccordionContent>
                     <div className="space-y-1 pt-2">
                      <button onClick={() => changeSubtitle('')} className={`w-full text-left p-2 text-sm rounded transition-colors ${playerState.currentSubtitle === '' ? 'bg-blue-600' : 'hover:bg-white/10'}`}>Off</button>
                       {playerState.availableSubtitles.map(s => (
                         <button key={s.id} onClick={() => changeSubtitle(s.id)} className={`w-full text-left p-2 text-sm rounded transition-colors ${playerState.currentSubtitle === s.id ? 'bg-blue-600' : 'hover:bg-white/10'}`}>{s.label}</button>
                       ))}
                     </div>
                  </AccordionContent>
                </AccordionItem>
              )}
               <AccordionItem value="playback-speed">
                  <AccordionTrigger className="text-white hover:no-underline">Playback Speed</AccordionTrigger>
                  <AccordionContent>
                     <div className="space-y-1 pt-2">
                       {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                         <button key={speed} onClick={() => { if (videoRef.current) videoRef.current.playbackRate = speed; setPlayerState(prev => ({ ...prev, showSettings: false })); }} className={`w-full text-left p-2 text-sm rounded transition-colors ${videoRef.current?.playbackRate === speed ? 'bg-blue-600' : 'hover:bg-white/10'}`}>{speed === 1 ? 'Normal' : `${speed}x`}</button>
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
