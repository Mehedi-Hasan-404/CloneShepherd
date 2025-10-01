import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import ShakaPlayer from "shaka-player";
import videojs from "video.js";
import "video.js/dist/video-js.css";

interface ChannelPlayerProps {
  streamUrl: string;
  type: "hls" | "dash";
}

const ChannelPlayer: React.FC<ChannelPlayerProps> = ({ streamUrl, type }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [player, setPlayer] = useState<any>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    if (type === "hls") {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(videoRef.current);
        setPlayer(hls);
      } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
        videoRef.current.src = streamUrl;
      }
    } else if (type === "dash") {
      const shakaPlayer = new ShakaPlayer.Player(videoRef.current);
      shakaPlayer.load(streamUrl).catch((err: any) => console.error(err));
      setPlayer(shakaPlayer);
    }

    return () => {
      if (player) {
        if (type === "hls") {
          player.destroy();
        } else if (type === "dash") {
          player.destroy();
        }
      }
    };
  }, [streamUrl, type]);

  return (
    <div className="w-full h-full flex flex-col items-center">
      <video
        ref={videoRef}
        className="video-js vjs-big-play-centered w-full h-[500px]"
        controls
        autoPlay
      />
    </div>
  );
};

export default ChannelPlayer;
