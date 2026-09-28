# Changelog

## Unreleased

- Weekly summaries skip retired free model ids and fall through to `openrouter/free`. Defaults are `google/gemma-4-31b-it:free` and `qwen/qwen3.8-27b:free`. The request disables reasoning so the summary is in the message content.
- The weekday daily post reads each member sheet once, then posts to the spaces named on today's rows. A sheet that throws is logged and skipped.

## 1.0.0

- Spreadsheet-bound Apps Script template that posts daily progress to Google Chat incoming webhooks.
- Weekday reminders, a weekday daily post, and a Monday roll-up of the previous week.
- Optional OpenRouter summaries limited to free-tier model ids, with the member text as the fallback.
- Slack posting is present and disabled.
- Example roster, space ids, and Chat user ids are fictional.
