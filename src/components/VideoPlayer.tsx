import React, { useRef, useEffect, useState } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, ChevronLeft, Minimize } from 'lucide-react';

interface VideoPlayerProps {
  streamUrl: string;
  authCookie?: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ streamUrl, authCookie }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  
  const [qualities, setQualities] = useState<Array<{index: number, height: number, bitrate: number}>>([]);
  const [currentQuality, setCurrentQuality] = useState('Auto');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [audioTracks, setAudioTracks] = useState<Array<{index: number, name: string}>>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(0);
  const [settingsView, setSettingsView] = useState<'main' | 'quality' | 'speed' | 'audio'>('main');

  // Detect screen size and orientation
  useEffect(() => {
    const checkScreen = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setIsMobile(width < 1024);
      setIsLandscape(width > height && width < 1024);
    };
    
    checkScreen();
    window.addEventListener('resize', checkScreen);
    window.addEventListener('orientationchange', checkScreen);
    
    return () => {
      window.removeEventListener('resize', checkScreen);
      window.removeEventListener('orientationchange', checkScreen);
    };
  }, []);

  // Initialize HLS
  useEffect(() => {
    if (!videoRef.current || !streamUrl) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr) => {
          if (authCookie) {
            xhr.setRequestHeader('Cookie', authCookie);
          }
        }
      });

      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        const levels = data.levels.map((level: any, index: number) => ({
          index,
          height: level.height,
          bitrate: level.bitrate
        }));
        setQualities(levels);
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (event, data) => {
        const tracks = data.audioTracks.map((track: any, index: number) => ({
          index,
          name: track.name || `Audio ${index + 1}`
        }));
        setAudioTracks(tracks);
      });

      return () => {
        hls.destroy();
      };
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = streamUrl;
    }
  }, [streamUrl, authCookie]);

  // Inactivity timer
  const resetInactivityTimer = () => {
    setShowControls(true);
    
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    
    if (isPlaying && !showSettings) {
      inactivityTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  useEffect(() => {
    resetInactivityTimer();
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [isPlaying, showSettings]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleMouseMove = () => {
    if (!isMobile) resetInactivityTimer();
  };

  const handleTouchStart = () => {
    if (isMobile) resetInactivityTimer();
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    videoRef.current.volume = newVolume;
    setIsMuted(newVolume === 0);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const changeQuality = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      if (levelIndex === -1) {
        setCurrentQuality('Auto');
      } else {
        setCurrentQuality(`${qualities[levelIndex].height}p`);
      }
    }
    setShowSettings(false);
    setSettingsView('main');
  };

  const changePlaybackSpeed = (speed: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = speed;
    setPlaybackSpeed(speed);
    setShowSettings(false);
    setSettingsView('main');
  };

  const changeAudioTrack = (trackIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackIndex;
      setCurrentAudioTrack(trackIndex);
    }
    setShowSettings(false);
    setSettingsView('main');
  };

  const toggleSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSettings(!showSettings);
    if (showSettings) {
      setSettingsView('main');
    }
  };

  const getSettingsPosition = () => {
    if (isMobile && !isLandscape) {
      // Mobile portrait - full width at bottom
      return 'inset-x-4 bottom-20';
    } else if (isMobile && isLandscape) {
      // Mobile landscape - right side
      return 'right-4 bottom-16 w-80';
    } else {
      // Desktop/tablet - higher position, right side
      return 'right-4 bottom-24 w-80';
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black"
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        className="w-full h-full"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Controls Overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 50%)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Desktop Volume Control - positioned higher */}
        {!isMobile && (
          <div className="absolute bottom-20 left-6 flex items-center gap-3">
            <button
              onClick={toggleMute}
              className="text-white hover:text-gray-300 transition-colors p-2"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-6 h-6" />
              ) : (
                <Volume2 className="w-6 h-6" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="w-24 h-1 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, white ${volume * 100}%, rgba(255,255,255,0.3) ${volume * 100}%)`
              }}
            />
          </div>
        )}

        {/* Bottom Controls */}
        <div className="flex items-center justify-between px-6 pb-4 gap-4">
          {/* Left Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="text-white hover:text-gray-300 transition-colors p-2"
            >
              {isPlaying ? (
                <Pause className="w-7 h-7" />
              ) : (
                <Play className="w-7 h-7" />
              )}
            </button>

            {isMobile && (
              <button
                onClick={toggleMute}
                className="text-white hover:text-gray-300 transition-colors p-2"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-6 h-6" />
                ) : (
                  <Volume2 className="w-6 h-6" />
                )}
              </button>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSettings}
              className="text-white hover:text-gray-300 transition-colors p-2"
            >
              <Settings className="w-6 h-6" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-gray-300 transition-colors p-2"
            >
              {isFullscreen ? (
                <Minimize className="w-6 h-6" />
              ) : (
                <Maximize className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Settings Menu */}
      {showSettings && (
        <>
          <div
            className={`absolute ${getSettingsPosition()} bg-black bg-opacity-95 rounded-lg text-white max-h-96 overflow-auto z-50`}
            onClick={(e) => e.stopPropagation()}
          >
            {settingsView === 'main' && (
              <div className="p-2">
                <button
                  onClick={() => setSettingsView('quality')}
                  className="w-full flex items-center justify-between p-3 hover:bg-white hover:bg-opacity-10 rounded text-left"
                >
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5" />
                    <span>Quality</span>
                  </div>
                  <span className="text-gray-400 text-sm">{currentQuality}</span>
                </button>

                <button
                  onClick={() => setSettingsView('speed')}
                  className="w-full flex items-center justify-between p-3 hover:bg-white hover:bg-opacity-10 rounded text-left"
                >
                  <div className="flex items-center gap-3">
                    <Play className="w-5 h-5" />
                    <span>Playback speed</span>
                  </div>
                  <span className="text-gray-400 text-sm">{playbackSpeed === 1 ? 'Normal' : `${playbackSpeed}x`}</span>
                </button>

                {audioTracks.length > 1 && (
                  <button
                    onClick={() => setSettingsView('audio')}
                    className="w-full flex items-center justify-between p-3 hover:bg-white hover:bg-opacity-10 rounded text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Volume2 className="w-5 h-5" />
                      <span>Audio</span>
                    </div>
                    <span className="text-gray-400 text-sm">
                      {audioTracks[currentAudioTrack]?.name || 'Default'}
                    </span>
                  </button>
                )}
              </div>
            )}

            {settingsView === 'quality' && (
              <div className="p-2">
                <button
                  onClick={() => setSettingsView('main')}
                  className="w-full flex items-center gap-2 p-3 hover:bg-white hover:bg-opacity-10 rounded mb-2 text-left"
                >
                  <ChevronLeft className="w-5 h-5" />
                  <span>Quality</span>
                </button>
                <button
                  onClick={() => changeQuality(-1)}
                  className={`w-full text-left p-3 hover:bg-white hover:bg-opacity-10 rounded ${
                    currentQuality === 'Auto' ? 'bg-white bg-opacity-20' : ''
                  }`}
                >
                  Auto
                </button>
                {qualities.map((quality) => (
                  <button
                    key={quality.index}
                    onClick={() => changeQuality(quality.index)}
                    className={`w-full text-left p-3 hover:bg-white hover:bg-opacity-10 rounded ${
                      currentQuality === `${quality.height}p` ? 'bg-white bg-opacity-20' : ''
                    }`}
                  >
                    {quality.height}p
                  </button>
                ))}
              </div>
            )}

            {settingsView === 'speed' && (
              <div className="p-2">
                <button
                  onClick={() => setSettingsView('main')}
                  className="w-full flex items-center gap-2 p-3 hover:bg-white hover:bg-opacity-10 rounded mb-2 text-left"
                >
                  <ChevronLeft className="w-5 h-5" />
                  <span>Playback speed</span>
                </button>
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => changePlaybackSpeed(speed)}
                    className={`w-full text-left p-3 hover:bg-white hover:bg-opacity-10 rounded ${
                      playbackSpeed === speed ? 'bg-white bg-opacity-20' : ''
                    }`}
                  >
                    {speed === 1 ? 'Normal' : `${speed}x`}
                  </button>
                ))}
              </div>
            )}

            {settingsView === 'audio' && (
              <div className="p-2">
                <button
                  onClick={() => setSettingsView('main')}
                  className="w-full flex items-center gap-2 p-3 hover:bg-white hover:bg-opacity-10 rounded mb-2 text-left"
                >
                  <ChevronLeft className="w-5 h-5" />
                  <span>Audio</span>
                </button>
                {audioTracks.map((track) => (
                  <button
                    key={track.index}
                    onClick={() => changeAudioTrack(track.index)}
                    className={`w-full text-left p-3 hover:bg-white hover:bg-opacity-10 rounded ${
                      currentAudioTrack === track.index ? 'bg-white bg-opacity-20' : ''
                    }`}
                  >
                    {track.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Click overlay to close settings */}
          <div
            className="absolute inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              setShowSettings(false);
              setSettingsView('main');
            }}
          />
        </>
      )}
    </div>
  );
};

export default VideoPlayer;
