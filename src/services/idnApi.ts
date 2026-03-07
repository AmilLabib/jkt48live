import { IDN_CHANNELS, type IdnChannelProfile } from "../data/idnChannels";

const IDN_GRAPHQL_ENDPOINT = "/api/proxy/idn/graphql";

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
  const response = await fetch(IDN_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const json = (await response.json()) as IdnGraphqlResponse;
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
    imageUrl: live.image_url ?? channel.avatarUrl,
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

export async function fetchIdnLives() {
  if (!IDN_CHANNELS.length) {
    return [];
  }
  try {
    const data = await executeGraphql(buildQuery(IDN_CHANNELS));
    const lives = mapResponseToLives(data, IDN_CHANNELS);
    return lives.sort((a, b) => b.viewCount - a.viewCount);
  } catch (error) {
    console.warn("Failed to fetch IDN lives", error);
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
    return lives[0] ?? null;
  } catch (error) {
    console.warn(`Failed to fetch IDN live for ${username}`, error);
    return null;
  }
}
