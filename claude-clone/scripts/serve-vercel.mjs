/* Local stand-in for `vercel dev`, which needs an authenticated account.
 * Serves public/ like Vercel's static layer and hands /api/* to the real
 * api/index.js handler, so the API suite exercises the Vercel code path.
 *
 *   ALCOVE_DB_PATH=/tmp/alcove-vercel-test.db node scripts/serve-vercel.mjs
 */

process.env.ALCOVE_DB_PATH ||= "/tmp/alcove-vercel-test.db";

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../api/index.js";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const port = Number(process.env.PORT || 3100);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2"
};

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (path.startsWith("/api/")) return handler(req, res);

  const rel = normalize(path === "/" ? "/index.html" : path).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, rel);
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(body);
  } catch {
    const shell = await readFile(join(root, "index.html"));
    res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
    res.end(shell);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`alcove-vercel listening on http://127.0.0.1:${port} (db ${process.env.ALCOVE_DB_PATH})`);
});
