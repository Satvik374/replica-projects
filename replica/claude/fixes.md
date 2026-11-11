# Entrepreneur — what the original's users hate, and what Alcove does about it

**Sample: 10 public reviews and threads, 4 sources, all on Reddit**
(`r/ClaudeAI`, `r/Anthropic`, `r/ClaudeCode`, `r/claude`). Zero star ratings, so
nothing here is weighted by stars. Under 30 reviews supports a direction, not a
ranking — `reviews.py` says so, and it is right. Every quote below is verbatim,
with its link, in `reviews.csv`; nothing is invented and no reviewer is used as a
testimonial.

## 1. What they hate

| theme | reviews | sources | weighted score |
| --- | --- | --- | --- |
| Message and usage limits | 8 | 4 | 3.9 |
| Project context and retrieval *(thin)* | 3 | 1 | 1.5 |
| Long conversations burn the budget *(thin)* | 3 | 1 | 1.2 |
| Price and plan value *(thin)* | 1 | 1 | 0.6 |
| Artifacts that break *(thin)* | 1 | 1 | 0.3 |
| Limits that are hard to predict *(thin)* | 1 | 1 | 0.3 |

The strongest thread, with links:

- "getting put in timeout in a 5-hour window slows me down" — [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1uzua3q/i_dont_get_complains_about_limits_and_max_plan/)
- "The other day I sent one message, and immediately hit my message limit." — [r/claude](https://www.reddit.com/r/claude/comments/1s3g45j/can_someone_please_explain_to_me_how_message/)
- "I will litterally hit the limit if I attach more than 3 files to a chat." — [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1htuxni/hitting_claude_limits_almost_immediately_its/)
- "AND bam i'm blocked for 2 days from using Claude code, I have a deadline" — [r/Anthropic](https://www.reddit.com/r/Anthropic/comments/1sci37g/love_claude_ai_hate_usage_limits_especially_the/)

The thin themes are listed as thin on purpose. One Reddit comment about artifacts
is not a trend:

- "I love the concept, but it's just so buggy that I've had to turn off Artifacts." — [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1iglp9w/ive_given_up_on_artifacts/)
- "Now when I ask a question about a project, it does not read the documents but makes a search in the documents about what I asked." — [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1nu7fv0/claude_projects_just_changed_and_now_it_is_much/)

## 2. What is missing

`reviews.py` found no explicit feature requests in these ten ("What they ask for:
Nothing matched"), which is itself informative: the complaints are about how the
existing features behave, not about missing buttons. Two implicit asks appear:

- A way to know **what a conversation is costing** before it costs it. The most
  useful community post is a guide on avoiding limits by editing instead of
  following up — users are doing the accounting by hand.
- **Project knowledge that stays in the thread** rather than being swapped for a
  retrieval pass the user did not ask for.

## 3. What is unsolved

Whole jobs the original does not serve well, per this sample:

- **Planning around a limit.** Every complaint is about surprise, not about the
  size of the limit. Nobody wants unlimited; they want to know when they can work.
- **Predictability at the peak.** The company's own reply confirms limits tighten
  at peak hours — so the same hour of work costs different amounts at different
  times of day.
- **Small teams and solo people priced like organisations.** One review names a
  20x plan and a wasted $100 credit top-up.

## 4. Fix plan

| # | fix | size | skill | evidence | status |
| --- | --- | --- | --- | --- | --- |
| 1 | Publish the counting rule and the reset time in the product | S | build | limits, 8 reviews / 4 sources | **built**: Settings → Usage states "one message per five-hour window, 60 per window" with a live reset time |
| 2 | Show remaining messages *before* sending, and block with a reason | S | build | limits, 8/4 | **built**: sidebar meter, composer marked blocked, 429 carries the reset time |
| 3 | No peak-hour variance: the same message always costs the same | S | backend | limits + opaque, 8/4 | **built**: the window is per account and stored, not per request cost |
| 4 | Name the knowledge a reply used, and never swap retrieval modes silently | M | build | project context, 3/1 (thin) | **partial**: project replies list the files in play; knowledge is read in full, there is no RAG mode to switch into |
| 5 | Version artifacts so a bad revision never loses work | S | build | artifacts, 1/1 (thin) | **built**: versions menu, copy, download |
| 6 | One-click export and one-click delete, always | S | build | price/privacy, thin | **built**: Privacy tab |
| 7 | Flat pricing, one-click cancel, no seat-jump surprises | M | launch | price, 1/1 (thin) | **priced, not wired**: `launch/pricing.md`; no payment provider is configured |

Fixes 1–3 are the ones with real evidence behind them, and they are the ones built
first. Fix 4 is thin evidence and built partially. Fixes 5–6 are cheap insurance.

## 5. The angle

```
For people who keep hitting the wall mid-project,
Alcove is a thinking space that shows the budget before you spend it:
one message, one count, a reset time you can plan around, and no peak-hour tax.
Evidence: message and usage limits, 8 of 10 reviews across 4 subreddits.
```

Two alternates, kept honest about their thin evidence:

- "For people whose project files quietly stopped mattering: knowledge that stays
  in the thread, and replies that name what they used." — project context, 3
  reviews, 1 source. Thin.
- "For people who lost work to a broken artifact: versioned artifacts you can roll
  back." — artifacts, 1 review, 1 source. Thin.

**Recommended: the first.** It is the only theme with more than one source, it is
about behaviour rather than a missing button, and it is the one a competitor cannot
answer with a marketing line — either the count is visible or it is not.

## 6. Caveats

This is research, not a legal position. Ten public posts is a direction, not a
market study; a proper pass would read the App Store and Play listings, G2, Capterra
and the product's own feature board, and would want 100+ rows. Do not quote these
reviewers in marketing, and do not name the original in any listing or ad.
