# Daily Progress Logger

Local workspace for the Apps Script bound to the Google Sheet **DailyProgressTracker**.

`clasp pull` and `clasp push` target that existing script. This repo does not create a new script and does not attach a standard Google Cloud project.

**Start here**

| Audience | Read |
|---|---|
| Operators (setup, Chat webhooks, schedules, OpenRouter) | [docs/runbooks/spaces-roster-and-daily-posts.md](docs/runbooks/spaces-roster-and-daily-posts.md) |
| Agents / developers | [AGENTS.md](AGENTS.md) |
| Why we keep the default GCP project | [docs/decisions/0001-keep-default-gcp-project.md](docs/decisions/0001-keep-default-gcp-project.md) |

## Identifiers

| | |
|---|---|
| Spreadsheet | [DailyProgressTracker](https://docs.google.com/spreadsheets/d/1NHSu_IvUWXnNJqyEbqnAydQ4joftWk6DP68RPQRgMX4/edit) |
| Spreadsheet ID | `1NHSu_IvUWXnNJqyEbqnAydQ4joftWk6DP68RPQRgMX4` |
| Apps Script ID | `1SbZPWZVEXklZ7xlFhsGMI6AelcAkfkllyLuZ-pBh2sjFlZZ6NMmpEB_g` |
| Default GCP project number | `984576077062` (do not switch away) |
| Script title | Untitled project |
| Parent binding | Confirmed. `projects.get` `parentId` equals the spreadsheet ID. |
| Timezone | `Asia/Kolkata` (manifest and `TZ` in `src/Code.js`) |
| Chrome / Chat account | `dr.jayaram@arcaai.com` |
| Local script files | `src/` |

## Commands

```powershell
npm install
npm test
node --check src/Code.js
node --check src/logic.js
npm run pull
npm run push
```

Those run `@google/clasp` 3.4.1 from `devDependencies`. Credentials stay in `%USERPROFILE%\.clasprc.json` and are gitignored if a copy is ever placed in this folder.

If clasp prints `Skipping push` after an `oauthScopes` change in a non-TTY session:

```powershell
npx clasp push --force
```

That is clasp force, not git force. Push and pull do **not** read or write Script Properties, triggers, or spreadsheet cells.

If clasp asks you to log in again, run `npx clasp login`. That refreshes the CLI credential only. It does not change the script's Cloud project.

## Cloud project constraint

Keep this script on the **default** Apps Script Cloud project.

- `.clasp.json` has `scriptId` and `rootDir` only. Do not add `projectId`.
- Do not run `clasp run-function`, `clasp setup-logs`, `clasp enable-api`, `clasp open-api-console`, or `clasp open-credentials-setup`. Those commands ask for a standard Cloud project ID and write it into `.clasp.json`.
- Do not use **Project Settings → Google Cloud Platform project → Change project** in the Apps Script editor. Switching to a standard project cannot be undone. If that project's OAuth consent screen is External and in Testing, refresh tokens expire after 7 days.
- Do not enable the Google Chat API. Posts use **incoming webhooks** only. Membership is Team column E + **Apply Team spaces to reminder matrix**.

See [docs/decisions/0001-keep-default-gcp-project.md](docs/decisions/0001-keep-default-gcp-project.md).

## Architecture

Members type a daily row on their own tab: date, summary, hours, blockers, tomorrow's plan, and a **Space** chosen from the **Chat Spaces** sheet. The script reads that Space cell and sends the row only to the matching Google Chat space.

Three schedules are installed in Asia/Kolkata by default after **Apply schedules from sheet**. A fourth job, Space access, exists on the Schedules sheet but only reapplies Team column E to the Reminder Matrix; it cannot read Google Chat. Leave it uninstalled unless you want that reapply trigger.

| Default | Function | What it does |
|---|---|---|
| Weekdays ~6:00 PM | `sendReminder_trigger` | For each space, pings members whose **Reminder Matrix** cell is checked and who have no today summary for that space. Includes the workbook URL. One email per person lists every space they are missing. |
| Weekdays ~7:00 PM | `postDailyUpdatesToChat_trigger` | Posts today's rows, split by the Space column, to each space whose Script Property webhook is set |
| Monday ~9:00 AM | `weeklyRollup_trigger` | Writes **Weekly Rollup**, then posts one summary to each space with a webhook. Uses OpenRouter free models when `OPENROUTER_API_KEY` is set (`gemma-4-31b-it:free`, then `gemma-4-26b-a4b-it:free`, then `openrouter/free`). The prompt uses member names and `[YYYY-MM-DD]` tags and asks for one bullet per member. A member the model omits is appended. If every model fails, the post is that space's member week text. |

Team column **E Spaces** lists which Chat spaces each member belongs to (multi-select chips). Fill it from Chat, then run **Apply Team spaces to reminder matrix**. Non-member matrix cells become blank. The script never calls the Chat API.

Webhook URLs and `OPENROUTER_API_KEY` are Script Properties. The sheet stores property **names**, not secrets. Slack code remains behind `SLACK_ENABLED = false` and does not send.

Full step-by-step procedures (webhooks, Chat user ids, OpenRouter, from-scratch setup): [docs/runbooks/spaces-roster-and-daily-posts.md](docs/runbooks/spaces-roster-and-daily-posts.md).

## Configure OpenRouter weekly summaries (optional)

Without a key, Monday posts still send the collated member week text per space.

1. Create a **free-tier** API key at [openrouter.ai](https://openrouter.ai/).
2. In the spreadsheet: **Daily Progress → Set OpenRouter API key** → paste key → OK.
   - That stores `OPENROUTER_API_KEY`, writes free-tier `OPENROUTER_MODEL`, and enables summaries.
3. To disable without deleting the key: Script Property `OPENROUTER_ENABLED` = `0`.
4. To clear the key: **Set OpenRouter API key** with a blank prompt.

Free ids are `:free` models plus the `openrouter/free` router. Retired ids are skipped. Defaults: `google/gemma-4-31b-it:free`, then `google/gemma-4-26b-a4b-it:free`. Never commit the key. Details: runbook [§8](docs/runbooks/spaces-roster-and-daily-posts.md#8-configure-openrouter-weekly-summaries).

## Set up from this repo

The Apps Script project and the spreadsheet already exist. This checkout does not create a second script.

1. Install Node.js, then in this folder run `npm install`.
2. Run `npx clasp login` and sign in as `dr.jayaram@arcaai.com`.
3. Confirm `.clasp.json` contains only `scriptId` and `rootDir`. Do not add `projectId`.
4. Run `npm run pull` to refresh `src/`, or `npm test` then `npm run push` after editing `src/`.
5. In the spreadsheet, reload so the **Daily Progress** menu appears. Use **Apply schedules from sheet** if the trigger list is empty. Defaults: weekday 6:00 PM reminder, weekday 7:00 PM daily post, Monday 9:00 AM weekly roll-up. **Apply schedules from sheet** also installs an hourly GitHub issue formatter. It rewrites today’s GitHub Issues cells and does not post to Chat. Do not enable the Space access row until Team column E is filled and you want the 8:00 AM reapply job.
6. Optionally configure OpenRouter (**Set OpenRouter API key**) as above.

For empty-sheet bootstrap, webhooks, membership, and failure modes, follow the [runbook](docs/runbooks/spaces-roster-and-daily-posts.md) from §4 onward.

Do not run `clasp run`, and do not change the Apps Script Cloud project.

## What is not in git

- Script Properties that hold each space's incoming webhook URL
- `OPENROUTER_API_KEY` and related OpenRouter settings
- Installed triggers
- Spreadsheet rows

Pushing code does not delete those.
