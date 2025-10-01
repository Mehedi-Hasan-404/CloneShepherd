import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import ShakaPlayer from "shaka-player";

interface ChannelPlayerProps {
  streamUrl: string;
  type: "hls" | "dash";
}

const ChannelPlayer: React.FC<ChannelPlayerProps> = ({ streamUrl, type }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [player, setPlayer] = useState<any>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    let currentPlayer: any = null;

    if (type === "hls") {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(videoRef.current);
        currentPlayer = hls;
      } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari native support
        videoRef.current.src = streamUrl;
      }
    } else if (type === "dash") {
      const shakaPlayer = new ShakaPlayer.Player(videoRef.current);
      shakaPlayer.load(streamUrl).catch((err: any) => console.error("Shaka load error:", err));
      currentPlayer = shakaPlayer;
    }

    setPlayer(currentPlayer);

    return () => {
      if (currentPlayer) {
        if (type === "hls") {
          currentPlayer.destroy();
        } else if (type === "dash") {
          currentPlayer.destroy();
        }
      }
    };
  }, [streamUrl, type]);

  return (
    <div className="w-full h-full flex flex-col items-center">
      <video
        ref={videoRef}
        className="w-full h-[500px] bg-black rounded-lg"
        controls
        autoPlay
      />
    </div>
  );
};

export default ChannelPlayer;
