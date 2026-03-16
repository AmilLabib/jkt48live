import { membersShowroom } from "jkt48-sns/dist/showroom.js";

const SHOWROOM_API_BASE = "/api/showroom";
const SHOWROOM_ENDPOINTS = {
  onlives: `${SHOWROOM_API_BASE}/onlives`,
  members: `${SHOWROOM_API_BASE}/members`,
  comments: `${SHOWROOM_API_BASE}/comments`,
};
const MOCK_BASE = "/mock";
const MOCK_ONLIVES_PATH = `${MOCK_BASE}/onlives.json`;
const MOCK_COMMENTS_PATH = `${MOCK_BASE}/comments.json`;
const MOCK_MEMBERS_PATH = `${MOCK_BASE}/members.json`;
const ASSET_PROXY_PREFIX = "https://wsrv.nl/?url=";
const STREAM_PROXY_PREFIX = "/api/proxy/stream?url=";
const CANONICAL_JKT_SHOWROOM_IDS = new Set(
  Object.values(membersShowroom).map((account) => account.roomId),
);

export interface StreamingUrl {
  url: string;
  label: string;
  type: string;
  id?: number;
  quality?: number;
}

export interface LiveRoom {
  room_id: number;
  room_url_key: string;
  main_name: string;
  image: string;
  image_square?: string;
  telop?: string;
  view_num: number;
  follower_num: number;
  started_at?: number;
  live_id: number;
  streaming_url_list: StreamingUrl[];
}

interface OnLivesResponse {
  onlives: Array<{
    genre_id: number;
    genre_name: string;
    lives: LiveRoom[];
  }>;
}

export interface CampaignMember {
  roomId: number;
  name: string;
  description: string;
  thumbnail?: string;
  roomUrl?: string;
  profileUrl?: string;
}

export interface CommentEntry {
  comment: string;
  name: string;
  avatar_url?: string;
  class_level?: number;
  created_at: number;
}

interface CommentResponse {
  comment_log: CommentEntry[];
}

const cache = {
  members: null as CampaignMember[] | null,
};

export function proxifyAssetUrl(url?: string | null) {
  if (!url) return undefined;
  if (url.startsWith(ASSET_PROXY_PREFIX)) return url;
  return `${ASSET_PROXY_PREFIX}${encodeURIComponent(url)}`;
}

export function proxifyStreamUrl(url?: string | null) {
  if (!url) return undefined;
  if (url.startsWith(STREAM_PROXY_PREFIX)) return url;
  return `${STREAM_PROXY_PREFIX}${encodeURIComponent(url)}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${path}`);
  }
  return response.json() as Promise<T>;
}

async function fetchMockJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Mock request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function flattenLives(data: OnLivesResponse | null | undefined) {
  if (!data?.onlives) return [] as LiveRoom[];
  return data.onlives.flatMap((genre) => genre.lives ?? []);
}

function dedupeLives(lives: LiveRoom[]) {
  const seen = new Set<number>();
  return lives.filter((live) => {
    if (seen.has(live.room_id)) {
      return false;
    }
    seen.add(live.room_id);
    return true;
  });
}

export function buildMemberMap(members: CampaignMember[]) {
  return new Map(members.map((member) => [member.roomId, member]));
}

export function isCanonicalShowroomRoom(roomId?: number | null) {
  if (!roomId) return false;
  return CANONICAL_JKT_SHOWROOM_IDS.has(roomId);
}

export function filterJktLives(
  lives: LiveRoom[],
  roster?: Map<number, CampaignMember>,
) {
  return lives.filter((live) => isJktLive(roster?.get(live.room_id), live));
}

export function filterLivesByRoster(lives: LiveRoom[]) {
  if (!CANONICAL_JKT_SHOWROOM_IDS.size) return lives;
  return lives.filter((live) => isCanonicalShowroomRoom(live.room_id));
}

export async function fetchOnLives(): Promise<LiveRoom[]> {
  try {
    const data = await fetchJson<OnLivesResponse>(SHOWROOM_ENDPOINTS.onlives);
    const lives = dedupeLives(flattenLives(data));
    if (lives.length) {
      return lives;
    }
    throw new Error("Live list is empty");
  } catch (error) {
    console.warn("Falling back to mock onlives dataset", error);
    const fallback = await fetchMockJson<OnLivesResponse>(MOCK_ONLIVES_PATH);
    return dedupeLives(flattenLives(fallback));
  }
}

export interface JktShowroomSnapshot {
  members: CampaignMember[];
  lives: LiveRoom[];
}

export async function fetchJktShowroomSnapshot(
  options: { forceMembers?: boolean } = {},
): Promise<JktShowroomSnapshot> {
  const members = await fetchCampaignMembers(options.forceMembers);
  const rosterMap = buildMemberMap(members);
  const lives = filterLivesByRoster(
    filterJktLives(await fetchOnLives(), rosterMap),
  );
  return { members, lives };
}

export async function fetchCampaignMembers(
  force = false,
): Promise<CampaignMember[]> {
  if (cache.members && !force) {
    return cache.members;
  }
  try {
    const members = await fetchJson<CampaignMember[]>(
      SHOWROOM_ENDPOINTS.members,
    );
    const filtered = members.filter((member) => isJktLive(member));
    cache.members = filtered;
    return filtered;
  } catch (error) {
    console.warn("Falling back to mock members dataset", error);
    const mockMembers =
      await fetchMockJson<CampaignMember[]>(MOCK_MEMBERS_PATH);
    const filtered = mockMembers.filter((member) => isJktLive(member));
    cache.members = filtered;
    return filtered;
  }
}

export async function fetchComments(roomId: number): Promise<CommentEntry[]> {
  if (!roomId) return [];
  const params = new URLSearchParams({ roomId: String(roomId) });
  try {
    const data = await fetchJson<CommentResponse>(
      `${SHOWROOM_ENDPOINTS.comments}?${params.toString()}`,
    );
    return data.comment_log ?? [];
  } catch (error) {
    console.warn(`Falling back to mock comments for room ${roomId}`, error);
    const mockData = await fetchMockJson<CommentResponse>(MOCK_COMMENTS_PATH);
    return mockData.comment_log ?? [];
  }
}

export function findGroupLabel(source?: string) {
  if (!source) return "JKT48";
  const upper = source.toUpperCase();
  const groups = ["JKT48"];
  return groups.find((group) => upper.includes(group)) ?? "JKT48";
}

export function inferGroupLabel(
  member?: CampaignMember | null,
  live?: LiveRoom | null,
) {
  const sources = [
    member?.description,
    member?.name,
    live?.telop,
    live?.main_name,
    live?.room_url_key,
  ];
  const text = sources.find((value) => value && value.trim()) ?? undefined;
  return findGroupLabel(text);
}

export function isJktLive(
  member?: CampaignMember | null,
  live?: LiveRoom | null,
) {
  const canonicalRoomId = member?.roomId ?? live?.room_id;
  if (isCanonicalShowroomRoom(canonicalRoomId)) {
    return true;
  }
  if (typeof canonicalRoomId === "number") {
    return false;
  }
  return inferGroupLabel(member, live) === "JKT48";
}

export function summarize(text?: string, max = 140) {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}
