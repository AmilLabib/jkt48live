import { useEffect, useRef } from "react";
import Hls from "hls.js";

interface HlsPlayerProps {
  source?: string;
  poster?: string;
}

export default function HlsPlayer({ source, poster }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerClasses =
    "aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-black/80 shadow-panel";

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = source;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(source);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
      };
    }

    video.src = source;
  }, [source]);

  if (!source) {
    return (
      <div
        className={`${playerClasses} flex items-center justify-center text-sm text-muted`}
      >
        <span>Stream is offline</span>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className={playerClasses}
      controls
      playsInline
      autoPlay
      poster={poster}
      muted
    />
  );
}
