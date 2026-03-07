import { Link } from "react-router-dom";

export interface LiveCardData {
  id: string;
  source: "showroom" | "idn";
  href: string;
  name: string;
  groupLabel: string;
  description: string;
  image?: string;
  viewers: number;
  startedAt?: number;
}

interface LiveCardProps {
  data: LiveCardData;
}

function formatDuration(startedAt?: number) {
  if (!startedAt) return "";
  const diffMs = Date.now() - startedAt;
  if (Number.isNaN(diffMs) || diffMs <= 0) return "";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just started";
  if (minutes < 60) return `Live ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `Live ${hours}h ${remaining}m`;
}

export default function LiveCard({ data }: LiveCardProps) {
  const duration = formatDuration(data.startedAt);
  const badgeLabel = data.source === "idn" ? "IDN LIVE" : "SHOWROOM";
  const badgeColor = data.source === "idn" ? "bg-sky-500/90" : "bg-rose-500/90";

  return (
    <Link
      to={data.href}
      className="group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-panel ring-1 ring-white/5 transition duration-300 hover:-translate-y-1 hover:border-white/40 hover:ring-accent/60"
    >
      <div className="relative h-48 overflow-hidden bg-gradient-to-br from-white/10 via-white/0 to-transparent">
        {data.image ? (
          <img
            src={data.image}
            alt={data.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            aria-hidden
            className="h-full w-full bg-gradient-to-br from-accent/30 via-transparent to-white/10"
          />
        )}
        <span
          className={`absolute left-4 top-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.35em] text-white ${badgeColor}`}
        >
          <span className="h-2 w-2 rounded-full bg-white" />
          {badgeLabel}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="space-y-2">
          <p className="text-[0.6rem] uppercase tracking-[0.45em] text-muted">
            {data.groupLabel}
          </p>
          <h3 className="text-xl font-semibold">{data.name}</h3>
          <p className="text-sm text-muted">{data.description}</p>
        </div>
        <div className="mt-auto flex items-center justify-between text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {data.viewers.toLocaleString()} penonton
          </span>
          {duration && <span>{duration}</span>}
        </div>
      </div>
    </Link>
  );
}
