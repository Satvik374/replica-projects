/* Anvel on Vercel — a serverless adapter around the same Worker logic.
 *
 * worker.js is written against Cloudflare's D1 binding (env.DB with
 * prepare/bind/first/all/run/batch). This file gives the Vercel runtime the
 * exact same surface, backed by whichever database is configured:
 *
 *   1. POSTGRES_URL / DATABASE_URL set  ->  PostgreSQL via `pg`. This is the
 *      production path on Vercel: create a Postgres database in the Vercel
 *      dashboard (Storage -> Postgres) or connect Neon/Supabase, and copy the
 *      connection string into the project as POSTGRES_URL.
 *   2. No connection string             ->  a local SQLite file via
 *      node:sqlite (ANVEL_DB_PATH, default /tmp/anvel-vercel.db on Vercel,
 *      ./anvel-vercel.db locally). Sign-up and projects work immediately,
 *      but the file is ephemeral on Vercel — it does not survive cold starts
 *      or differ between instances. Good for a smoke test, not for users.
 *
 * Static files come from public/ (see vercel.json: outputDirectory + rewrites
 * for /api/* and /s/*). This function only answers those two families; the
 * hash-routed app shell never reaches it.
 */

import pg from "pg";
import { DatabaseSync } from "node:sqlite";
import worker from "../worker.js";

/* Postgres returns BIGINT as a string by default; Anvel stores millisecond
   timestamps in INTEGER columns, so parse them back to numbers. */
pg.types.setTypeParser(20, (value) => parseInt(value, 10));

/* ------------------------------------------------------------------ postgres
   D1 SQL is SQLite SQL. The differences that matter here:
   - placeholders: D1 uses `?` and `?1..?n`; Postgres uses $1..$n
   - `COLLATE NOCASE` has no Postgres equivalent (search is filtered in JS)
   - INTEGER is 32-bit in Postgres; epoch-millis timestamps need BIGINT   */

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
  out = out.replace(/\s+COLLATE\s+NOCASE/gi, "");
  out = out.replace(/\bINTEGER\b/gi, "BIGINT");
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
      await this.query(client);
      return { success: true };
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
      // D1 statements run unbound too (schema creation), so prepare() itself
      // must answer run/first/all; bind() returns the parameterised copy.
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
const dbPath = process.env.ANVEL_DB_PATH || (process.env.VERCEL ? "/tmp/anvel-vercel.db" : "./anvel-vercel.db");

const DB = connectionString ? pgDatabase(connectionString) : sqliteDatabase(dbPath);

const env = {
  DB,
  ASSETS: {
    async fetch() {
      return new Response("Not found", { status: 404 });
    }
  }
};

/* ------------------------------------------------------------ request mapping
   Vercel rewrites /api/* and /s/* to this function and passes the original
   path as ?__path=.... Rebuild a standard Web Request so worker.js — which
   speaks fetch() — receives exactly what it expects. */

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
    const url = new URL(req.url, `http://${host}`);

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
    res.end(await response.text());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Something went wrong on the server.", detail: message }));
  }
}

/* Exported for tests: the SQL translation is the only Postgres-specific logic. */
export { translatePg };
