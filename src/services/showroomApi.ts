import { membersShowroom } from "jkt48-sns/dist/showroom.js";

const PROXY_BASES = [
  "https://r.jina.ai/https://www.showroom-live.com",
  "https://cors.isomorphic-git.org/https://www.showroom-live.com",
];
const CAMPAIGN_PATH = "/campaign/akb48_sr_eng_ind";
const MOCK_BASE = "/mock";
const MOCK_ONLIVES_PATH = `${MOCK_BASE}/onlives.json`;
const MOCK_COMMENTS_PATH = `${MOCK_BASE}/comments.json`;
const MOCK_MEMBERS_PATH = `${MOCK_BASE}/members.json`;
const ASSET_PROXY_PREFIX = "https://wsrv.nl/?url=";
const STREAM_PROXY_PREFIX = "/proxy/stream?url=";
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
function buildUrl(base: string, path: string) {
  return `${base}${path}`;
}

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

async function fetchWithProxies<T>(
  path: string,
  handler: (response: Response, base: string) => Promise<T>,
): Promise<T> {
  const errors: Error[] = [];
  for (const base of PROXY_BASES) {
    const url = buildUrl(base, path);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}) via ${base}`);
      }
      return await handler(response, base);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  const message = errors.map((err) => err.message).join(" | ");
  throw new Error(`All proxies failed for ${path}: ${message}`);
}

function parseJsonResponse<T>(text: string, path: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const extracted = extractJsonFromMarkdown(text);
    if (extracted) {
      return extracted as T;
    }
    const snippet = text.slice(0, 160).trim();
    throw new Error(
      `Invalid JSON response for ${path}: ${snippet || "<empty>"}`,
    );
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  return fetchWithProxies(path, async (response) => {
    const text = await response.text();
    return parseJsonResponse<T>(text, path);
  });
}

async function fetchHtml(path: string): Promise<string> {
  return fetchWithProxies(path, (response) => response.text());
}
function extractJsonFromMarkdown(text: string) {
  const marker = "Markdown Content";
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return null;
  const slice = text.slice(markerIndex + marker.length).trim();
  const firstBrace = slice.indexOf("{");
  const lastBrace = slice.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  const candidate = slice.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function fetchMockJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Mock request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function cleanText(value?: string | null) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
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
    const data = await fetchJson<OnLivesResponse>("/api/live/onlives");
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

function parseMembersFromHtml(html: string): CampaignMember[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const cards = Array.from(doc.querySelectorAll(".listcardinfo"));
  const seen = new Set<number>();

  return cards
    .map((card) => {
      const anchor = card.querySelector<HTMLAnchorElement>("a.room-url");
      const roomId = Number(anchor?.dataset.roomId ?? "0");
      if (!roomId || seen.has(roomId)) return null;

      seen.add(roomId);
      const name = cleanText(
        card.querySelector(".listcardinfo-main-text")?.textContent,
      );
      const description = cleanText(
        card.querySelector(".listcardinfo-sub-text")?.textContent ?? "",
      );
      const imageEl = card.querySelector<HTMLImageElement>("img.img-main");
      const thumbnail =
        imageEl?.getAttribute("data-src") ??
        imageEl?.getAttribute("src") ??
        undefined;
      const profileLink = card
        .querySelector<HTMLAnchorElement>(".profile-link")
        ?.getAttribute("href");
      const roomUrl = anchor?.getAttribute("href");

      const member: CampaignMember = {
        roomId,
        name,
        description,
        thumbnail,
        profileUrl: profileLink
          ? `https://www.showroom-live.com${profileLink}`
          : undefined,
        roomUrl: roomUrl
          ? `https://www.showroom-live.com${roomUrl}`
          : undefined,
      };
      return member;
    })
    .filter((member): member is CampaignMember => Boolean(member));
}

export async function fetchCampaignMembers(
  force = false,
): Promise<CampaignMember[]> {
  if (cache.members && !force) {
    return cache.members;
  }
  try {
    const html = await fetchHtml(CAMPAIGN_PATH);
    const parsed = parseMembersFromHtml(html);
    const filtered = parsed.filter((member) => isJktLive(member));
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
  const params = new URLSearchParams({ room_id: String(roomId) });
  try {
    const data = await fetchJson<CommentResponse>(
      `/api/live/comment_log?${params.toString()}`,
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
