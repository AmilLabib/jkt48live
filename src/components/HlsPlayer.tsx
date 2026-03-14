import { useEffect, useRef } from "react";
import Hls from "hls.js";

const RELOAD_DELAY_MS = 2_000;

interface HlsPlayerProps {
  source?: string;
  poster?: string;
}

export default function HlsPlayer({ source, poster }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerClasses =
    "aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-black/80 shadow-panel";

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !source) {
      return;
    }
    const video = videoElement;
    const streamSource = source;

    let hls: Hls | null = null;
    let destroyed = false;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReloadTimer = () => {
      if (reloadTimer) {
        clearTimeout(reloadTimer);
        reloadTimer = null;
      }
    };

    const attemptPlay = () => {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => undefined);
      }
    };

    const resetVideoElement = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    const scheduleReload = () => {
      if (destroyed) {
        return;
      }
      clearReloadTimer();
      reloadTimer = setTimeout(() => {
        if (destroyed) {
          return;
        }
        if (hls) {
          hls.destroy();
          hls = null;
        } else {
          resetVideoElement();
        }
        setupPlayer();
      }, RELOAD_DELAY_MS);
    };

    const handleVideoError = () => scheduleReload();
    const handleEnded = () => scheduleReload();
    const handleStall = () => attemptPlay();

    video.addEventListener("error", handleVideoError);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("stalled", handleStall);
    video.addEventListener("waiting", handleStall);

    function setupPlayer() {
      if (destroyed) {
        return;
      }

      const canUseNative = video.canPlayType("application/vnd.apple.mpegurl");

      if (canUseNative) {
        video.src = streamSource;
        video.load();
        attemptPlay();
        return;
      }

      if (Hls.isSupported()) {
        hls = new Hls({
          lowLatencyMode: true,
          backBufferLength: 60,
        });
        hls.loadSource(streamSource);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          attemptPlay();
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (destroyed || !hls) {
            return;
          }
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                scheduleReload();
            }
          }
        });
        return;
      }

      video.src = streamSource;
      video.load();
      attemptPlay();
    }

    setupPlayer();

    return () => {
      destroyed = true;
      clearReloadTimer();
      video.removeEventListener("error", handleVideoError);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("stalled", handleStall);
      video.removeEventListener("waiting", handleStall);
      if (hls) {
        hls.destroy();
      } else {
        resetVideoElement();
      }
    };
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
    />
  );
}
