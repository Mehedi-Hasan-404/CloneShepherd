// /src/components/VideoPlayer.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { toast } from 'sonner';
import Hls from 'hls.js';
import { ChevronLeft, Settings, X, Play, Pause, Volume2, VolumeX, Maximize, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';

// Define interfaces (assuming these are the same as before)
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

// Define player state interface (assuming these are the same as before)
interface PlayerState {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  isFullscreen: boolean;
  isLandscape: boolean;
  isSettingsOpen: boolean;
  isChannelInfoOpen: boolean;
  isQualityMenuOpen: boolean;
  isSubtitleMenuOpen: boolean;
  isSpeedMenuOpen: boolean;
  isVolumeSliderOpen: boolean;
  isProgressDragging: boolean;
  isControlsVisible: boolean;
  currentQuality: string;
  currentSubtitle: string | null;
  playbackSpeed: number;
  availableQualities: QualityLevel[];
  availableSubtitles: SubtitleTrack[];
  progress: number;
  duration: number;
  buffered: number;
  error: string | null;
  loading: boolean;
  isSeeking: boolean;
}

// Define default state (assuming these are the same as before)
const DEFAULT_STATE: PlayerState = {
  isPlaying: false,
  isMuted: false,
  volume: 1,
  isFullscreen: false,
  isLandscape: false,
  isSettingsOpen: false,
  isChannelInfoOpen: false,
  isQualityMenuOpen: false,
  isSubtitleMenuOpen: false,
  isSpeedMenuOpen: false,
  isVolumeSliderOpen: false,
  isProgressDragging: false,
  isControlsVisible: true,
  currentQuality: 'auto',
  currentSubtitle: null,
  playbackSpeed: 1,
  availableQualities: [],
  availableSubtitles: [],
  progress: 0,
  duration: 0,
  buffered: 0,
  error: null,
  loading: true,
  isSeeking: false,
};

const PLAYER_LOAD_TIMEOUT = 15000;
const CONTROLS_HIDE_DELAY = 4000;

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamUrl: initialStreamUrl,
  channelName: initialChannelName,
  autoPlay = true,
  muted = false,
  className = "",
}) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const playerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [playerState, setPlayerState] = useState<PlayerState>(DEFAULT_STATE);
  const [channel, setChannel] = useState<{ name: string; logoUrl: string } | null>(null);

  // Fetch channel details if ID is provided
  useEffect(() => {
    const fetchChannelDetails = async () => {
      if (id) {
        try {
          const docRef = doc(db, 'channels', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setChannel({
              name: data.name || initialChannelName,
              logoUrl: data.logoUrl || '/placeholder.svg',
            });
          } else {
            setChannel({ name: initialChannelName, logoUrl: '/placeholder.svg' });
          }
        } catch (error) {
          console.error('Error fetching channel details:', error);
          setChannel({ name: initialChannelName, logoUrl: '/placeholder.svg' });
        }
      } else {
        setChannel({ name: initialChannelName, logoUrl: '/placeholder.svg' });
      }
    };

    fetchChannelDetails();
  }, [id, initialChannelName]);

  // Handle orientation change
  useEffect(() => {
    const handleOrientationChange = () => {
      const isLandscape = window.innerHeight < window.innerWidth;
      setPlayerState(prev => ({ ...prev, isLandscape }));
    };

    handleOrientationChange(); // Check initial orientation
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);

  // Initialize player
  useEffect(() => {
    const initializePlayer = async () => {
      if (!videoRef.current) return;

      const video = videoRef.current;
      video.muted = muted;

      // Clear any previous instances
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      try {
        if (Hls.isSupported()) {
          const hls = new Hls();
          hlsRef.current = hls;

          hls.loadSource(initialStreamUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setPlayerState(prev => ({ ...prev, availableQualities: hls.levels.map((level, i) => ({ ...level, id: i })) }));
            setPlayerState(prev => ({ ...prev, loading: false }));
            if (autoPlay) {
              video.play().catch(e => console.error("Autoplay failed:", e));
            }
          });

          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  setPlayerState(prev => ({ ...prev, error: 'Network error' }));
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  setPlayerState(prev => ({ ...prev, error: 'Media error' }));
                  hls.recoverMediaError();
                  break;
                default:
                  setPlayerState(prev => ({ ...prev, error: 'Fatal error' }));
                  break;
              }
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = initialStreamUrl;
          video.addEventListener('loadedmetadata', () => {
            setPlayerState(prev => ({ ...prev, loading: false }));
            if (autoPlay) {
              video.play().catch(e => console.error("Autoplay failed:", e));
            }
          });
        } else {
          setPlayerState(prev => ({ ...prev, error: 'HLS is not supported in this browser' }));
        }
      } catch (error) {
        console.error("Error initializing player:", error);
        setPlayerState(prev => ({ ...prev, error: 'Failed to initialize player' }));
      }
    };

    initializePlayer();

    // Cleanup on unmount
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (playerTimeoutRef.current) clearTimeout(playerTimeoutRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [initialStreamUrl, autoPlay, muted]);

  // Update progress
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    const updateProgress = () => {
      if (playerState.isProgressDragging || playerState.isSeeking) return;

      setPlayerState(prev => ({
        ...prev,
        progress: video.currentTime,
        duration: video.duration || 0,
        buffered: video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0,
      }));
    };

    progressIntervalRef.current = setInterval(updateProgress, 1000);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [playerState.isProgressDragging, playerState.isSeeking]);

  // Handle controls visibility timeout
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setPlayerState(prev => ({ ...prev, isControlsVisible: true }));

    if (playerState.isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setPlayerState(prev => ({ ...prev, isControlsVisible: false }));
      }, CONTROLS_HIDE_DELAY);
    }
  }, [playerState.isPlaying]);

  // Event handlers
  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setPlayerState(prev => ({ ...prev, isPlaying: true }));
      } else {
        videoRef.current.pause();
        setPlayerState(prev => ({ ...prev, isPlaying: false }));
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !playerState.isMuted;
      setPlayerState(prev => ({ ...prev, isMuted: !prev.isMuted }));
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setPlayerState(prev => ({ ...prev, volume: newVolume }));
      if (newVolume === 0 && !playerState.isMuted) {
        setPlayerState(prev => ({ ...prev, isMuted: true }));
      } else if (newVolume > 0 && playerState.isMuted) {
        setPlayerState(prev => ({ ...prev, isMuted: false }));
      }
    }
  };

  const handleSeek = (value: number[]) => {
    const newTime = value[0];
    setPlayerState(prev => ({ ...prev, progress: newTime, isSeeking: true }));
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const handleSeekEnd = () => {
    setPlayerState(prev => ({ ...prev, isSeeking: false }));
  };

  const changeQuality = (qualityId: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = qualityId;
      const quality = playerState.availableQualities.find(q => q.id === qualityId);
      if (quality) {
        setPlayerState(prev => ({ ...prev, currentQuality: `${quality.height}p` }));
      }
    }
    setPlayerState(prev => ({ ...prev, isQualityMenuOpen: false, isSettingsOpen: false })); // Close menus after selection
  };

  const changeSubtitle = (subtitleId: string) => {
    // Assuming subtitle handling via textTracks or external logic
    // This is a simplified example
    setPlayerState(prev => ({ ...prev, currentSubtitle: subtitleId }));
    setPlayerState(prev => ({ ...prev, isSubtitleMenuOpen: false, isSettingsOpen: false })); // Close menus after selection
  };

  const changeSpeed = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlayerState(prev => ({ ...prev, playbackSpeed: speed }));
    }
    setPlayerState(prev => ({ ...prev, isSpeedMenuOpen: false, isSettingsOpen: false })); // Close menus after selection
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const openSettings = () => {
    setPlayerState(prev => ({ ...prev, isSettingsOpen: true }));
  };

  const closeSettings = () => {
    setPlayerState(prev => ({ ...prev, isSettingsOpen: false }));
  };

  // Determine if we are in landscape mode for the new layout
  const isLandscapeFlat = playerState.isLandscape && playerState.isSettingsOpen;

  return (
    <div className={`relative w-full h-full bg-black ${playerState.isLandscape ? 'landscape-mode' : ''} ${className}`}>
      {playerState.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900 text-white p-4">
          <div className="text-center">
            <p className="text-lg font-semibold">Error</p>
            <p className="text-sm">{playerState.error}</p>
            <Button onClick={() => window.location.reload()} className="mt-4">Reload Player</Button>
          </div>
        </div>
      )}

      {playerState.loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-white text-center">
            <p>Loading stream...</p>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onClick={resetControlsTimeout}
        onMouseMove={resetControlsTimeout}
      />

      {/* Controls Overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-between pointer-events-none transition-opacity duration-300 ${
          playerState.isControlsVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onMouseMove={resetControlsTimeout}
        onMouseLeave={() => {
          if (playerState.isPlaying) {
            controlsTimeoutRef.current = setTimeout(() => {
              setPlayerState(prev => ({ ...prev, isControlsVisible: false }));
            }, CONTROLS_HIDE_DELAY);
          }
        }}
      >
        {/* Top Controls */}
        <div className="flex justify-between items-start p-4 pointer-events-auto">
          <Button
            variant="ghost"
            size="icon"
            className="text-white bg-black/50 hover:bg-black/75"
            onClick={() => navigate(-1)}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div className="text-white bg-black/50 px-3 py-1 rounded-lg">
            <h2 className="text-xl font-bold truncate max-w-[70vw]">{channel?.name || initialChannelName}</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-white bg-black/50 hover:bg-black/75"
            onClick={openSettings}
          >
            <Settings className="h-6 w-6" />
          </Button>
        </div>

        {/* Center Controls */}
        <div className="flex justify-center items-center mb-8">
          {!playerState.isPlaying && (
            <Button
              variant="secondary"
              size="icon"
              className="h-16 w-16 rounded-full bg-white/80 text-black hover:bg-white"
              onClick={togglePlay}
            >
              <Play className="h-8 w-8 ml-1" />
            </Button>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="p-4">
          {/* Progress Bar */}
          <div className="mb-2">
            <Slider
              value={[playerState.progress]}
              max={playerState.duration || 100}
              step={1}
              onValueChange={handleSeek}
              onValueCommit={handleSeekEnd}
              className="w-full"
            />
            <div className="flex justify-between text-white text-xs mt-1">
              <span>{new Date(playerState.progress * 1000).toISOString().substr(11, 8)}</span>
              <span>{new Date(playerState.duration * 1000).toISOString().substr(11, 8)}</span>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white bg-black/50 hover:bg-black/75"
                onClick={togglePlay}
              >
                {playerState.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white bg-black/50 hover:bg-black/75"
                onClick={toggleMute}
              >
                {playerState.isMuted || playerState.volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </Button>
              <div className="w-20">
                <Slider
                  value={[playerState.volume]}
                  max={1}
                  step={0.01}
                  onValueChange={handleVolumeChange}
                  className="w-full"
                />
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-white bg-black/50 hover:bg-black/75"
              onClick={toggleFullscreen}
            >
              <Maximize className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {/* Use Drawer for portrait, Dialog for landscape with flat layout */}
      {!isLandscapeFlat ? (
        <Drawer open={playerState.isSettingsOpen} onOpenChange={closeSettings}>
          <DrawerContent className={`max-h-[80vh] ${playerState.isLandscape ? 'landscape-drawer' : ''}`}>
            <DrawerHeader className={`p-4 ${playerState.isLandscape ? 'landscape-header' : ''}`}>
              <DrawerTitle className={`text-lg font-semibold ${playerState.isLandscape ? 'text-xl' : ''}`}>Settings</DrawerTitle>
            </DrawerHeader>
            <div className={`p-4 overflow-y-auto transition-all duration-300 ${playerState.isLandscape ? 'landscape-settings' : ''}`} style={{ maxHeight: playerState.isLandscape ? '80vh' : '50vh' }}>
              {/* Accordion structure remains here for portrait */}
              {/* ... (Keep the existing Accordion code from the original file) ... */}
              {/* Example Accordion structure for portrait (simplified) */}
              <div className="space-y-4">
                {playerState.availableQualities.length > 0 && (
                  <div>
                    <h3 className="text-white text-base font-medium mb-2">Quality</h3>
                    <div className="space-y-1">
                      {playerState.availableQualities.map((quality) => (
                        <button
                          key={quality.id}
                          onClick={() => changeQuality(quality.id)}
                          className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                            playerState.currentQuality === `${quality.height}p`
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          {quality.height}p
                        </button>
                      ))}
                      <button
                        onClick={() => changeQuality(-1)} // -1 for auto
                        className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                          playerState.currentQuality === 'auto'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        Auto
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-white text-base font-medium mb-2">Subtitles</h3>
                  <div className="space-y-1">
                    <button
                      onClick={() => changeSubtitle('off')}
                      className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                        playerState.currentSubtitle === 'off' || playerState.currentSubtitle === null
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      Off
                    </button>
                    {playerState.availableSubtitles.map((subtitle) => (
                      <button
                        key={subtitle.id}
                        onClick={() => changeSubtitle(subtitle.id)}
                        className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                          playerState.currentSubtitle === subtitle.id
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        {subtitle.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-white text-base font-medium mb-2">Playback Speed</h3>
                  <div className="space-y-1">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => changeSpeed(speed)}
                        className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                          playerState.playbackSpeed === speed
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        // Flat Settings List for Landscape Mode
        <Dialog open={playerState.isSettingsOpen} onOpenChange={closeSettings}>
          <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto p-0">
            <div className="p-4 border-b border-border">
              <DialogTitle className="text-lg font-semibold">Settings</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-4 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
                onClick={closeSettings}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4">
              {/* Quality Setting */}
              {playerState.availableQualities.length > 0 && (
                <div
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent cursor-pointer"
                  onClick={() => setPlayerState(prev => ({ ...prev, isQualityMenuOpen: true }))}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-full bg-blue-500/10">
                      <div className="w-4 h-4 bg-blue-500 rounded-sm"></div>
                    </div>
                    <span className="font-medium">Quality</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">{playerState.currentQuality}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              )}

              {/* Subtitles Setting */}
              <div
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent cursor-pointer"
                onClick={() => setPlayerState(prev => ({ ...prev, isSubtitleMenuOpen: true }))}
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-full bg-green-500/10">
                    <div className="w-4 h-4 bg-green-500 rounded-sm"></div>
                  </div>
                  <span className="font-medium">Subtitles</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground">{playerState.currentSubtitle || 'Off'}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              {/* Playback Speed Setting */}
              <div
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent cursor-pointer"
                onClick={() => setPlayerState(prev => ({ ...prev, isSpeedMenuOpen: true }))}
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-full bg-purple-500/10">
                    <div className="w-4 h-4 bg-purple-500 rounded-sm"></div>
                  </div>
                  <span className="font-medium">Playback Speed</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground">{playerState.playbackSpeed}x</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              {/* Volume Setting (Optional, could be a slider too) */}
              <div
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent cursor-pointer"
                onClick={() => setPlayerState(prev => ({ ...prev, isVolumeSliderOpen: true }))}
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-full bg-yellow-500/10">
                    <div className="w-4 h-4 bg-yellow-500 rounded-sm"></div>
                  </div>
                  <span className="font-medium">Volume</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground">{Math.round(playerState.volume * 100)}%</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Sub-Menu Drawers for Flat Layout (Landscape Mode) */}
      {playerState.isQualityMenuOpen && (
        <Drawer open={playerState.isQualityMenuOpen} onOpenChange={(open) => setPlayerState(prev => ({ ...prev, isQualityMenuOpen: open }))}>
          <DrawerContent className="max-h-[60vh]">
            <DrawerHeader>
              <DrawerTitle>Quality</DrawerTitle>
            </DrawerHeader>
            <div className="p-4 space-y-2">
              <button
                onClick={() => changeQuality(-1)} // -1 for auto
                className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                  playerState.currentQuality === 'auto'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-white/10'
                }`}
              >
                Auto
              </button>
              {playerState.availableQualities.map((quality) => (
                <button
                  key={quality.id}
                  onClick={() => changeQuality(quality.id)}
                  className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                    playerState.currentQuality === `${quality.height}p`
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {quality.height}p
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {playerState.isSubtitleMenuOpen && (
        <Drawer open={playerState.isSubtitleMenuOpen} onOpenChange={(open) => setPlayerState(prev => ({ ...prev, isSubtitleMenuOpen: open }))}>
          <DrawerContent className="max-h-[60vh]">
            <DrawerHeader>
              <DrawerTitle>Subtitles</DrawerTitle>
            </DrawerHeader>
            <div className="p-4 space-y-2">
              <button
                onClick={() => changeSubtitle('off')}
                className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                  playerState.currentSubtitle === 'off' || playerState.currentSubtitle === null
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-white/10'
                }`}
              >
                Off
              </button>
              {playerState.availableSubtitles.map((subtitle) => (
                <button
                  key={subtitle.id}
                  onClick={() => changeSubtitle(subtitle.id)}
                  className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                    playerState.currentSubtitle === subtitle.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {subtitle.label}
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {playerState.isSpeedMenuOpen && (
        <Drawer open={playerState.isSpeedMenuOpen} onOpenChange={(open) => setPlayerState(prev => ({ ...prev, isSpeedMenuOpen: open }))}>
          <DrawerContent className="max-h-[60vh]">
            <DrawerHeader>
              <DrawerTitle>Playback Speed</DrawerTitle>
            </DrawerHeader>
            <div className="p-4 space-y-2">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                <button
                  key={speed}
                  onClick={() => changeSpeed(speed)}
                  className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                    playerState.playbackSpeed === speed
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {playerState.isVolumeSliderOpen && (
        <Drawer open={playerState.isVolumeSliderOpen} onOpenChange={(open) => setPlayerState(prev => ({ ...prev, isVolumeSliderOpen: open }))}>
          <DrawerContent className="max-h-[60vh]">
            <DrawerHeader>
              <DrawerTitle>Volume</DrawerTitle>
            </DrawerHeader>
            <div className="p-4">
              <Slider
                value={[playerState.volume]}
                max={1}
                step={0.01}
                onValueChange={handleVolumeChange}
                className="w-full"
              />
              <div className="text-center mt-2 text-sm text-muted-foreground">
                {Math.round(playerState.volume * 100)}%
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
};

export default VideoPlayer;
