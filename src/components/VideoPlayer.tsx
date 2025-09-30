import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2,
    AlertCircle, RotateCcw, Settings, PictureInPicture2
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

    // --- Player Initialization and Detection ---
    const detectStreamType = useCallback((url: string): { type: 'hls' | 'dash' | 'native'; cleanUrl: string; drmInfo?: any } => {
        let cleanUrl = url;
        let drmInfo = null;
        if (url.includes('?|')) {
            const [baseUrl, drmParams] = url.split('?|');
            cleanUrl = baseUrl;
            const params = new URLSearchParams(drmParams);
            const drmScheme = params.get('drmScheme');
            const drmLicense = params.get('drmLicense');
            if (drmScheme && drmLicense) {
                drmInfo = { scheme: drmScheme, license: drmLicense };
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
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        playerTypeRef.current = null;
    }, []);
    
    // --- Controls Visibility Logic ---
    const startControlsTimer = useCallback(() => {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        if (playerState.isPlaying) {
            controlsTimeoutRef.current = setTimeout(() => {
                if (isMountedRef.current) {
                    setPlayerState(prev => ({ ...prev, showControls: false }));
                }
            }, CONTROLS_HIDE_DELAY);
        }
    }, [playerState.isPlaying]);

    const handleMouseMove = useCallback(() => {
        setPlayerState(prev => {
            if (!prev.showControls) {
                startControlsTimer();
                return { ...prev, showControls: true };
            }
            startControlsTimer();
            return prev;
        });
    }, [startControlsTimer]);

    const handlePlayerClick = useCallback(() => {
        setPlayerState(prev => {
            const newShowControls = !prev.showControls;
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
            if (newShowControls && prev.isPlaying) {
                startControlsTimer();
            }
            return { ...prev, showControls: newShowControls };
        });
    }, [startControlsTimer]);

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
        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
            if (!isMountedRef.current) return;
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            const levels: QualityLevel[] = hls.levels.map((l, i) => ({ height: l.height, bitrate: Math.round(l.bitrate / 1000), id: i }));
            const audioTracks: AudioTrack[] = hls.audioTracks.map(t => ({ id: t.id, label: t.name || t.lang, language: t.lang }));
            video.muted = muted;
            if (autoPlay) video.play().catch(console.warn);
            setPlayerState(p => ({ ...p, isLoading: false, availableQualities: levels, availableAudioTracks: audioTracks, currentAudioTrack: hls.audioTrack.toString() }));
            handleMouseMove();
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
            if (isMountedRef.current && data.fatal) {
                setPlayerState(p => ({ ...p, isLoading: false, error: `HLS Error: ${data.details}` }));
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
        if (drmInfo?.scheme === 'clearkey' && drmInfo.license?.includes(':')) {
            const [keyId, key] = drmInfo.license.split(':');
            player.configure({ drm: { clearKeys: { [keyId]: key } } });
        }
        player.addEventListener('error', (event: any) => {
            console.error('Shaka Player Error:', event.detail);
            setPlayerState(p => ({ ...p, isLoading: false, error: `Stream error (${event.detail.code})` }));
        });
        await player.load(url);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        const qualities: QualityLevel[] = player.getVariantTracks().map((t: any) => ({ height: t.height, bitrate: Math.round(t.bandwidth / 1000), id: t.id }));
        const subtitles: SubtitleTrack[] = player.getTextTracks().map((t: any) => ({ id: t.id.toString(), label: t.label || t.language, language: t.language }));
        const audioTracks: AudioTrack[] = player.getAudioLanguagesAndRoles().map((t: any) => ({ id: t.language, label: t.language, language: t.language }));
        video.muted = muted;
        if (autoPlay) video.play().catch(console.warn);
        setPlayerState(p => ({ ...p, isLoading: false, availableQualities: qualities, availableSubtitles: subtitles, availableAudioTracks: audioTracks, currentAudioTrack: player.getAudioLanguages()[0] || '' }));
        handleMouseMove();
    };

    const initNativePlayer = (url: string, video: HTMLVideoElement) => {
        video.src = url;
        const onLoaded = () => {
            if (!isMountedRef.current) return;
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            video.muted = muted;
            if (autoPlay) video.play().catch(console.warn);
            setPlayerState(p => ({ ...p, isLoading: false }));
            handleMouseMove();
        };
        video.addEventListener('loadedmetadata', onLoaded, { once: true });
    };

    const initializePlayer = useCallback(async () => {
        if (!streamUrl || !videoRef.current) return;
        destroyPlayer();
        setPlayerState(prev => ({ ...prev, isLoading: true, error: null }));
        loadingTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
                setPlayerState(p => ({ ...p, isLoading: false, error: "Stream took too long to load." }));
            }
        }, PLAYER_LOAD_TIMEOUT);
        try {
            const { type, cleanUrl, drmInfo } = detectStreamType(streamUrl);
            playerTypeRef.current = type;
            if (type === 'dash') await initShakaPlayer(cleanUrl, videoRef.current, drmInfo);
            else if (type === 'hls') await initHlsPlayer(cleanUrl, videoRef.current);
            else initNativePlayer(cleanUrl, videoRef.current);
        } catch (error) {
            setPlayerState(p => ({ ...p, isLoading: false, error: error instanceof Error ? error.message : 'Player initialization failed' }));
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
    const togglePlay = useCallback(() => { const v = videoRef.current; if (v) v.paused ? v.play() : v.pause(); }, []);
    const toggleMute = useCallback(() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }, []);
    const toggleFullscreen = useCallback(async () => {
        const c = containerRef.current; if (!c) return;
        document.fullscreenElement ? await document.exitFullscreen() : await c.requestFullscreen();
    }, []);
    const togglePip = useCallback(async () => {
        const v = videoRef.current; if (!v || !document.pictureInPictureEnabled) return;
        document.pictureInPictureElement ? await document.exitPictureInPicture() : await v.requestPictureInPicture();
    }, []);
    
    // Settings Handlers
    const changeQuality = useCallback((id: number) => {
        if (playerTypeRef.current === 'hls' && hlsRef.current) hlsRef.current.currentLevel = id;
        else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
            shakaPlayerRef.current.configure({ abr: { enabled: id === -1 } });
            if (id !== -1) {
                const track = shakaPlayerRef.current.getVariantTracks().find((t: any) => t.id === id);
                if (track) shakaPlayerRef.current.selectVariantTrack(track, true);
            }
        }
        setPlayerState(p => ({ ...p, currentQuality: id }));
    }, []);

    const changeSubtitle = useCallback((id: string) => {
        if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
            shakaPlayerRef.current.setTextTrackVisibility(id !== '');
            if (id !== '') {
                const track = shakaPlayerRef.current.getTextTracks().find((t: any) => t.id.toString() === id);
                if (track) shakaPlayerRef.current.selectTextTrack(track);
            }
        }
        setPlayerState(p => ({ ...p, currentSubtitle: id }));
    }, []);
    
    const changePlaybackRate = useCallback((rate: number) => {
        if (videoRef.current) videoRef.current.playbackRate = rate;
        setPlayerState(p => ({ ...p, playbackRate: rate, showSettings: false }));
    }, []);

    const changeAudioTrack = useCallback((id: string | number) => {
        if (playerTypeRef.current === 'hls' && hlsRef.current) hlsRef.current.audioTrack = Number(id);
        else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) shakaPlayerRef.current.selectAudioLanguage(id as string);
        setPlayerState(p => ({ ...p, currentAudioTrack: id.toString() }));
    }, []);

    // --- Seeking / Progress Bar Handlers ---
    const calculateNewTime = useCallback((clientX: number) => {
        const bar = progressRef.current; const dur = videoRef.current?.duration;
        if (!bar || !dur || !isFinite(dur)) return null;
        const rect = bar.getBoundingClientRect();
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * dur;
    }, []);

    const handleProgressClick = useCallback((e: React.MouseEvent) => {
        const newTime = calculateNewTime(e.clientX);
        if (newTime !== null && videoRef.current) videoRef.current.currentTime = newTime;
    }, [calculateNewTime]);
    
    const handleDragStart = useCallback((e: React.MouseEvent) => {
        e.stopPropagation(); if (!videoRef.current || !isFinite(videoRef.current.duration)) return;
        isDraggingRef.current = true; wasPlayingBeforeSeekRef.current = !videoRef.current.paused;
        setPlayerState(p => ({ ...p, isSeeking: true })); if (wasPlayingBeforeSeekRef.current) videoRef.current.pause();
    }, []);

    const handleDragMove = useCallback((e: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const newTime = calculateNewTime(e.clientX);
        if (newTime !== null) {
            if (videoRef.current) videoRef.current.currentTime = newTime;
            seekTimeRef.current = newTime;
        }
    }, [calculateNewTime]);

    const handleDragEnd = useCallback(() => {
        if (!isDraggingRef.current) return; isDraggingRef.current = false;
        if (videoRef.current && wasPlayingBeforeSeekRef.current) videoRef.current.play().catch(console.error);
        setPlayerState(p => ({ ...p, isSeeking: false }));
    }, []);

    // --- Effects ---
    useEffect(() => { isMountedRef.current = true; initializePlayer(); return () => { isMountedRef.current = false; destroyPlayer(); }; }, [initializePlayer, destroyPlayer]);

    useEffect(() => {
        const v = videoRef.current; if (!v) return;
        const handlers = {
            play: () => setPlayerState(p => ({ ...p, isPlaying: true })), pause: () => setPlayerState(p => ({ ...p, isPlaying: false })),
            waiting: () => setPlayerState(p => ({ ...p, isLoading: true })), playing: () => setPlayerState(p => ({ ...p, isLoading: false })),
            timeupdate: () => { if (!playerState.isSeeking) setPlayerState(p => ({ ...p, currentTime: v.currentTime, duration: v.duration || 0, buffered: v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0 })); },
            volumechange: () => setPlayerState(p => ({ ...p, isMuted: v.muted })),
            enterpictureinpicture: () => setPlayerState(p => ({ ...p, isPipActive: true })),
            leavepictureinpicture: () => setPlayerState(p => ({ ...p, isPipActive: false })),
        };
        const onFsChange = () => setPlayerState(p => ({ ...p, isFullscreen: !!document.fullscreenElement }));
        Object.entries(handlers).forEach(([e, h]) => v.addEventListener(e, h));
        document.addEventListener('fullscreenchange', onFsChange);
        return () => { Object.entries(handlers).forEach(([e, h]) => v.removeEventListener(e, h)); document.removeEventListener('fullscreenchange', onFsChange); };
    }, [playerState.isSeeking]);
    
    useEffect(() => {
        document.addEventListener('mousemove', handleDragMove); document.addEventListener('mouseup', handleDragEnd);
        return () => { document.removeEventListener('mousemove', handleDragMove); document.removeEventListener('mouseup', handleDragEnd); };
    }, [handleDragMove, handleDragEnd]);
    
    // --- Render Logic ---
    if (playerState.error && !playerState.isLoading) { /* Error UI */ }
    const progressPercentage = isFinite(playerState.duration) ? (playerState.currentTime / playerState.duration) * 100 : 0;

    return (
        <div ref={containerRef} className={`relative bg-black w-full h-full group ${className}`} onMouseMove={handleMouseMove} onClick={handlePlayerClick}>
            <video ref={videoRef} className="w-full h-full object-contain" playsInline onDoubleClick={toggleFullscreen} />
            
            {playerState.isLoading && (<div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none"><Loader2 className="w-10 h-10 text-white animate-spin" /></div>)}
            
            <div className={`absolute inset-0 transition-opacity duration-300 ${playerState.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={e => e.stopPropagation()}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-none"></div>
                
                <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center">
                    <h1 className="text-white font-semibold text-lg drop-shadow-md">{channelName}</h1>
                    {(playerState.availableQualities.length > 0 || playerState.availableSubtitles.length > 0 || playerState.availableAudioTracks.length > 1) && (
                        <button onClick={() => setPlayerState(prev => ({ ...prev, showSettings: true }))} className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/80" title="Settings"><Settings size={20} /></button>
                    )}
                </div>

                {!playerState.isPlaying && !playerState.isLoading && !playerState.error && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <button onClick={togglePlay} className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30"><Play size={32} fill="white" className="ml-1" /></button>
                    </div>
                )}
                
                <div className="absolute bottom-0 left-0 right-0 p-4">
                    <div ref={progressRef} className="relative h-4 -my-2 cursor-pointer" onClick={handleProgressClick} onMouseDown={handleDragStart}>
                        <div className="absolute top-1/2 -translate-y-1/2 w-full h-1 bg-white/30 rounded-full">
                            <div className="absolute h-full bg-white/50 rounded-full" style={{ width: `${isFinite(playerState.duration) ? (playerState.buffered / playerState.duration) * 100 : 0}%` }}/>
                            <div className="absolute h-full bg-red-500 rounded-full" style={{ width: `${progressPercentage}%` }}/>
                            <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full transition-transform ${isDraggingRef.current ? 'scale-150' : 'group-hover:scale-125'}`} style={{ left: `${progressPercentage}%` }}/>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-white">
                        <button onClick={togglePlay} className="p-1">{playerState.isPlaying ? <Pause size={24} /> : <Play size={24} />}</button>
                        <button onClick={toggleMute} className="p-1">{playerState.isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}</button>
                        {isFinite(playerState.duration) && (<div className="text-sm font-mono">{formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}</div>)}
                        <div className="flex-grow" />
                        {document.pictureInPictureEnabled && <button onClick={togglePip} className="p-1"><PictureInPicture2 size={20} /></button>}
                        <button onClick={toggleFullscreen} className="p-1">{playerState.isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}</button>
                    </div>
                </div>
            </div>

            <Drawer open={playerState.showSettings} onOpenChange={(isOpen) => setPlayerState(prev => ({ ...prev, showSettings: isOpen }))}>
                <DrawerContent className="bg-black/90 border-t border-white/20 text-white outline-none" onClick={e => e.stopPropagation()}>
                    <DrawerHeader><DrawerTitle className="text-center">Settings</DrawerTitle></DrawerHeader>
                    <div className="p-4 overflow-y-auto max-h-[60vh]">
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


