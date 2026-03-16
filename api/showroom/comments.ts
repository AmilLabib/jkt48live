import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readCache, writeCache } from "../_lib/cache";
import { fetchShowroomJson, type CommentEntry } from "../_lib/showroom";

const CACHE_PREFIX = "showroom:comments:";
const TTL_SECONDS = 5;

interface CommentResponse {
  comment_log: CommentEntry[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const roomIdParam = req.query.roomId ?? req.query.room_id;
  const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
  if (!roomId) {
    res.status(400).json({ error: "roomId query parameter is required" });
    return;
  }

  const cacheKey = `${CACHE_PREFIX}${roomId}`;
  try {
    const cached = await readCache<CommentEntry[]>(cacheKey);
    if (cached) {
      res.status(200).json({ comment_log: cached });
      return;
    }

    const data = await fetchShowroomJson<CommentResponse>(
      `/api/live/comment_log?room_id=${roomId}`,
    );
    const comments = data.comment_log ?? [];
    await writeCache(cacheKey, comments, TTL_SECONDS);
    res.status(200).json({ comment_log: comments });
  } catch (error) {
    console.error("showroom:comments error", error);
    res.status(502).json({ error: "Failed to load comments" });
  }
}
