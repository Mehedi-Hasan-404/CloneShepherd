import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2,
    AlertCircle, RotateCcw, Settings, PictureInPicture2, Subtitles
} from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// --- Type Definitions ---
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
    id: number | string;
    label: string;
    language: string;
}

// --- Constants ---
const PLAYER_LOAD_TIMEOUT = 15000;
const CONTROLS_HIDE_DELAY = 4000;

const VideoPlayer: React.FC<VideoPlayerProps> = ({
    streamUrl,
    channelName,
    autoPlay = true,
    muted = true,
    className = ""
}) => {
    // --- Refs ---
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const hlsRef = useRef<any>(null);
    const shakaPlayerRef = useRef<any>(null);
    const playerTypeRef = useRef<'hls' | 'shaka' | 'native' | null>(null);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isMountedRef = useRef(true);
    const progressRef = useRef<HTMLDivElement>(null);
    const wasPlayingBeforeSeekRef = useRef(false);
    const seekTimeRef = useRef(0);
    const isDraggingRef = useRef(false);

    // --- State ---
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
        playbackRate: 1,
        availableAudioTracks: [] as AudioTrack[],
        currentAudioTrack: '',
    });

    // --- Controls Visibility Logic ---
    const startControlsTimer = useCallback(() => {
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }
        controlsTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current && playerState.isPlaying && !playerState.showSettings) {
                setPlayerState(prev => ({ ...prev, showControls: false }));
            }
        }, CONTROLS_HIDE_DELAY);
    }, [playerState.isPlaying, playerState.showSettings]);

    const resetControlsTimer = useCallback(() => {
        setPlayerState(prev => ({ ...prev, showControls: true }));
        startControlsTimer();
    }, [startControlsTimer]);


    // --- Player Initialization and Detection ---
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
        if (urlLower.includes('.mpd') || urlLower.includes('/dash/')) return { type: 'dash', cleanUrl, drmInfo };
        if (urlLower.includes('.m3u8') || urlLower.includes('/hls/')) return { type: 'hls', cleanUrl, drmInfo };
        if (urlLower.includes('.mp4') || urlLower.includes('.webm')) return { type: 'native', cleanUrl, drmInfo };
        if (urlLower.includes('manifest') || drmInfo) return { type: 'dash', cleanUrl, drmInfo };
        return { type: 'hls', cleanUrl, drmInfo };
    }, []);

    const destroyPlayer = useCallback(() => {
        if (hlsRef.current) hlsRef.current.destroy();
        if (shakaPlayerRef.current) shakaPlayerRef.current.destroy();
        hlsRef.current = null;
        shakaPlayerRef.current = null;
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        playerTypeRef.current = null;
    }, []);

    const initHlsPlayer = async (url: string, video: HTMLVideoElement) => {
        const Hls = (await import('hls.js')).default;
        if (!Hls.isSupported()) {
            if (video.canPlayType('application/vnd.apple.mpegurl')) return initNativePlayer(url, video);
            throw new Error('HLS is not supported in this browser');
        }

        const hls = new Hls({ enableWorker: true, debug: false, capLevelToPlayerSize: true });
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
            const audioTracks: AudioTrack[] = hls.audioTracks.map((track: any) => ({
                id: track.id,
                label: track.name || track.lang || `Track ${track.id}`,
                language: track.lang || 'unknown',
            }));

            video.muted = muted;
            if (autoPlay) video.play().catch(console.warn);

            setPlayerState(prev => ({
                ...prev,
                isLoading: false,
                error: null,
                availableQualities: levels,
                currentQuality: hls.currentLevel,
                isMuted: video.muted,
                isPlaying: !video.paused,
                availableAudioTracks: audioTracks,
                currentAudioTrack: hls.audioTrack.toString(),
            }));
            resetControlsTimer();
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
            if (isMountedRef.current && data.fatal) {
                if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
                setPlayerState(prev => ({ ...prev, isLoading: false, error: `HLS Error: ${data.details}` }));
                destroyPlayer();
            }
        });
    };

    const initShakaPlayer = async (url: string, video: HTMLVideoElement, drmInfo?: any) => {
        const shaka = await import('shaka-player/dist/shaka-player.ui.js');
        shaka.default.polyfill.installAll();
        if (!shaka.default.Player.isBrowserSupported()) throw new Error('Shaka Player not supported');

        const player = new shaka.default.Player(video);
        shakaPlayerRef.current = player;
        
        if (drmInfo && drmInfo.scheme === 'clearkey' && drmInfo.license && drmInfo.license.includes(':')) {
            const [keyId, key] = drmInfo.license.split(':');
            player.configure({ drm: { clearKeys: { [keyId]: key } } });
        }

        player.addEventListener('error', (event: any) => {
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            console.error('Shaka Player Error:', event.detail);
            setPlayerState(prev => ({ ...prev, isLoading: false, error: `Stream error (${event.detail.code})` }));
            destroyPlayer();
        });

        await player.load(url);

        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        const qualities: QualityLevel[] = player.getVariantTracks().map((track: any) => ({
            height: track.height || 0,
            bitrate: Math.round(track.bandwidth / 1000),
            id: track.id,
        }));
        const subtitles: SubtitleTrack[] = player.getTextTracks().map((track: any) => ({
            id: track.id.toString(),
            label: track.label || track.language,
            language: track.language,
        }));
        const audioTracks: AudioTrack[] = player.getAudioLanguagesAndRoles().map((track: any) => ({
            id: track.language,
            label: track.language,
            language: track.language,
        }));

        video.muted = muted;
        if (autoPlay) video.play().catch(console.warn);
        
        setPlayerState(prev => ({
            ...prev,
            isLoading: false, error: null, availableQualities: qualities,
            availableSubtitles: subtitles, availableAudioTracks: audioTracks,
            currentQuality: -1, isMuted: video.muted, isPlaying: !video.paused,
            currentAudioTrack: player.getAudioLanguages()[0] || '',
        }));
        resetControlsTimer();
    };

    const initNativePlayer = (url: string, video: HTMLVideoElement) => {
        video.src = url;
        const onLoaded = () => {
            if (!isMountedRef.current) return;
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            video.muted = muted;
            if (autoPlay) video.play().catch(console.warn);
            setPlayerState(prev => ({ ...prev, isLoading: false, error: null, isMuted: video.muted, isPlaying: !video.paused }));
            resetControlsTimer();
        };
        video.addEventListener('loadedmetadata', onLoaded, { once: true });
    };
    
    const initializePlayer = useCallback(async () => {
        if (!streamUrl || !videoRef.current) return;
        destroyPlayer();
        setPlayerState(prev => ({ ...prev, isLoading: true, error: null }));
    
        loadingTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
                setPlayerState(prev => ({ ...prev, isLoading: false, error: "Stream took too long to load." }));
                destroyPlayer();
            }
        }, PLAYER_LOAD_TIMEOUT);
    
        try {
            const { type, cleanUrl, drmInfo } = detectStreamType(streamUrl);
            playerTypeRef.current = type;
            if (type === 'dash') await initShakaPlayer(cleanUrl, videoRef.current, drmInfo);
            else if (type === 'hls') await initHlsPlayer(cleanUrl, videoRef.current);
            else initNativePlayer(cleanUrl, videoRef.current);
        } catch (error) {
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            setPlayerState(prev => ({ ...prev, isLoading: false, error: error instanceof Error ? error.message : 'Player initialization failed' }));
        }
    }, [streamUrl, autoPlay, muted, destroyPlayer, detectStreamType]);


    // --- Core Player Controls & Handlers ---
    const formatTime = (time: number): string => {
        if (!isFinite(time) || time < 0) return "0:00";
        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time % 3600) / 60);
        const seconds = Math.floor(time % 60);
        if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleRetry = useCallback(() => initializePlayer(), [initializePlayer]);

    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) video.play().catch(console.error);
        else video.pause();
        resetControlsTimer();
    }, [resetControlsTimer]);

    const toggleMute = useCallback(() => {
        if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
        resetControlsTimer();
    }, [resetControlsTimer]);

    const toggleFullscreen = useCallback(async () => {
        const container = containerRef.current;
        if (!container) return;
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await container.requestFullscreen();
        } catch (error) {
            console.warn('Fullscreen request failed:', error);
        }
        resetControlsTimer();
    }, [resetControlsTimer]);

    const togglePip = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !document.pictureInPictureEnabled) return;
        try {
            if (document.pictureInPictureElement) await document.exitPictureInPicture();
            else await video.requestPictureInPicture();
        } catch(error) {
            console.warn('PIP request failed:', error);
        }
        resetControlsTimer();
    }, [resetControlsTimer]);

    // --- Settings Handlers ---
    const changeQuality = useCallback((qualityId: number) => {
        if (playerTypeRef.current === 'hls' && hlsRef.current) hlsRef.current.currentLevel = qualityId;
        else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
            if (qualityId === -1) {
                shakaPlayerRef.current.configure({ abr: { enabled: true } });
            } else {
                shakaPlayerRef.current.configure({ abr: { enabled: false } });
                const track = shakaPlayerRef.current.getVariantTracks().find((t: any) => t.id === qualityId);
                if (track) shakaPlayerRef.current.selectVariantTrack(track, true);
            }
        }
        setPlayerState(prev => ({ ...prev, currentQuality: qualityId }));
        resetControlsTimer();
    }, [resetControlsTimer]);

    const changeSubtitle = useCallback((subtitleId: string) => {
        if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
            if (subtitleId === '') {
                shakaPlayerRef.current.setTextTrackVisibility(false);
            } else {
                const track = shakaPlayerRef.current.getTextTracks().find((t: any) => t.id.toString() === subtitleId);
                if (track) {
                    shakaPlayerRef.current.selectTextTrack(track);
                    shakaPlayerRef.current.setTextTrackVisibility(true);
                }
            }
        }
        setPlayerState(prev => ({ ...prev, currentSubtitle: subtitleId }));
        resetControlsTimer();
    }, [resetControlsTimer]);
    
    const changePlaybackRate = useCallback((rate: number) => {
        if (videoRef.current) {
            videoRef.current.playbackRate = rate;
            setPlayerState(prev => ({ ...prev, playbackRate: rate, showSettings: false }));
        }
        resetControlsTimer();
    }, [resetControlsTimer]);

    const changeAudioTrack = useCallback((trackId: string | number) => {
        if (playerTypeRef.current === 'hls' && hlsRef.current) hlsRef.current.audioTrack = Number(trackId);
        else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) shakaPlayerRef.current.selectAudioLanguage(trackId as string);
        setPlayerState(prev => ({ ...prev, currentAudioTrack: trackId.toString() }));
        resetControlsTimer();
    }, [resetControlsTimer]);

    // --- Seeking / Progress Bar Handlers ---
    const calculateNewTime = useCallback((clientX: number) => {
        const progressBar = progressRef.current;
        const duration = videoRef.current?.duration;
        if (!progressBar || !duration || !isFinite(duration)) return null;
        const rect = progressBar.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return percentage * duration;
    }, []);

    const handleProgressClick = useCallback((e: React.MouseEvent) => {
        const newTime = calculateNewTime(e.clientX);
        if (newTime !== null && videoRef.current) videoRef.current.currentTime = newTime;
        resetControlsTimer();
    }, [calculateNewTime, resetControlsTimer]);
    
    const handleDragStart = useCallback((e: React.MouseEvent) => {
        const video = videoRef.current;
        if (!video || !isFinite(video.duration)) return;
        e.stopPropagation();
        isDraggingRef.current = true;
        wasPlayingBeforeSeekRef.current = !video.paused;
        setPlayerState(prev => ({ ...prev, isSeeking: true }));
        if(wasPlayingBeforeSeekRef.current) video.pause();
    }, []);

    const handleDragMove = useCallback((e: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const newTime = calculateNewTime(e.clientX);
        if (newTime !== null) {
            setPlayerState(prev => ({ ...prev, currentTime: newTime }));
            seekTimeRef.current = newTime;
        }
    }, [calculateNewTime]);

    const handleDragEnd = useCallback(() => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        const video = videoRef.current;
        if (video) {
            video.currentTime = seekTimeRef.current;
            if (wasPlayingBeforeSeekRef.current) video.play().catch(console.error);
        }
        setPlayerState(prev => ({ ...prev, isSeeking: false }));
        resetControlsTimer();
    }, [resetControlsTimer]);

    // **MODIFIED** This function now toggles controls visibility
    const handlePlayerClick = useCallback(() => {
        if (isDraggingRef.current) return;
        
        setPlayerState(prev => {
            const newShowControls = !prev.showControls;
            if (newShowControls) {
                // If we are showing controls, start the hide timer
                startControlsTimer();
            } else if (controlsTimeoutRef.current) {
                // If we are hiding them manually, clear the timer
                clearTimeout(controlsTimeoutRef.current);
            }
            return { ...prev, showControls: newShowControls };
        });
    }, [startControlsTimer]);

    // --- Effects ---
    useEffect(() => {
        isMountedRef.current = true;
        initializePlayer();
        return () => {
            isMountedRef.current = false;
            destroyPlayer();
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        };
    }, [streamUrl]); // Removed initializePlayer, destroyPlayer as they are stable

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlers = {
            play: () => isMountedRef.current && setPlayerState(p => ({ ...p, isPlaying: true })),
            pause: () => isMountedRef.current && setPlayerState(p => ({ ...p, isPlaying: false })),
            waiting: () => isMountedRef.current && setPlayerState(p => ({ ...p, isLoading: true })),
            playing: () => isMountedRef.current && setPlayerState(p => ({ ...p, isLoading: false })),
            timeupdate: () => {
                if (!isMountedRef.current || playerState.isSeeking) return;
                setPlayerState(p => ({ ...p, currentTime: video.currentTime, duration: video.duration || 0, buffered: video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0 }));
            },
            volumechange: () => isMountedRef.current && setPlayerState(p => ({ ...p, isMuted: video.muted })),
            enterpictureinpicture: () => isMountedRef.current && setPlayerState(p => ({ ...p, isPipActive: true })),
            leavepictureinpicture: () => isMountedRef.current && setPlayerState(p => ({ ...p, isPipActive: false })),
        };
        const fullscreenchange = () => isMountedRef.current && setPlayerState(p => ({ ...p, isFullscreen: !!document.fullscreenElement }));
        
        Object.entries(handlers).forEach(([event, handler]) => video.addEventListener(event, handler));
        document.addEventListener('fullscreenchange', fullscreenchange);

        return () => {
            Object.entries(handlers).forEach(([event, handler]) => video.removeEventListener(event, handler));
            document.removeEventListener('fullscreenchange', fullscreenchange);
        };
    }, [playerState.isSeeking]);
    
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
            <div className={`w-full h-full bg-black flex items-center justify-center text-white ${className}`}>
                <div className="text-center p-6">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-500" />
                    <p className="font-medium mb-2">Stream Error</p>
                    <p className="text-sm text-gray-400 mb-4">{playerState.error}</p>
                    <button onClick={handleRetry} className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors">
                        <RotateCcw size={14} /> Retry
                    </button>
                </div>
            </div>
        );
    }
    
    const progressPercentage = isFinite(playerState.duration) ? (playerState.currentTime / playerState.duration) * 100 : 0;

    return (
        <div 
            ref={containerRef} 
            className={`relative bg-black w-full h-full group ${className}`} 
            onMouseMove={resetControlsTimer} 
            onMouseLeave={() => controlsTimeoutRef.current && clearTimeout(controlsTimeoutRef.current)}
            onClick={handlePlayerClick} // **MODIFIED** Main click handler here
        >
            <video 
                ref={videoRef} 
                className="w-full h-full object-contain" 
                playsInline 
                onDoubleClick={toggleFullscreen} 
                // **REMOVED** onClick from video to prevent double-firing
            />
            
            {playerState.isLoading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center" onClick={e => e.stopPropagation()}>
                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                </div>
            )}
            
            <div 
                className={`absolute inset-0 transition-opacity duration-300 ${playerState.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={e => e.stopPropagation()} // Stop propagation to prevent container click handler from firing
            >
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30"></div>
                
                {/* Top Controls */}
                <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center">
                    <h1 className="text-white font-semibold text-lg drop-shadow-md">{channelName}</h1>
                    {(playerState.availableQualities.length > 0 || playerState.availableSubtitles.length > 0 || playerState.availableAudioTracks.length > 1) && (
                        <button onClick={() => setPlayerState(prev => ({ ...prev, showSettings: true }))} className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/80 transition-all" title="Settings">
                            <Settings size={20} />
                        </button>
                    )}
                </div>

                {/* Center Play Button */}
                {!playerState.isPlaying && !playerState.isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <button onClick={togglePlay} className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all">
                            <Play size={32} fill="white" className="ml-1" />
                        </button>
                    </div>
                )}
                
                {/* Bottom Controls */}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                    {/* Progress Bar */}
                    <div ref={progressRef} className="relative h-4 -my-2 cursor-pointer" onClick={handleProgressClick}>
                        <div className="absolute top-1/2 -translate-y-1/2 w-full h-1 bg-white/30 rounded-full">
                            <div className="absolute h-full bg-white/50 rounded-full" style={{ width: `${isFinite(playerState.duration) ? (playerState.buffered / playerState.duration) * 100 : 0}%` }}/>
                            <div className="absolute h-full bg-red-500 rounded-full" style={{ width: `${progressPercentage}%` }}/>
                            <div
                                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full transition-transform ${playerState.isSeeking ? 'scale-150' : 'group-hover:scale-125'}`}
                                style={{ left: `${progressPercentage}%` }}
                                onMouseDown={handleDragStart}
                            />
                        </div>
                    </div>

                    {/* Buttons and Time */}
                    <div className="flex items-center gap-4 mt-3 text-white">
                        <button onClick={togglePlay} className="p-1">{playerState.isPlaying ? <Pause size={24} /> : <Play size={24} />}</button>
                        <button onClick={toggleMute} className="p-1">{playerState.isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}</button>
                        {isFinite(playerState.duration) && (
                            <div className="text-sm font-mono">{formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}</div>
                        )}
                        <div className="flex-grow" />
                        {document.pictureInPictureEnabled && <button onClick={togglePip} className="p-1"><PictureInPicture2 size={20} /></button>}
                        <button onClick={toggleFullscreen} className="p-1">{playerState.isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}</button>
                    </div>
                </div>
            </div>

            {/* Settings Drawer */}
            <Drawer open={playerState.showSettings} onOpenChange={(isOpen) => setPlayerState(prev => ({ ...prev, showSettings: isOpen }))}>
                <DrawerContent className="bg-black/90 border-t border-white/20 text-white outline-none" onClick={e => e.stopPropagation()}>
                    <DrawerHeader><DrawerTitle className="text-center">Settings</DrawerTitle></DrawerHeader>
                    <div className="p-4 overflow-y-auto" style={{ maxHeight: '60vh' }}>
                        <Accordion type="single" collapsible className="w-full max-w-md mx-auto">
                            {playerState.availableQualities.length > 0 && (
                                <AccordionItem value="quality">
                                    <AccordionTrigger className="hover:no-underline">Quality</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="space-y-1 pt-2">
                                            <button onClick={() => changeQuality(-1)} className={`w-full text-left p-2 rounded ${playerState.currentQuality === -1 ? 'bg-blue-600' : 'hover:bg-white/10'}`}>Auto</button>
                                            {playerState.availableQualities.map(q => <button key={q.id} onClick={() => changeQuality(q.id)} className={`w-full text-left p-2 rounded ${playerState.currentQuality === q.id ? 'bg-blue-600' : 'hover:bg-white/10'}`}>{q.height}p</button>)}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            )}
                            {playerState.availableSubtitles.length > 0 && (
                                <AccordionItem value="subtitles">
                                    <AccordionTrigger className="hover:no-underline">Subtitles</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="space-y-1 pt-2">
                                            <button onClick={() => changeSubtitle('')} className={`w-full text-left p-2 rounded ${playerState.currentSubtitle === '' ? 'bg-blue-600' : 'hover:bg-white/10'}`}>Off</button>
                                            {playerState.availableSubtitles.map(s => <button key={s.id} onClick={() => changeSubtitle(s.id)} className={`w-full text-left p-2 rounded ${playerState.currentSubtitle === s.id ? 'bg-blue-600' : 'hover:bg-white/10'}`}>{s.label}</button>)}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            )}
                            {playerState.availableAudioTracks.length > 1 && (
                                <AccordionItem value="audio">
                                    <AccordionTrigger className="hover:no-underline">Audio</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="space-y-1 pt-2">
                                            {playerState.availableAudioTracks.map(track => <button key={track.id} onClick={() => changeAudioTrack(track.id)} className={`w-full text-left p-2 rounded ${playerState.currentAudioTrack === track.id.toString() ? 'bg-blue-600' : 'hover:bg-white/10'}`}>{track.label}</button>)}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            )}
                            <AccordionItem value="playback-speed">
                                <AccordionTrigger className="hover:no-underline">Playback Speed</AccordionTrigger>
                                <AccordionContent>
                                    <div className="space-y-1 pt-2">
                                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => <button key={speed} onClick={() => changePlaybackRate(speed)} className={`w-full text-left p-2 rounded ${playerState.playbackRate === speed ? 'bg-blue-600' : 'hover:bg-white/10'}`}>{speed === 1 ? 'Normal' : `${speed}x`}</button>)}
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


