import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LiveCard from "../components/LiveCard";
import type { LiveCardData } from "../components/LiveCard";
import {
  buildMemberMap,
  fetchJktShowroomSnapshot,
  inferGroupLabel,
  summarize,
  proxifyAssetUrl,
} from "../services/showroomApi";
import type { CampaignMember, LiveRoom } from "../services/showroomApi";
import { fetchIdnLives, type IdnLive } from "../services/idnApi";

const REFRESH_MS = 60_000;

export default function HomePage() {
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [lives, setLives] = useState<LiveRoom[]>([]);
  const [idnLives, setIdnLives] = useState<IdnLive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const previousLiveIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        setError(null);
        const [showroomResult, idnResult] = await Promise.allSettled([
          fetchJktShowroomSnapshot(),
          fetchIdnLives(),
        ]);
        if (ignore) return;
        if (showroomResult.status === "fulfilled") {
          setMembers(showroomResult.value.members);
          setLives(showroomResult.value.lives);
          setLastUpdated(new Date());
        } else {
          throw showroomResult.reason;
        }

        if (idnResult.status === "fulfilled") {
          setIdnLives(idnResult.value);
        } else {
          console.warn("Failed to load IDN lives", idnResult.reason);
          setIdnLives([]);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load data");
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
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      setNotificationPermission("unsupported");
      return;
    }
    if ("Notification" in window) {
      setNotificationPermission(window.Notification.permission);
      return;
    }
    setNotificationPermission("unsupported");
  }, []);

  const rosterMap = useMemo(() => buildMemberMap(members), [members]);

  const { cards, stats } = useMemo(() => {
    const showroomCards = lives.map((live) => {
      const member = rosterMap.get(live.room_id);
      const name = member?.name || live.main_name || `Room ${live.room_id}`;
      const description = summarize(
        member?.description || live.telop || "",
        120,
      );
      return {
        id: `showroom:${live.room_id}`,
        source: "showroom" as const,
        href: `/room/${live.room_id}`,
        name,
        groupLabel: inferGroupLabel(member, live),
        description,
        image: proxifyAssetUrl(live.image || member?.thumbnail),
        viewers: live.view_num,
        startedAt: live.started_at ? live.started_at * 1000 : undefined,
      } satisfies LiveCardData;
    });

    const idnCards = idnLives.map(
      (live) =>
        ({
          id: live.id,
          source: "idn" as const,
          href: `/idn/${live.channel.username}`,
          name: live.channel.displayName,
          groupLabel: "JKT48 • IDN Live",
          description: summarize(live.title, 120),
          image: proxifyAssetUrl(live.imageUrl ?? live.channel.avatarUrl),
          viewers: live.viewCount,
          startedAt: live.startedAt,
        }) satisfies LiveCardData,
    );

    const combined = [...showroomCards, ...idnCards].sort(
      (a, b) => b.viewers - a.viewers,
    );

    return {
      cards: combined,
      stats: {
        showroom: lives.length,
        idn: idnCards.length,
      },
    };
  }, [lives, rosterMap, idnLives]);

  const formatNotificationName = useCallback((name: string) => {
    const trimmed = name.trim();
    return trimmed.toUpperCase().includes("JKT48")
      ? trimmed
      : `${trimmed} JKT48`;
  }, []);

  const handleEnableNotifications = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    try {
      const result = await window.Notification.requestPermission();
      setNotificationPermission(result);
    } catch (err) {
      console.error("Notification permission error", err);
    }
  }, []);

  useEffect(() => {
    const entries = [
      ...lives.map((live) => {
        const member = rosterMap.get(live.room_id);
        const rawName =
          member?.name || live.main_name || `Room ${live.room_id}`;
        const icon = proxifyAssetUrl(live.image || member?.thumbnail);
        return {
          id: `showroom:${live.room_id}`,
          message: `${formatNotificationName(rawName)} sedang live di SHOWROOM!`,
          icon,
        };
      }),
      ...idnLives.map((live) => {
        const rawName = live.channel.displayName;
        const icon = proxifyAssetUrl(live.imageUrl ?? live.channel.avatarUrl);
        return {
          id: `idn:${live.slug}`,
          message: `${formatNotificationName(rawName)} sedang live di IDN Live!`,
          icon,
        };
      }),
    ];
    const currentIds = new Set(entries.map((entry) => entry.id));

    if (notificationPermission !== "granted") {
      previousLiveIds.current = currentIds;
      return;
    }
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    entries.forEach((entry) => {
      if (!previousLiveIds.current.has(entry.id)) {
        try {
          new window.Notification(entry.message, {
            icon: entry.icon,
            tag: entry.id,
          });
        } catch (err) {
          console.error("Failed to send notification", err);
        }
      }
    });
    previousLiveIds.current = currentIds;
  }, [
    lives,
    idnLives,
    notificationPermission,
    rosterMap,
    formatNotificationName,
  ]);

  return (
    <div className="relative isolate min-h-screen bg-background/95 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute inset-y-0 left-1/2 w-[32rem] -translate-x-1/2 rounded-full bg-accent/20 blur-[160px]" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-rose-500/20 blur-[140px]" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 lg:px-10 lg:pb-24 lg:pt-16">
        <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-black/40 p-8 shadow-panel backdrop-blur">
          <div className="space-y-3">
            <p className="text-[0.65rem] uppercase tracking-[0.55em] text-accent/80">
              SHOWROOM Monitor
            </p>
            <h1 className="text-3xl font-semibold sm:text-4xl lg:text-5xl">
              JKT48 Live Watch
            </h1>
            <p className="max-w-3xl text-base text-muted sm:text-lg">
              Pantau semua member JKT48 yang sedang live di SHOWROOM & IDN Live
              dari satu layar
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5 text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {cards.length} room JKT48 on-air
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5 text-white/80">
              SHOWROOM {stats.showroom} • IDN {stats.idn}
            </span>
            {lastUpdated && (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            {notificationPermission ===
            "unsupported" ? null : notificationPermission === "granted" ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-400/10 px-4 py-1.5 text-emerald-100">
                <span aria-hidden>🔔</span>
                Notifikasi live aktif
              </span>
            ) : (
              <button
                type="button"
                onClick={handleEnableNotifications}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-1.5 font-semibold text-white transition hover:bg-white/10"
              >
                <span aria-hidden>🔔</span>
                Aktifkan notifikasi live
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="rounded-3xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 shadow-panel">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-base text-muted shadow-panel">
            Mengambil jadwal terbaru…
          </div>
        ) : cards.length ? (
          <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <LiveCard key={card.id} data={card} />
            ))}
          </section>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 shadow-panel">
            <h2 className="text-2xl font-semibold">Belum ada yang live</h2>
            <p className="mt-2 text-muted">
              Begitu ada member JKT48 yang mulai streaming, kartu akan muncul
              otomatis di sini.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
