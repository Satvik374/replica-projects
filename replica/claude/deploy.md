# Deploy — Alcove

## Preflight

Every check below was run, with its actual result, on 2026-11-11.

| check | command | result |
| --- | --- | --- |
| Syntax, Worker and every client module | `npm run check` | **pass** (exit 0) |
| API suite, local Worker + local D1 | `python3 scripts/api-test.py` | **45 / 45 pass** |
| API suite, deployed preview + its D1 | `python3 scripts/api-test.py https://site-d6c5afdc6b2e48d09ef1bdb7842eedf9.freebuff.page` | **45 / 45 pass** |
| Feature parity | `parity.py replica/claude/features.csv` | **100.0 / 100**, must-haves 43/43, no open must-have |
| Rebrand sweep, shipped UI | `sweep.py claude-clone/public --config replica/claude/brand.json` | **clean** |
| Rebrand sweep, Worker | `sweep.py claude-clone/worker.js --config replica/claude/brand.json` | **clean** |
| Store listing lint | `listing.py replica/claude/launch/listing.json` | **0 errors**, 1 warning (four keywords repeat words already in the name/subtitle) |
| Contrast | `contrast.py replica/claude/design/tokens.json` | **28 pairs, 0 failing AA**, both themes |
| Open S1/S2 bugs | `replica/claude/bugs.md` | **none open** |
| Privacy and terms pages | — | **not built**. A real launch needs both, plus a processor list; this build uses no processors, which makes the policy short but not optional. |
| Account deletion | API suite | pass |
| Console errors on the main screens | browser pass | none after fixes; one Chrome warning about password fields was fixed by putting them in a form |
| Visual check | browser, 1440×900 + 390px frame | home, chat, artifact, dark settings, mobile drawer, share page — inspected, but the screenshot tool returned images without writing files to the workspace, so **no screenshots are committed** and `imgdiff.py` was not run |

`npx playwright test` was **not run**: the Playwright sandbox in this environment
failed with an internal serialisation error, so the browser pass used the Cloud
browser's own tools instead. That is a real gap in automation, not a pass.

## What was deployed

- **Site:** Alcove, id `8c1d4a62-3f5b-4e79-9a2c-7d6b1e0f4a53`.
- **Environment:** preview only.
- **Preview URL:** https://site-d6c5afdc6b2e48d09ef1bdb7842eedf9.freebuff.page
- **Status:** `published: true` for preview (verified with `sites_inspect` after
  the deploy; this is a public URL).
- **Binding:** D1 `DB`, provisioned before deploy (`requiresDeployment: true`, then
  deployed), resource `site-8d5bbcbbf9fc40f4aa7082081118c0b1`.
- **Assets:** `public/` only — HTML, CSS, the five JS modules, inline SVG sprite.
  Worker code is bundled from `deploy.json`; no secrets, no source maps, no
  planning folder.
- **Production:** **not deployed and not published.** The production environment
  exists and is empty. Publishing it needs the owner's explicit go, and there is
  nothing production-specific to configure yet (no domain, no email, no payments).

## Verified on the deployed origin

- `GET /api/health` → `200 {"ok":true,"db":true}`.
- `GET /` → `200 text/html`, the app shell.
- The full 45-check suite against the deployed Worker: accounts, sessions, chats,
  messages, artifact round-trip, share snapshot boundary and revocation,
  project cap, knowledge add/remove, styles, settings, export, search,
  cross-origin refusal, second-account isolation, password change, account
  deletion.
- The suite's first run failed with `error code: 1010` because Python's default
  User-Agent is blocked at the edge. Adding a real User-Agent fixed the harness;
  the app was always reachable from a browser.

## Production services

None. There is no Stripe, no email provider, no OAuth client and no model API key,
because none of those features are implemented. `.env.example` is therefore absent
on purpose: there is nothing to configure. If a model is added later, the key goes
in Sites → Secrets, never in the client.

## Domain

No custom domain. When one is bought:

| record | name | value |
| --- | --- | --- |
| A / CNAME | `@` | the Sites-provided target for production |
| CNAME | `www` | same target, then one canonical redirect |
| TXT | `@` | host verification, if asked |

Email DNS (SPF, DKIM, DMARC) becomes relevant only when an email provider is
added. HTTPS is automatic on the Sites host; check it after pointing the domain.

## Watch it

- Worker logs via `wrangler tail` (Sites → logs) for 5xx and schema errors.
- Uptime check on `/` and `/api/health`.
- No analytics are installed. If added, keep them server-side and privacy-friendly
  so the app stays cookie-banner-free.
- First-week checks by hand: sign up on a phone, send past the limit, revoke a
  share link, export, delete the account.

## Not done, stated plainly

Production publish, custom domain, privacy/terms pages, real billing, email
verification and password reset, team sharing, and a real model behind the reply
interface. Every one of these is listed as a `skip` row or a limitation elsewhere
in `replica/claude/`, not hidden here.
