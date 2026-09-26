# ADR-004: Optional free-tier weekly summaries

## Status

Accepted

## Date

2026-09-26

## Context

Monday's weekly post can be long when several people logged rows. A short summary is easier to read in Chat. The summary is optional: the roll-up must still post when no model is configured, and it must not invent work.

## Options Considered

### Option A: Always post the collated member text

- Pros: No third party, no key, no extra quota.
- Cons: Long threads on busy weeks.

### Option B: OpenRouter, free-tier model ids only, with the member text as fallback

- Pros: One HTTPS call, operator-supplied key, model list can change without code. Ids must end in `:free`. A failed or empty response posts the member text unchanged. A stored summary is reused so a second run does not call the model again.
- Cons: Progress text and the spreadsheet URL (sent as `HTTP-Referer`) leave Google. Free-tier rate limits apply. The model can still omit detail; the prompt forbids inventing any.

### Option C: Require a paid model

- Pros: Higher rate limits.
- Cons: Surprises an operator who pasted a free key. This template refuses non-`:free` ids and falls back to the default free list.

## Decision

We choose **Option B**. Defaults are `meta-llama/llama-3.3-70b-instruct:free`, then `deepseek/deepseek-v4-flash:free`. `OPENROUTER_ENABLED=0` skips the call and keeps the key. Spaces with no previous-week rows are skipped: no model call and no Chat post.

The prompt is `Logic.WEEKLY_SUMMARY_SYSTEM` in `src/logic.js`. Successful text is stored on **Weekly Space Summaries** and is not a secret.

## Consequences

- Operators who do not want progress text sent to OpenRouter leave the key unset. Monday still posts member text for spaces that have both a webhook and previous-week rows.
- Clear the stored summary row before expecting a new model call for that week and space.
- Model names in the source are public model ids, not credentials.
