import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, PreviewServer, ViteDevServer } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const STREAM_PROXY_PATH = "/api/proxy/stream";
const STREAM_REFERER = "https://www.showroom-live.com/";
const STREAM_HOST_WHITELIST = [
  "showroom-live.com",
  "showroom-txlive.com",
  "playback.live-video.net",
];
const IDN_GRAPHQL_PROXY_PATH = "/api/proxy/idn/graphql";
const IDN_GRAPHQL_ENDPOINT = "https://api.idn.app/graphql";

function toProxyUrl(url: string) {
  return `${STREAM_PROXY_PATH}?url=${encodeURIComponent(url)}`;
}

function isAllowedStreamHost(hostname: string) {
  return STREAM_HOST_WHITELIST.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

function setCorsHeaders(
  res: ServerResponse,
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

function rewritePlaylist(content: string, baseUrl: URL) {
  return content
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return line;
      }
      if (trimmed.startsWith(STREAM_PROXY_PATH)) {
        return trimmed;
      }
      try {
        const resolved = new URL(trimmed, baseUrl);
        return toProxyUrl(resolved.toString());
      } catch {
        return line;
      }
    })
    .join("\n");
}

function createStreamProxyMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (!req.url?.startsWith(STREAM_PROXY_PATH)) {
      return next();
    }

    const requestUrl = new URL(req.url, "http://localhost");
    const target = requestUrl.searchParams.get("url");

    if (!target) {
      res.statusCode = 400;
      res.end("Missing url parameter");
      return;
    }

    let parsedTarget: URL;
    try {
      parsedTarget = new URL(target);
    } catch {
      res.statusCode = 400;
      res.end("Invalid url parameter");
      return;
    }

    if (!isAllowedStreamHost(parsedTarget.hostname)) {
      res.statusCode = 400;
      res.end("Blocked stream host");
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

      res.statusCode = upstream.status;
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
        res.end(rewritten);
        return;
      }

      if (!upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(upstream.body as ReadableStream);
      nodeStream.on("error", (error) => {
        res.destroy(error);
      });

      nodeStream.pipe(res);
    } catch (error) {
      console.error("Stream proxy error", error);
      res.statusCode = 502;
      res.end("Stream proxy error");
    }
  };
}

function readRequestBody(req: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(chunk));
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function createIdnGraphqlProxyMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (!req.url?.startsWith(IDN_GRAPHQL_PROXY_PATH)) {
      return next();
    }

    if (req.method === "OPTIONS") {
      setCorsHeaders(res, ["POST", "OPTIONS"]);
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method not allowed");
      return;
    }

    try {
      const body = await readRequestBody(req);
      const upstream = await fetch(IDN_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://www.idn.app",
          referer: "https://www.idn.app/",
        },
        body,
      });

      res.statusCode = upstream.status;
      upstream.headers.forEach((value, key) => {
        if (key === "set-cookie" || key === "content-length") return;
        res.setHeader(key, value);
      });
      setCorsHeaders(res, ["POST", "OPTIONS"]);
      const payload = await upstream.text();
      res.end(payload);
    } catch (error) {
      console.error("IDN GraphQL proxy error", error);
      res.statusCode = 502;
      res.end("IDN proxy error");
    }
  };
}

function streamProxyPlugin() {
  const streamMiddleware = createStreamProxyMiddleware();
  const idnMiddleware = createIdnGraphqlProxyMiddleware();
  return {
    name: "showroom-stream-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(streamMiddleware);
      server.middlewares.use(idnMiddleware);
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(streamMiddleware);
      server.middlewares.use(idnMiddleware);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
    streamProxyPlugin(),
  ],
});
