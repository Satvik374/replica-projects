/* Alcove on Vercel — a serverless adapter around the same Worker logic.
 *
 * worker.js is written against Cloudflare's D1 binding (env.DB with
 * prepare/bind/first/all/run/batch). This file gives the Vercel runtime the
 * same surface, backed by whichever database is configured:
 *
 *   1. POSTGRES_URL / DATABASE_URL set -> PostgreSQL via `pg`. This is the
 *      production path: create a Postgres database in the Vercel dashboard
 *      (Storage -> Postgres) or connect Neon, and set POSTGRES_URL.
 *   2. No connection string -> a local SQLite file via node:sqlite
 *      (ALCOVE_DB_PATH, default /tmp/alcove-vercel.db on Vercel). Sign-up and
 *      everything else works, but the file is ephemeral on Vercel: it does not
 *      survive cold starts or differ between instances. Smoke test only.
 *
 * Static files come from public/ (see vercel.json). This function answers
 * /api/* and, if an app route is ever rewritten here, returns the shell.
 */

import pg from "pg";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import worker from "../worker.js";

/* Postgres returns BIGINT as a string. Alcove stores epoch millis and counters
   in INTEGER columns, translated to BIGINT below, so parse them back. */
pg.types.setTypeParser(20, (value) => parseInt(value, 10));

/* ------------------------------------------------------------------ postgres
   D1 SQL is SQLite SQL. The differences that matter here:
   - placeholders: D1 uses `?` and `?1..?n`; Postgres uses $1..$n
   - INTEGER is 32-bit in Postgres; epoch-millis timestamps need BIGINT
   - LIKE is case-insensitive in SQLite for ASCII; ILIKE keeps that behaviour
   - COLLATE NOCASE has no Postgres equivalent and is dropped
*/

let pool = null;

function translatePg(sql, params) {
  const values = [];
  let next = 1;
  let out = String(sql).replace(/\?(\d+)?/g, (_match, n) => {
    const index = n ? parseInt(n, 10) : next++;
    if (n) next = Math.max(next, index + 1);
    values.push(params[index - 1]);
    return `$${values.length}`;
  });
  out = out.replace(/\bINTEGER\b/gi, "BIGINT");
  out = out.replace(/\bLIKE\b/gi, "ILIKE");
  out = out.replace(/\s+COLLATE\s+NOCASE/gi, "");
  return { sql: out, values };
}

function pgDatabase(connectionString) {
  if (!pool) {
    const local = /localhost|127\.0\.0\.1/.test(connectionString);
    pool = new pg.Pool({
      connectionString,
      ssl: local ? undefined : { rejectUnauthorized: false },
      max: 5
    });
  }

  const statement = (sql, params) => ({
    sql,
    params,
    async query(client) {
      const { sql: text, values } = translatePg(sql, params);
      return (client || pool).query(text, values);
    },
    async first(client) {
      const result = await this.query(client);
      return result.rows[0] ?? null;
    },
    async all(client) {
      const result = await this.query(client);
      return { results: result.rows };
    },
    async run(client) {
      const result = await this.query(client);
      return { success: true, meta: { changes: result.rowCount } };
    }
  });

  return {
    prepare(sql) {
      // D1 statements run unbound too (schema creation), so prepare() itself
      // must answer run/first/all; bind() returns the parameterised copy.
      const unbound = statement(sql, []);
      unbound.bind = (...params) => statement(sql, params);
      return unbound;
    },
    async batch(statements) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const item of statements) await item.run(client);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

/* -------------------------------------------------------------------- sqlite */

function sqliteDatabase(path) {
  const db = new DatabaseSync(path);

  const statement = (sql, params) => ({
    sql,
    params,
    first() {
      return db.prepare(sql).get(...params) ?? null;
    },
    all() {
      return { results: db.prepare(sql).all(...params) };
    },
    run() {
      db.prepare(sql).run(...params);
      return { success: true };
    }
  });

  return {
    prepare(sql) {
      const unbound = statement(sql, []);
      unbound.bind = (...params) => statement(sql, params);
      return unbound;
    },
    // async: ensureSchema chains .catch() on the batch result, like D1.
    async batch(statements) {
      db.exec("BEGIN");
      try {
        for (const item of statements) item.run();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

/* ------------------------------------------------------------------ database */

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const dbPath = process.env.ALCOVE_DB_PATH || (process.env.VERCEL ? "/tmp/alcove-vercel.db" : "./alcove-vercel.db");

const DB = connectionString ? pgDatabase(connectionString) : sqliteDatabase(dbPath);

const ASSETS = {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/" || !path.includes(".")) {
      try {
        const html = await readFile(new URL("../public/index.html", import.meta.url));
        return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
      } catch {
        /* fall through */
      }
    }
    return new Response("Not found", { status: 404 });
  }
};

const env = {
  DB,
  DB_MODE: connectionString ? "postgres" : "sqlite-ephemeral",
  ASSETS
};

/* ------------------------------------------------------------ request mapping
   Vercel rewrites /api/* to this function and passes the original path as
   ?__path=.... Rebuild a standard Web Request so worker.js — which speaks
   fetch() — receives exactly what it expects. The protocol must be https on
   Vercel, otherwise the Worker's same-origin check compares an https Origin
   against an http url.origin and refuses every mutation. */

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string" || req.body instanceof Uint8Array) return req.body;
    return JSON.stringify(req.body);
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  try {
    const host = req.headers.host || "localhost";
    const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
    const proto = forwarded || (localHost ? "http" : "https");
    const url = new URL(req.url, `${proto}://${host}`);

    if (typeof req.query?.__path === "string") {
      url.pathname = `/${req.query.__path.replace(/^\/+/, "")}`;
      url.searchParams.delete("__path");
    }

    const method = (req.method || "GET").toUpperCase();
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item);
    }

    const init = { method, headers };
    if (method !== "GET" && method !== "HEAD") {
      const body = await readBody(req);
      if (body) init.body = body;
    }

    const response = await worker.fetch(new Request(url.toString(), init), env);

    const outHeaders = {};
    response.headers.forEach((value, key) => {
      if (key !== "set-cookie") outHeaders[key] = value;
    });
    const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    if (cookies.length) outHeaders["set-cookie"] = cookies;

    res.writeHead(response.status, outHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("vercel-adapter", error);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Something went wrong on the server.", detail: message }));
  }
}

/* Exported for tests: SQL translation is the only Postgres-specific logic. */
export { translatePg };
