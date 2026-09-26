# Daily Progress Logger

Spreadsheet-bound [Apps Script](https://developers.google.com/apps-script) template. Members log a daily row on their own tab. The script posts that row to a Google Chat space through an **incoming webhook**, sends reminders from a checkbox matrix, and can post a Monday weekly summary.

This repository is a **generic template**. Names, emails, space ids, Slack ids, and Chat user ids in the code and in [docs/workbook-sample.md](docs/workbook-sample.md) are fictional. Replace them before you use the script with a real team.

Licensed under the [MIT License](LICENSE).

## What it does

| Default (Asia/Kolkata) | Behavior |
|---|---|
| Weekdays 18:00 | Reminder in each Chat space for people checked on **Reminder Matrix** who have no today summary for that space. One email per person lists every space they still owe. |
| Weekdays 19:00 | Posts today's rows, split by the **Space** column, to each space that has a webhook. |
| Monday 09:00 | Writes **Weekly Rollup**. For each space that has both a webhook and previous-week content, posts a summary-only message when an OpenRouter key is set. If the models fail, posts that space's member text unchanged. Spaces with no previous-week content are skipped (no model call, no Chat post). |

Slack code is present and does not send (`SLACK_ENABLED = false`). The script does not call the Google Chat API. It stays on Apps Script's default Cloud project: do not add `projectId` to `.clasp.json`, and do not switch the Cloud project in the Apps Script editor.

## Layout

| Path | Role |
|---|---|
| `src/Code.js` | Menus, sheets, webhooks, triggers, OpenRouter fetch |
| `src/logic.js` | Pure helpers covered by `npm test` |
| `src/appsscript.json` | V8 runtime, timezone, OAuth scopes (spreadsheet, mail, external request, script app) |
| `test/logic.test.js` | Node tests |
| `docs/setup.md` | Setup, configuration, and maintenance |
| `docs/workbook-sample.md` | Fictional workbook showing headers and example rows |

## Local commands

```powershell
npm install
copy .clasp.json.example .clasp.json
# Edit .clasp.json and set scriptId to your Apps Script project. Do not add projectId.
npm test
npm run push
```

`.clasp.json` is gitignored because it holds your script id. `npm run pull` and `npm run push` do not change Script Properties, triggers, or sheet cells.

## Configure a real deployment

1. Bind the script to your spreadsheet and push `src/`.
2. Replace `EXAMPLE_ROSTER`, `EXAMPLE_SPACE_ROWS`, and `EXAMPLE_CHAT_USER_IDS` in `src/Code.js` with your own fictional-until-real values. Keep webhook URLs out of the source file.
3. Store each space's incoming webhook in Script Properties. Menu **5** writes only `GOOGLE_CHAT_WEBHOOK_URL` (the example primary space `TEAM_ALPHA`). Other spaces use the property name in **Chat Spaces** column C.
4. Optional weekly summaries: **Daily Progress → 18) Set OpenRouter API key**. Only model ids ending in `:free` are used. Defaults: `meta-llama/llama-3.3-70b-instruct:free`, then `deepseek/deepseek-v4-flash:free`. Set Script Property `OPENROUTER_ENABLED` to `0` to skip the model without deleting the key.
5. **14) Apply schedules** after you review the **Schedules** sheet. Leave **Space access** disabled unless you want a weekday job that only reapplies Team column E onto the reminder matrix.

Step-by-step instructions: [docs/setup.md](docs/setup.md).

## Secrets

Never commit webhook URLs, API keys, `.clasprc.json`, or `.clasp.json`. The sheet stores Script Property **names**, not secret values.
