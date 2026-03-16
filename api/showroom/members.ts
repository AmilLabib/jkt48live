import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readCache, writeCache } from "../_lib/cache";
import { fetchShowroomHtml, parseCampaignMembers } from "../_lib/showroom";
import type { CampaignMember } from "../../src/services/showroomApi";

const CACHE_KEY = "showroom:members";
const TTL_SECONDS = 6 * 60 * 60; // 6 hours
const CAMPAIGN_PATH = "/campaign/akb48_sr_eng_ind";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const cached = await readCache<CampaignMember[]>(CACHE_KEY);
    if (cached?.length) {
      res.status(200).json(cached);
      return;
    }

    const html = await fetchShowroomHtml(CAMPAIGN_PATH);
    const members = parseCampaignMembers(html);
    await writeCache(CACHE_KEY, members, TTL_SECONDS);
    res.status(200).json(members);
  } catch (error) {
    console.error("showroom:members error", error);
    res.status(502).json({ error: "Failed to load SHOWROOM members" });
  }
}
