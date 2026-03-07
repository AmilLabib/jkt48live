import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import HlsPlayer from "../components/HlsPlayer";
import {
  fetchIdnLiveByUsername,
  fetchIdnLives,
  getIdnChannels,
  type IdnLive,
} from "../services/idnApi";
import {
  proxifyAssetUrl,
  proxifyStreamUrl,
  summarize,
} from "../services/showroomApi";

const REFRESH_MS = 30_000;

export default function IdnRoomPage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const channel = useMemo(
    () => getIdnChannels().find((entry) => entry.username === username),
    [username],
  );
  const [live, setLive] = useState<IdnLive | null>(null);
  const [otherLives, setOtherLives] = useState<IdnLive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channel) {
      setError("Channel IDN tidak ditemukan");
      setLoading(false);
      return;
    }

    const currentChannel = channel;
    let ignore = false;
    async function load() {
      try {
        setError(null);
        const result = await fetchIdnLiveByUsername(currentChannel.username);
        if (!ignore) {
          setLive(result);
        }
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : "Gagal memuat data IDN",
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [channel]);

  useEffect(() => {
    let ignore = false;
    async function loadOthers() {
      try {
        const list = await fetchIdnLives();
        if (!ignore) {
          setOtherLives(list);
        }
      } catch (err) {
        console.warn("Failed to load IDN live list", err);
      }
    }

    loadOthers();
    const timer = window.setInterval(loadOthers, REFRESH_MS * 2);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, []);

  const streamSource = useMemo(() => {
    if (!live?.playbackUrl) return undefined;
    return proxifyStreamUrl(live.playbackUrl);
  }, [live?.playbackUrl]);

  const filteredOthers = useMemo(() => {
    return otherLives.filter((item) => item.channel.username !== username);
  }, [otherLives, username]);

  const handleRandomRoom = useCallback(() => {
    if (!filteredOthers.length) return;
    const randomIndex = Math.floor(Math.random() * filteredOthers.length);
    navigate(`/idn/${filteredOthers[randomIndex].channel.username}`);
  }, [filteredOthers, navigate]);

  if (!channel) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-panel">
          <p className="text-lg">Channel IDN tidak ditemukan.</p>
          <button
            className="mt-4 inline-flex items-center justify-center rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black"
            onClick={() => navigate("/")}
          >
            Kembali
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-screen bg-background text-white">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute inset-y-0 left-1/2 w-[32rem] -translate-x-1/2 rounded-full bg-accent/20 blur-[160px]" />
        <div className="absolute inset-y-0 right-10 w-64 rounded-full bg-sky-500/30 blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-10 lg:pb-24 lg:pt-16">
        <nav className="mb-6 flex flex-wrap gap-3 text-sm text-muted">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5 text-white transition hover:border-white/40"
          >
            ← semua room JKT48
          </Link>
          <button
            type="button"
            onClick={handleRandomRoom}
            disabled={!filteredOthers.length}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5 text-white transition hover:border-white/40 disabled:cursor-not-allowed disabled:text-white/40"
          >
            <span aria-hidden>🎲</span>
            Room IDN acak
          </button>
        </nav>

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-base text-muted shadow-panel">
            Memuat data IDN…
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-400/40 bg-rose-500/10 p-8 text-rose-100 shadow-panel">
            {error}
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,_2fr)_minmax(320px,_1fr)]">
            <section className="flex flex-col gap-6">
              <div className="rounded-3xl border border-white/10 bg-black/40 p-8 shadow-panel backdrop-blur">
                <p className="text-[0.65rem] uppercase tracking-[0.55em] text-accent/80">
                  JKT48 • IDN Live
                </p>
                <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
                  {channel.displayName}
                </h1>
                <p className="mt-3 text-base text-muted">
                  {summarize(live?.title ?? "Channel IDN", 200)}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a
                    className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition hover:bg-accent/90"
                    href={`https://www.idn.app/@${channel.username}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buka di IDN Live
                  </a>
                </div>
              </div>

              <HlsPlayer
                source={streamSource}
                poster={proxifyAssetUrl(live?.imageUrl ?? channel.avatarUrl)}
              />
              {!live && (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-muted shadow-panel">
                  Channel ini sedang offline. Notifikasi akan muncul begitu
                  mulai live.
                </div>
              )}
            </section>

            <aside className="flex max-h-[calc(100vh-12rem)] flex-col gap-4 rounded-3xl border border-white/10 bg-black/60 p-6 shadow-panel backdrop-blur">
              <header className="space-y-1">
                <h2 className="text-xl font-semibold">Status Siaran</h2>
                <p className="text-sm text-muted">
                  {live ? "Sedang live di IDN" : "Tidak ada live IDN"}
                </p>
              </header>
              {live ? (
                <div className="space-y-3 text-sm text-muted">
                  <p>
                    <span className="text-white">Penonton:</span>{" "}
                    {live.viewCount.toLocaleString()} penonton
                  </p>
                  {live.startedAt && (
                    <p>
                      <span className="text-white">Mulai:</span>{" "}
                      {new Date(live.startedAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Tunggu jadwal berikutnya atau cek room IDN lain.
                </p>
              )}

              <div className="mt-4 flex-1 overflow-y-auto pr-1">
                {filteredOthers.length ? (
                  <ul className="space-y-3 text-sm text-muted">
                    {filteredOthers.slice(0, 5).map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                      >
                        <div>
                          <p className="text-white">
                            {item.channel.displayName}
                          </p>
                          <p className="text-xs text-muted">{item.title}</p>
                        </div>
                        <button
                          type="button"
                          className="text-xs font-semibold text-accent"
                          onClick={() =>
                            navigate(`/idn/${item.channel.username}`)
                          }
                        >
                          Lihat
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Belum ada IDN live lain.</p>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
