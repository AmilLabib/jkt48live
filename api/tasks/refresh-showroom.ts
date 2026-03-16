import type { VercelRequest, VercelResponse } from "@vercel/node";
import { writeCache, deleteCache } from "../_lib/cache";
import {
  fetchShowroomJson,
  fetchShowroomHtml,
  parseCampaignMembers,
  type OnLivesResponse,
} from "../_lib/showroom";
import type { CampaignMember } from "../../src/services/showroomApi";

const ONLIVES_KEY = "showroom:onlives";
const MEMBERS_KEY = "showroom:members";
const ONLIVES_TTL = 120;
const MEMBERS_TTL = 6 * 60 * 60;
const CAMPAIGN_PATH = "/campaign/akb48_sr_eng_ind";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const expectedToken = process.env.SHOWROOM_REFRESH_TOKEN;
  if (expectedToken) {
    const provided =
      (req.query.token as string) || req.headers["x-refresh-token"];
    if (provided !== expectedToken) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }
  }

  try {
    const [onlives, members] = await Promise.all([
      fetchShowroomJson<OnLivesResponse>("/api/live/onlives"),
      (async () => {
        const html = await fetchShowroomHtml(CAMPAIGN_PATH);
        return parseCampaignMembers(html);
      })(),
    ]);

    await Promise.all([
      writeCache(ONLIVES_KEY, onlives, ONLIVES_TTL),
      writeCache(MEMBERS_KEY, members, MEMBERS_TTL),
    ]);

    res.status(200).json({
      status: "ok",
      onlivesCount: onlives?.onlives?.length ?? 0,
      membersCount: members.length,
      cached: true,
    });
  } catch (error) {
    console.error("refresh-showroom error", error);
    await Promise.all([deleteCache(ONLIVES_KEY), deleteCache(MEMBERS_KEY)]);
    res.status(502).json({
      error: "Failed to refresh SHOWROOM data",
    });
  }
}
