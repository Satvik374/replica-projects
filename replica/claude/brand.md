# Brand — Alcove

The clone is called **Alcove**. Nothing in the shipped app carries the original's
name, domain, palette, logo, icons or copy; the sweep is clean.

## Name

An alcove is a recess you step into to work: part of the building, not on display.
It fits the positioning in `fixes.md` — a calmer place to think, with limits you
can see — and it shares no sound, shape or meaning with the original or with the
other assistants in the category.

Twenty candidates were generated across styles (descriptive: Quietdesk, Briefcase;
compound: Noteside, Longform; invented: Calven, Sollum; metaphor: Alcove, Harbor,
Ledge; verb: Draft). Cut to five: **Alcove**, Ledge, Noteside, Longform, Sollum.

| check | where | status |
| --- | --- | --- |
| US trademark, class 9 and 42 | tmsearch.uspto.gov | **to run** |
| EU trademark | euipo.europa.eu eSearch / TMview | **to run** |
| Canada | ised-isde.canada.ca trademarks database | **to run** |
| Global | WIPO Global Brand Database | **to run** |
| Domain | registrar whois for `alcove.app`, `alcove.chat`, `getalcove.com` | **to run** |
| App Store and Play | search the exact name | **to run** |
| Handles | X, Instagram, TikTok, GitHub | **to run** |
| The web | search "alcove" plus the category | **to run** |

No check is marked available, because none has been run. These are screening
checks; a trademark lawyer should clear the name before money is spent on it.

## Palette

Pine green on chalk, chosen to sit in a different hue family from the original's
clay and cream, so the two are never confused at a glance.

| role | light | dark |
| --- | --- | --- |
| bg | `#f7f6f2` | `#141a18` |
| surface | `#ffffff` | `#1e2623` |
| sidebar | `#efeee7` | `#111715` |
| text | `#1b2321` | `#eef2ef` |
| text-2 | `#55605c` | `#a9b5b0` |
| accent | `#17614f` | `#7bc9ae` |
| on-accent | `#ffffff` | `#0c1714` |
| bubble | `#e8eee9` | `#26332e` |
| danger | `#a4302a` | `#f08b80` |

`contrast.py` on the token file: **28 pairs, 0 failing AA** (body text 14.8:1 and
16.0:1, secondary 6.0:1, placeholder-level 4.8:1, on-accent 7.3:1, input borders
3.3:1 and 3.4:1 as UI graphics). The original's colours are listed in `brand.json`
so the sweep catches any that survive.

## Logo brief

- **Idea:** a doorway you can walk into — an arch, drawn with one stroke weight,
  sitting inside a rounded square. It reads as "somewhere to think" without a face,
  a spark or a star.
- **Mark type:** symbol plus wordmark. The wordmark is set in the serif already
  used for headings, so the app and the logo share one voice.
- **Must work at:** 16px favicon (already in `index.html` as inline SVG), 32px app
  icon, 1024px store icon with no transparency.
- **Deliverables:** SVG master, 1024×1024 PNG (opaque), favicon set, 1200×630
  social image.
- **Must not resemble the original's mark:** no asterisk-like burst, no clay
  orange, no cream-on-terracotta pairing. Check the drafts side by side with the
  original's logo before shipping.

## Voice

**Plain, unhurried, specific.** Plain, not blunt — it explains rather than
shrugs. Unhurried, not slow — short sentences, no filler. Specific, not technical
— names the number, the rule, the next action.

Do / don't:

- Do say "60 messages per five-hour window. It resets at 14:20." Don't say "usage limits may apply."
- Do say "Sign in to keep your chats." Don't say "Unlock the full power of AI."
- Do say "This link is not available." Don't say "Oops! Something went wrong 😅"
- Do say "Alcove replies are generated on your device from a scripted engine." Don't hint that a model is running.
- Do say "Delete everything" on the destructive button. Don't say "Continue".

Ten most-seen strings, rewritten in that voice: the sign-up heading ("Create your
account"), the signed-out home line ("A quiet place to think out loud"), the empty
thread ("Nothing here yet. Write the messy version below."), the composer hint
("How can I help you today?"), the share explanation, the usage line, the limit
message, the revoked-link page, the delete confirmation and the artifact empty
state.

## Sweep

```
python3 .claude/skills/replica-brand/sweep.py claude-clone/public --config replica/claude/brand.json
Clean. Nothing of the original's name, domain or colours found.

python3 .claude/skills/replica-brand/sweep.py claude-clone/worker.js --config replica/claude/brand.json
Clean.
```

The shipped app is clean. The README and the `replica/` planning folder do name the
app this is a study of — that is attribution, not branding, and neither ships in the
deployed assets.
