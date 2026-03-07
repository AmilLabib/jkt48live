import type { VercelRequest, VercelResponse } from "@vercel/node";

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
        origin: "https://www.idn.app",
        referer: "https://www.idn.app/",
      },
      body: bufferedBody.toString(),
    });

    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (key === "set-cookie" || key === "content-length") {
        return;
      }
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
}
