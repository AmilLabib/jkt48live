import { IDN_CHANNELS, type IdnChannelProfile } from "../data/idnChannels";

const IDN_GRAPHQL_ENDPOINT = "/api/proxy/idn/graphql";
const STREAM_PROBE_ENDPOINT = "/api/proxy/stream?url=";
const STREAM_PROBE_TIMEOUT_MS = 4_000;
const PLAYLIST_END_MARKER = "#ext-x-endlist";
const IDN_DEBUG_TAG = "[IDN GraphQL]";
const isDebugEnabled =
  import.meta.env.DEV ||
  (typeof window !== "undefined" &&
    Boolean(
      (window as typeof window & { __IDN_DEBUG__?: boolean }).__IDN_DEBUG__,
    ));

function debugLog(message: string, payload?: unknown) {
  if (!isDebugEnabled) {
    return;
  }
  if (payload === undefined) {
    console.debug(IDN_DEBUG_TAG, message);
  } else {
    console.debug(IDN_DEBUG_TAG, message, payload);
  }
}

interface IdnGraphqlLivestream {
  slug: string;
  title?: string | null;
  status?: string | null;
  view_count?: number | null;
  live_at?: string | null;
  playback_url?: string | null;
  image_url?: string | null;
}

interface IdnGraphqlResponse {
  data?: Record<string, IdnGraphqlLivestream[] | undefined>;
  errors?: Array<{ message?: string }>;
}

export interface IdnLive {
  platform: "idn";
  slug: string;
  id: string;
  title: string;
  status: string;
  startedAt?: number;
  playbackUrl: string;
  imageUrl?: string;
  viewCount: number;
  channel: IdnChannelProfile;
}

export function getIdnChannels() {
  return IDN_CHANNELS;
}

function buildAliasKey(index: number) {
  return `ch_${index}`;
}

function buildQuery(channels: IdnChannelProfile[]) {
  return `query FetchIdnLives {\n${channels
    .map((channel, index) => {
      const key = buildAliasKey(index);
      return `  ${key}: getLivestreams(streamerID: "${channel.uuid}") { slug title status view_count live_at playback_url image_url }`;
    })
    .join("\n")}\n}`;
}

async function executeGraphql(query: string) {
  const requestId = Math.random().toString(36).slice(2, 8);
  const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
  debugLog(`#${requestId} → sending query`, {
    endpoint: IDN_GRAPHQL_ENDPOINT,
    length: query.length,
    snippet: query.slice(0, 120),
  });

  const response = await fetch(IDN_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const rawText = await response.text();
  const durationMs =
    startedAt && typeof performance !== "undefined"
      ? Math.round(performance.now() - startedAt)
      : undefined;

  debugLog(`#${requestId} ← response meta`, {
    status: response.status,
    ok: response.ok,
    durationMs,
  });

  let json: IdnGraphqlResponse;
  try {
    json = rawText ? (JSON.parse(rawText) as IdnGraphqlResponse) : {};
  } catch (error) {
    console.error(IDN_DEBUG_TAG, `#${requestId} JSON parse failed`, error, {
      rawPreview: rawText.slice(0, 300),
    });
    throw error;
  }

  if (json.errors) {
    console.error(IDN_DEBUG_TAG, `#${requestId} GraphQL errors`, json.errors);
  } else {
    debugLog(`#${requestId} data keys`, Object.keys(json.data ?? {}));
  }

  if (!response.ok || json.errors) {
    const message = json.errors?.map((err) => err.message).join(" | ");
    throw new Error(
      message || `IDN GraphQL request failed (${response.status})`,
    );
  }
  return json.data ?? {};
}

function normalizeLive(
  live: IdnGraphqlLivestream,
  channel: IdnChannelProfile,
): IdnLive | null {
  if (!live || (live.status ?? "").toLowerCase() !== "live") {
    return null;
  }
  if (!live.playback_url) {
    return null;
  }
  return {
    platform: "idn",
    slug: live.slug,
    id: `idn:${live.slug}`,
    title: live.title || channel.displayName,
    status: live.status ?? "live",
    startedAt: live.live_at ? Date.parse(live.live_at) : undefined,
    playbackUrl: live.playback_url,
    imageUrl: channel.avatarUrl,
    viewCount: live.view_count ?? 0,
    channel,
  };
}

function mapResponseToLives(
  data: Record<string, IdnGraphqlLivestream[] | undefined>,
  channels: IdnChannelProfile[],
) {
  const lives: IdnLive[] = [];
  channels.forEach((channel, index) => {
    const key = buildAliasKey(index);
    const list = data[key] ?? [];
    const live = list.find((entry) => entry?.status?.toLowerCase() === "live");
    const normalized = live ? normalizeLive(live, channel) : null;
    if (normalized) {
      lives.push(normalized);
    }
  });
  return lives;
}

function buildStreamProbeUrl(playbackUrl: string) {
  return `${STREAM_PROBE_ENDPOINT}${encodeURIComponent(playbackUrl)}`;
}

async function probePlaybackUrl(playbackUrl: string) {
  if (typeof fetch === "undefined") {
    return true;
  }
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId =
    controller && typeof window !== "undefined"
      ? window.setTimeout(() => controller.abort(), STREAM_PROBE_TIMEOUT_MS)
      : null;
  try {
    const response = await fetch(buildStreamProbeUrl(playbackUrl), {
      headers: { "x-idn-probe": "1" },
      signal: controller?.signal,
    });
    if (!response.ok) {
      debugLog("probe request failed", {
        status: response.status,
        url: playbackUrl,
      });
      return false;
    }
    const text = await response.text();
    const normalized = text.toLowerCase();
    if (!normalized.trim()) {
      return false;
    }
    if (normalized.includes(PLAYLIST_END_MARKER)) {
      debugLog("probe detected endlist marker", { url: playbackUrl });
      return false;
    }
    return true;
  } catch (error) {
    debugLog("probe error", { url: playbackUrl, error });
    return false;
  } finally {
    if (timeoutId && typeof window !== "undefined") {
      window.clearTimeout(timeoutId);
    }
  }
}

async function filterPlayableLives(lives: IdnLive[]) {
  if (!lives.length || typeof window === "undefined") {
    return lives;
  }
  const checks = await Promise.all(
    lives.map(async (live) => ({
      live,
      ok: await probePlaybackUrl(live.playbackUrl),
    })),
  );
  const playable = checks
    .filter((entry) => entry.ok)
    .map((entry) => entry.live);
  return playable;
}

export async function fetchIdnLives() {
  if (!IDN_CHANNELS.length) {
    return [];
  }
  try {
    const data = await executeGraphql(buildQuery(IDN_CHANNELS));
    const lives = mapResponseToLives(data, IDN_CHANNELS);
    const playableLives = await filterPlayableLives(lives);
    return playableLives.sort((a, b) => b.viewCount - a.viewCount);
  } catch (error) {
    console.warn("Failed to fetch IDN lives", error);
    if (isDebugEnabled) {
      console.warn(IDN_DEBUG_TAG, "fetchIdnLives error detail", error);
    }
    return [];
  }
}

export async function fetchIdnLiveByUsername(username: string) {
  const channel = IDN_CHANNELS.find((entry) => entry.username === username);
  if (!channel) {
    return null;
  }
  try {
    const data = await executeGraphql(buildQuery([channel]));
    const lives = mapResponseToLives(data, [channel]);
    const playable = await filterPlayableLives(lives);
    return playable[0] ?? null;
  } catch (error) {
    console.warn(`Failed to fetch IDN live for ${username}`, error);
    if (isDebugEnabled) {
      console.warn(IDN_DEBUG_TAG, "fetchIdnLiveByUsername error detail", {
        username,
        error,
      });
    }
    return null;
  }
}
