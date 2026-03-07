import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const STREAM_REFERER = "https://www.showroom-live.com/";
const STREAM_HOST_WHITELIST = [
  "showroom-live.com",
  "showroom-txlive.com",
  "playback.live-video.net",
];

function setCorsHeaders(
  res: VercelResponse,
  methods: string[] | string = ["GET", "HEAD", "OPTIONS"],
) {
  const allowMethods = Array.isArray(methods) ? methods.join(",") : methods;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Range",
  );
  res.setHeader("Access-Control-Allow-Methods", allowMethods);
}

function isAllowedStreamHost(hostname: string) {
  return STREAM_HOST_WHITELIST.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

function rewritePlaylist(content: string, baseUrl: URL) {
  return content
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return line;
      }
      if (trimmed.startsWith("/api/proxy/stream")) {
        return trimmed;
      }
      try {
        const resolved = new URL(trimmed, baseUrl);
        return `/api/proxy/stream?url=${encodeURIComponent(resolved.toString())}`;
      } catch {
        return line;
      }
    })
    .join("\n");
}

function extractQueryParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

async function handleRequest(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.status(204).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).send("Method not allowed");
    return;
  }

  const target = extractQueryParam(
    req.query.url as string | string[] | undefined,
  );
  if (!target) {
    res.status(400).send("Missing url parameter");
    return;
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(target);
  } catch {
    res.status(400).send("Invalid url parameter");
    return;
  }

  if (!isAllowedStreamHost(parsedTarget.hostname)) {
    res.status(400).send("Blocked stream host");
    return;
  }

  try {
    const headers = new Headers();
    const rangeHeader = req.headers.range;
    const userAgent = req.headers["user-agent"];

    if (rangeHeader) {
      headers.set(
        "range",
        Array.isArray(rangeHeader) ? rangeHeader[0] : rangeHeader,
      );
    }
    if (userAgent) {
      headers.set(
        "user-agent",
        Array.isArray(userAgent) ? userAgent[0] : userAgent,
      );
    }

    headers.set("referer", STREAM_REFERER);
    headers.set("origin", STREAM_REFERER);

    const upstream = await fetch(parsedTarget.toString(), { headers });
    const isPlaylist = parsedTarget.pathname.endsWith(".m3u8");

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key === "set-cookie" || key === "content-length") return;
      res.setHeader(key, value);
    });
    setCorsHeaders(res);

    if (isPlaylist) {
      const playlistText = await upstream.text();
      const rewritten = rewritePlaylist(playlistText, parsedTarget);
      if (!res.hasHeader("content-type")) {
        res.setHeader(
          "content-type",
          "application/vnd.apple.mpegurl; charset=utf-8",
        );
      }
      res.send(rewritten);
      return;
    }

    if (!upstream.body) {
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(upstream.body as NodeReadableStream);
    nodeStream.on("error", (error) => {
      res.destroy(error as Error);
    });
    nodeStream.pipe(res);
  } catch (error) {
    console.error("Stream proxy error", error);
    res.status(502).send("Stream proxy error");
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleRequest(req, res);
}
