# Anvel — brand and clean-room rules

The rebuild ships under its own name, palette, voice and type. `brand.json` is the
machine-checked contract; this file is the reasoning.

## Identity

- **Name:** Anvel. Nothing in the product, the URL structure, the API or the generated
  apps refers to the original.
- **Tagline:** *Describe it. Ship it.* The landing headline is
  "Describe a thing. Get a working app." — a different sentence from the original's.
- **Voice:** plain, dry, short. It admits limits in the interface ("Local agent",
  "Honest limits") instead of borrowing the original's marketing lines.

## Colour

Amber/copper accent on graphite in dark, warm ink on paper in light. The original's blue
family is deliberately absent: `#006bff`, `#1389fd`, `#2f5bea` and `#0d6efd` are listed in
`brand.json` and the sweep fails the build if any of them appear.

| role | dark | light |
| --- | --- | --- |
| accent | `#f0a13c` | `#a35a00` |
| on-accent | `#1a1206` | `#fff8ec` |
| background | `#0d0f12` | `#fbfaf7` |
| text | `#eef1f5` | `#171512` |
| text-muted | `#9aa4b2` | `#5d574c` |

Both themes pass WCAG AA on every text pair (`replica-design/contrast.py`, 11 pairs each,
0 failing). The light accent is a darker amber because `#f0a13c` on paper fails AA.

## Type and assets

- System sans stack and a system mono stack. No font files, and the original's typeface is
  never named or requested.
- Icons are drawn as a small inline sprite of simple strokes (`public/index.html`), not
  copied from the original set.
- No screenshots, logos, illustrations or copy from the original are in `anvel/`. The
  reference captures live in `replica/boltnew/screens/` for analysis only and are excluded
  from every deploy manifest.

## What was rebuilt, and what was not

Functionality and flow: the prompt box, streaming build feedback, the split workspace,
preview controls, code view with a terminal, features, version history, publish, accounts
and usage meters. Not rebuilt: their runtime, their hosted services, their model, their
brand assets, their network effects, and their hosted feature list. Those are recorded as
`skip` with a reason in `features.csv` rather than faked.

## Pre-launch check

```bash
python3 ../replica-skill/replica-brand/sweep.py . --config brand.json
```

Last run: **clean** — no original name, domain, colour, tagline or font in the shipped
tree.
