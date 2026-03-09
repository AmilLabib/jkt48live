import type { VercelRequest, VercelResponse } from "@vercel/node";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

const IDN_GRAPHQL_ENDPOINT = "https://api.idn.app/graphql";

function setCorsHeaders(res: VercelResponse, methods: string[] | string) {
  const allowMethods = Array.isArray(methods) ? methods.join(",") : methods;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", allowMethods);
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept",
  );
}

function readBody(req: VercelRequest): Promise<Buffer> {
  if (req.body) {
    if (typeof req.body === "string") {
      return Promise.resolve(Buffer.from(req.body));
    }
    if (Buffer.isBuffer(req.body)) {
      return Promise.resolve(req.body);
    }
    return Promise.resolve(Buffer.from(JSON.stringify(req.body)));
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const bufferedBody = await readBody(req);
    const upstream = await fetch(IDN_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept-encoding": "identity",
        origin: "https://www.idn.app",
        referer: "https://www.idn.app/",
      },
      body: bufferedBody.toString(),
    });

    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (
        key === "set-cookie" ||
        key === "content-length" ||
        key === "content-encoding"
      ) {
        return;
      }
      res.setHeader(key, value);
    });
    setCorsHeaders(res, ["POST", "OPTIONS"]);
    const encoding = upstream.headers.get("content-encoding");
    let buffer = Buffer.from(await upstream.arrayBuffer());
    let decoded = false;
    try {
      if (encoding === "br") {
        buffer = brotliDecompressSync(buffer);
        decoded = true;
      } else if (encoding === "gzip") {
        buffer = gunzipSync(buffer);
        decoded = true;
      }
    } catch (error) {
      console.error("IDN GraphQL proxy decompress error", error, {
        encoding,
      });
    }
    if (!decoded && encoding) {
      res.setHeader("content-encoding", encoding);
    }
    res.end(buffer);
  } catch (error) {
    console.error("IDN GraphQL proxy error", error);
    res.statusCode = 502;
    res.end("IDN proxy error");
  }
}
