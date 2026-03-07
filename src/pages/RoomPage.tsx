import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import HlsPlayer from "../components/HlsPlayer";
import type {
  CommentEntry,
  CampaignMember,
  LiveRoom,
  StreamingUrl,
} from "../services/showroomApi";
import {
  fetchComments,
  fetchJktShowroomSnapshot,
  inferGroupLabel,
  summarize,
  proxifyAssetUrl,
  proxifyStreamUrl,
} from "../services/showroomApi";

const COMMENTS_REFRESH_MS = 5000;

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const numericRoomId = Number(roomId);

  const [member, setMember] = useState<CampaignMember | null>(null);
  const [live, setLive] = useState<LiveRoom | null>(null);
  const [availableLives, setAvailableLives] = useState<LiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentEntry[]>([]);

  useEffect(() => {
    if (!numericRoomId) {
      setError("Invalid room id");
      return;
    }

    let ignore = false;
    async function loadRoom() {
      try {
        setError(null);
        const snapshot = await fetchJktShowroomSnapshot();
        if (ignore) return;
        setMember(
          snapshot.members.find((m) => m.roomId === numericRoomId) ?? null,
        );
        setAvailableLives(snapshot.lives);
        setLive(
          snapshot.lives.find((entry) => entry.room_id === numericRoomId) ??
            null,
        );
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load room information",
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadRoom();
    return () => {
      ignore = true;
    };
  }, [numericRoomId]);

  useEffect(() => {
    if (!numericRoomId) return;
    let ignore = false;

    async function loadComments() {
      try {
        const list = await fetchComments(numericRoomId);
        if (!ignore) {
          setComments(list);
        }
      } catch (err) {
        console.error(err);
      }
    }

    loadComments();
    const timer = window.setInterval(loadComments, COMMENTS_REFRESH_MS);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [numericRoomId]);

  const streamUrl = useMemo(() => {
    if (!live) return undefined;
    return selectStreamUrl(live.streaming_url_list);
  }, [live]);

  const handleRandomRoom = useCallback(() => {
    if (!availableLives.length) return;
    const randomIndex = Math.floor(Math.random() * availableLives.length);
    const randomRoom = availableLives[randomIndex];
    navigate(`/room/${randomRoom.room_id}`);
  }, [availableLives, navigate]);

  if (!numericRoomId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-panel">
          <p className="text-lg">Room ID tidak valid.</p>
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
        <div className="absolute inset-y-0 right-10 w-64 rounded-full bg-purple-500/30 blur-[160px]" />
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
            disabled={!availableLives.length}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5 text-white transition hover:border-white/40 disabled:cursor-not-allowed disabled:text-white/40"
          >
            <span aria-hidden>🎲</span>
            Room JKT48 acak
          </button>
        </nav>

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-base text-muted shadow-panel">
            Memuat data room…
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
                  {inferGroupLabel(member, live)}
                </p>
                <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
                  {member?.name ?? live?.main_name ?? "Unknown room"}
                </h1>
                {member?.description && (
                  <p className="mt-3 text-base text-muted">
                    {summarize(member.description, 240)}
                  </p>
                )}
                <div className="mt-6 flex flex-wrap gap-3">
                  {member?.roomUrl && (
                    <a
                      className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition hover:bg-accent/90"
                      href={member.roomUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Buka di SHOWROOM
                    </a>
                  )}
                  {member?.profileUrl && (
                    <a
                      className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-white transition hover:border-white/40"
                      href={member.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Profil Resmi
                    </a>
                  )}
                </div>
              </div>

              <HlsPlayer
                source={streamUrl}
                poster={proxifyAssetUrl(live?.image || member?.thumbnail)}
              />
              {!live && (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-muted shadow-panel">
                  Member ini sedang offline. Putar ulang akan otomatis muncul
                  ketika live dimulai.
                </div>
              )}
            </section>

            <aside className="flex max-h-[calc(100vh-12rem)] flex-col rounded-3xl border border-white/10 bg-black/60 p-6 shadow-panel backdrop-blur">
              <header className="space-y-1">
                <h2 className="text-xl font-semibold">Komentar Langsung</h2>
              </header>
              <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
                {comments.length === 0 ? (
                  <p className="text-sm text-muted">
                    Belum ada komentar yang berhasil diambil.
                  </p>
                ) : (
                  comments.map((comment) => (
                    <article
                      key={`${comment.created_at}-${comment.name}`}
                      className="flex gap-3 rounded-2xl border border-white/5 bg-white/5 p-3"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-base font-semibold">
                        {comment.avatar_url ? (
                          <img
                            src={comment.avatar_url}
                            alt={comment.name}
                            loading="lazy"
                            className="h-full w-full rounded-2xl object-cover"
                          />
                        ) : (
                          <span>{comment.name.charAt(0)}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs text-muted">
                          <strong className="text-sm text-white">
                            {comment.name}
                          </strong>
                          <span>
                            {new Date(
                              comment.created_at * 1000,
                            ).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-white/90">
                          {comment.comment}
                        </p>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function selectStreamUrl(list: StreamingUrl[]) {
  if (!list || list.length === 0) return undefined;
  const selected = list.find((item) => item.type === "hls") ?? list[0];
  return proxifyStreamUrl(selected?.url);
}
