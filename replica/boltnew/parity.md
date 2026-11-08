# Parity report

```
Parity: 91.0 / 100
features 91.0  (34 counted, must-haves 21 of 23 done)
```

Measured with `replica-diff/parity.py` against `features.csv`. Every row below reflects
what was verified running, not what was intended.

## By area

| area | score | note |
| --- | --- | --- |
| projects | 100 | dashboard, thumbnails, search, sort, star, menu |
| versions | 100 | snapshot per turn, restore, rename, bookmark |
| accounts | 100 | sessions, isolation, meters, cap, settings |
| chat | 100 | history, plan mode, streaming steps |
| polish | 100 | search, save, send shortcuts |
| publish | 91 | public/private is partial: private uses a keyed link, no invites |
| preview | 86 | no preview theme switch; element-select is not in the original |
| code view | 83 | no file rename |
| core loop | 82 | follow-up prompts are a fixed vocabulary |
| responsive | 50 | single column measured, not click-tested |

## The two must-have partials

**Follow-up prompts change the app in place (partial).** Palette, accent colour, title,
adding and removing sections, type scale, contrast and motion all work and are verified.
A prompt outside that vocabulary is refused in one line, which is the honest behaviour for
a local agent with no model. It is still a partial against a product that can restyle
anything.

**Mobile layout with a full-screen preview (partial).** At a 390px viewport the app has
zero horizontal overflow and cards fit (358px wide); the layout is single-column with the
preview stage taking the screen. What has not been done is a click-through on a real phone,
so it is not claimed.

## Not rebuilt, with reasons

`skip` rows in `features.csv` carry a reason each: the in-browser runtime, hosted
databases, generated-app sign-in, Figma, GitHub, Supabase/Stripe/Netlify, Expo, teams and
multiplayer, billing, and hosting analytics. These need their infrastructure, their
accounts or their licensing, and faking them would be worse than leaving them out.

## Where it beats the gaps rather than closing them

- The build agent is local and deterministic, so a prompt it cannot serve says so instead
  of producing a plausible-looking but wrong app.
- Version restore creates a new version rather than rewriting history.
- Publishing is an immutable snapshot until explicitly updated.
- Every project query is scoped by session user (tested with a second account).

## To get to shippable

1. Replace the local agent with a model behind the worker, keeping the turn API unchanged.
2. Rename/move in the file tree (should-have).
3. A phone pass over dashboard, workspace and publish.
4. Invite-based private publishes, then custom subdomains.
