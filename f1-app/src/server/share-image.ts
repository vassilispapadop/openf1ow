// Content-addressed PNG share. Clients POST a chart screenshot; we hash the
// bytes, store the blob in R2 under share/img/{hash}.png, and return a stable
// public URL. Identical screenshots dedupe on the hash — no duplicate storage.

const MAX_UPLOAD_BYTES = 3_000_000;     // ~3 MB per chart is plenty
const HASH_LEN = 16;                     // 64 bits — collision-safe at this scale

const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

function isPng(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 8) return false;
  const head = new Uint8Array(buf, 0, 8);
  return PNG_MAGIC.every((b, i) => head[i] === b);
}

async function shortHash(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, HASH_LEN);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function handleShareImageUpload(opts: {
  request: Request;
  F1_DATA: R2Bucket;
}): Promise<Response> {
  const { request, F1_DATA } = opts;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("image/png")) {
    return Response.json({ error: "Expected image/png" }, { status: 415, headers: CORS_HEADERS });
  }

  const lenHeader = request.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Image too large" }, { status: 413, headers: CORS_HEADERS });
  }

  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0) {
    return Response.json({ error: "Empty body" }, { status: 400, headers: CORS_HEADERS });
  }
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Image too large" }, { status: 413, headers: CORS_HEADERS });
  }
  if (!isPng(buf)) {
    return Response.json({ error: "Not a PNG" }, { status: 415, headers: CORS_HEADERS });
  }

  const hash = await shortHash(buf);
  const key = `share/img/${hash}.png`;

  // Dedupe: skip the put if an object already exists at this key.
  const existing = await F1_DATA.head(key);
  if (!existing) {
    await F1_DATA.put(key, buf, {
      httpMetadata: { contentType: "image/png" },
      customMetadata: { uploadedAt: String(Date.now()) },
    });
  }

  const origin = new URL(request.url).origin;
  return Response.json(
    { url: `${origin}/share/img/${hash}.png`, hash },
    { headers: CORS_HEADERS },
  );
}

export async function handleShareImageRead(opts: {
  url: URL;
  F1_DATA: R2Bucket;
}): Promise<Response | null> {
  const m = opts.url.pathname.match(/^\/share\/img\/([a-f0-9]+)\.png$/);
  if (!m) return null;

  const key = `share/img/${m[1]}.png`;
  const obj = await opts.F1_DATA.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  return new Response(obj.body, {
    headers: {
      "Content-Type": "image/png",
      // Content-addressed → contents never change → cache forever
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
