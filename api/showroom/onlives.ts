import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readCache, writeCache } from "../_lib/cache";
import { fetchShowroomJson, type OnLivesResponse } from "../_lib/showroom";

const CACHE_KEY = "showroom:onlives";
const TTL_SECONDS = 120;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const cached = await readCache<OnLivesResponse>(CACHE_KEY);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    const data = await fetchShowroomJson<OnLivesResponse>("/api/live/onlives");
    await writeCache(CACHE_KEY, data, TTL_SECONDS);
    res.status(200).json(data);
  } catch (error) {
    console.error("showroom:onlives error", error);
    res.status(502).json({ error: "Failed to load SHOWROOM onlives" });
  }
}
