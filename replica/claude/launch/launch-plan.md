# Launch plan — Alcove

## Before launch

- **A beta list, not a waitlist.** The angle is about predictability, so the ask is
  concrete: "tell me your last surprise limit and I will show you the count."
- **Analytics that respect the angle.** Server-side event counts only — signups,
  messages sent, shares created, exports. No third-party script, no session
  recording, no advertising pixels, and no cookie banner because there is nothing
  non-essential to consent to.
- **Error tracking** on the Worker (`wrangler tail` plus an error-log table is
  enough at this size) with an alert to the owner's email.
- **The counting rule on the pricing page**, in the same words as in the product.

## Where the unhappy users already are

The communities in `../reviews.csv` are where this conversation happens:
`r/ClaudeAI`, `r/Anthropic`, `r/ClaudeCode`, `r/claude`. Post there only where the
community's own rules allow promotion, answer the question that was asked, and do
not lead with the product. The honest pitch writes itself: "here is how the count
works in what I built" beats any claim.

## The launch post

- **Title:** I built a chat workspace where the message budget is on screen, because
  the surprise limit was the thing that ruined my week.
- **Body:** the problem (surprise, peak-hour variance), the rule chosen (one message,
  five-hour window, published reset time), what is deliberately missing (no model
  behind the replies — say it in the first paragraph, not the last), and what is
  next (importer, real model behind the same interface).
- Product Hunt the same week, with the usage screenshot as the gallery image.

## First ten users, by hand

1. Anyone who complained about limits in the threads above, answered publicly with
   the counting rule rather than a link.
2. Five people who work in long projects (writers, researchers) asked to try the
   project knowledge path and report what felt wrong.
3. Three people asked to try to break the share snapshot: send after sharing, revoke
   mid-read, open a revoked link.

## Store listing

`listing.json`, linted with `listing.py`: name 30 characters, subtitle 30,
keywords 100 with no repeats, and no name from `avoid` anywhere. Apple's Guideline
4.1 (copycats) is the risk to design around: the first screenshot and the first two
lines of the description lead with the fixes, not with the category.
