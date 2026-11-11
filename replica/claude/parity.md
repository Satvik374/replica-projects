# Parity — Alcove vs the signed-in reference

Tool: `python3 .claude/skills/replica-diff/parity.py replica/claude/features.csv`

```
Parity: 100.0 / 100
features 100.0 (61 counted, must-haves 43 of 43 done)
Missing, in build order: nothing. Every counted feature is done.
```

Nine features are deliberately excluded from scoring, each with a reason in the
matrix: real model inference, web search, server-side code execution, connectors/
MCP, cross-chat memory, team project sharing, real billing, email verification and
password reset, native mobile apps.

## What 100 means, and what it does not

It means every feature this build claims to have is implemented and reachable in
the UI and the API. It does not mean the reply quality matches a hosted model — it
cannot, because there is no model. The interface states that in the composer hint
and in Settings → About.

## Layout score

**Not measured.** The reference's signed-in surface is behind an account, and this
work did not capture screenshots of it. `imgdiff.py` needs two screenshots at the
same viewport, so running it against marketing pages would produce a meaningless
number. Feature parity is measured; layout parity is unverified, and the recon map
records the measurements that were available from public documentation.

## Behaviour differences

| flow | the reference | Alcove | keep or fix |
| --- | --- | --- | --- |
| Sharing | public snapshot as of share time; attachments excluded | same, with `shared_seq` enforced in the query and attachments stripped | keep |
| Incognito | ghost toggle, not saved to history or memory | same, and it never reaches D1 at all | keep |
| Projects on Free | five-project cap | same, enforced server-side with a readable 403 | keep |
| Styles | presets plus custom styles; presets moving to skills | five presets plus custom styles with instructions | keep (skills are out of scope) |
| Artifacts | preview, versions, share, templates, code | preview, versions, copy, download; no templates or publishing | partial, stated |
| Usage | plan limits shown in Settings → Usage | own rule: 60 messages per five-hour window, published and enforced | difference on purpose: honest about the rule |
| Account | sign in with email, Google, Apple | email and password only | partial: OAuth needs provider apps |
| Memory | cross-chat memory on paid plans | project knowledge and standing instructions only | skip, stated |

## Verdict

**Shippable as a feature-complete study**, with these honest caveats: no real
model, no layout diff against the original, no assistive-technology session, and
no team, billing, email or OAuth paths. There are no open S1 or S2 bugs; the API
suite is 45/45.

## Next five things, in order

1. A model behind `engine.js` with the same reply interface (one function).
2. FTS5 search with highlighted snippets.
3. Artifact publishing behind a signed token, instead of preview only.
4. Real billing with one-click cancel, once a payment provider is chosen.
5. Email verification and password reset, which also unlocks account recovery.
