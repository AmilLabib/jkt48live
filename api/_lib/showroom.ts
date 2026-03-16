import { parseHTML } from "linkedom";
import type {
  CampaignMember,
  CommentEntry,
  OnLivesResponse,
} from "../../src/services/showroomApi";

const SHOWROOM_BASE = "https://www.showroom-live.com";
const PROXY_BASE = "https://r.jina.ai";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36";

function buildProxyUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${PROXY_BASE}${SHOWROOM_BASE}${normalized}`;
}

async function fetchFromProxy(path: string, init?: RequestInit) {
  const response = await fetch(buildProxyUrl(path), {
    headers: {
      "user-agent": USER_AGENT,
      ...init?.headers,
    },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`SHOWROOM request failed (${response.status})`);
  }
  return response;
}

export async function fetchShowroomJson<T>(path: string) {
  const response = await fetchFromProxy(path);
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Invalid JSON response for ${path}`);
  }
}

export async function fetchShowroomHtml(path: string) {
  const response = await fetchFromProxy(path);
  return response.text();
}

export function parseCampaignMembers(html: string): CampaignMember[] {
  const { document } = parseHTML(html);
  const cards = Array.from(document.querySelectorAll(".listcardinfo"));
  const seen = new Set<number>();
  const members: CampaignMember[] = [];

  for (const card of cards) {
    const anchor = card.querySelector("a.room-url");
    const roomId = Number(anchor?.getAttribute("data-room-id" ?? "0"));
    if (!roomId || seen.has(roomId)) {
      continue;
    }
    seen.add(roomId);
    const name =
      card.querySelector(".listcardinfo-main-text")?.textContent?.trim() ?? "";
    const description =
      card.querySelector(".listcardinfo-sub-text")?.textContent?.trim() ?? "";
    const imageEl = card.querySelector("img.img-main");
    const thumbnail =
      imageEl?.getAttribute("data-src") ||
      imageEl?.getAttribute("src") ||
      undefined;
    const profileLink =
      card.querySelector(".profile-link")?.getAttribute("href") ?? undefined;
    const roomUrl = anchor?.getAttribute("href") ?? undefined;

    members.push({
      roomId,
      name,
      description,
      thumbnail,
      profileUrl: profileLink ? `${SHOWROOM_BASE}${profileLink}` : undefined,
      roomUrl: roomUrl ? `${SHOWROOM_BASE}${roomUrl}` : undefined,
    });
  }

  return members;
}

export type { OnLivesResponse, CommentEntry };
