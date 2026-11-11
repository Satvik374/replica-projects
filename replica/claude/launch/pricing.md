# Pricing — Alcove

## What the category charges (read on the day, not remembered)

| product | free tier | paid | source | read |
| --- | --- | --- | --- | --- |
| the original | yes, with tighter limits | Pro and Max tiers, monthly | its public pricing page — **read on launch day and record the URL** | **not read** |
| a second assistant | yes | one consumer tier, monthly/annual | its public pricing page | **not read** |
| a third assistant | yes | one consumer tier | its public pricing page | **not read** |

No numbers are written here because none were read from a source today. Prices in
this category change often and a copied price is worse than an empty cell. Before
launch, fill this table with the URL and the date for each row.

## What reviewers said about price and billing

Thin: **1 of 10** reviews in `../reviews.csv` mentions price or plan value, and it
is about a plan's limit being hit rather than the sticker price
([r/ClaudeCode](https://www.reddit.com/r/ClaudeCode/comments/1wf9uuf/wth_is_going_on_with_claude_usage_limits/)).
The billing complaints that matter in this category — per-seat jumps, hard-to-cancel
subscriptions, surprise renewals — did **not** appear in this sample. Treat that as
"not yet evidenced", not as "not a problem".

## The model

- **Free** — $0. 60 messages per five-hour window, 5 projects, 200 KB per knowledge
  file. Enough to finish something small and see whether the counting works for you.
- **Solo** — $12/month, or $120/year (two months free). 400 messages per window,
  unlimited projects, 2 MB per knowledge file, shared chats.
- **Team** — $20 per seat/month, or $200 per seat/year. Everything in Solo plus
  shared projects and an admin list of shared chats.

Rules that make it defensible:

1. **Flat, never per-seat for individuals.** A solo user is never charged twice for
   using two devices.
2. **The limit is a number, not a mystery.** Every tier states messages per window
   and shows the reset time in the product.
3. **Cancel in one click**, in Settings, without a retention call or an email.
4. **No surprise renewal.** A receipt email seven days before renewal, and the next
   charge shown on the plan card at all times.
5. **Downgrade keeps your data.** Projects over the new cap become read-only; nothing
   is deleted for billing reasons.
6. **One refund window**, stated in plain words: 14 days, no questions.

## Stripe objects to create (the owner creates them)

| product | price | interval |
| --- | --- | --- |
| Alcove Solo | $12.00 | month |
| Alcove Solo | $120.00 | year |
| Alcove Team | $20.00 per seat | month |
| Alcove Team | $200.00 per seat | year |

Checkout via Stripe Checkout; plan changes and cancellation via the Customer
Portal. Subscription state lives in our database and is written by verified
webhooks only — never by the client. **None of this is wired in this build**: there
is no payment provider configured, and the Usage tab's "Compare plans" button says
so rather than pretending to charge.
