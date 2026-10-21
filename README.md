# Daily Progress Logger

Local workspace for the Apps Script bound to the Google Sheet **DailyProgressTracker**.

`clasp pull` and `clasp push` target that existing script. This repo does not create a new script and does not attach a standard Google Cloud project.

**Start here**

| Audience | Read |
|---|---|
| Operators (menu, GitHub Issues column, setup) | This file, [Daily Progress menu](#daily-progress-menu) |
| Operators (webhooks, schedules, OpenRouter, troubleshooting) | [docs/runbooks/spaces-roster-and-daily-posts.md](docs/runbooks/spaces-roster-and-daily-posts.md) |
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

Those run `@google/clasp` 3.4.1 from `devDependencies`. `npm run pull` and `npm run push` use the clasp user `arca` stored in `.clasprc.json` in this folder. That file is gitignored. Sign in as `dr.jayaram@arcaai.com`.

If clasp prints `Skipping push` after an `oauthScopes` change in a non-TTY session:

```powershell
npx clasp --auth .clasprc.json --user arca push --force
```

That is clasp force, not git force. Push and pull do **not** read or write Script Properties, triggers, or spreadsheet cells. A push also does not install triggers. After this update, reload the sheet and run **Apply schedules from sheet** once so the hourly GitHub issue formatter exists.

If clasp asks you to log in again:

```powershell
npx clasp --auth .clasprc.json --user arca login
```

That refreshes the `arca` credential only. It does not change the script's Cloud project. Finish the Google page as `dr.jayaram@arcaai.com`.

## Cloud project constraint

Keep this script on the **default** Apps Script Cloud project.

- `.clasp.json` has `scriptId` and `rootDir` only. Do not add `projectId`.
- Do not run `clasp run-function`, `clasp setup-logs`, `clasp enable-api`, `clasp open-api-console`, or `clasp open-credentials-setup`. Those commands ask for a standard Cloud project ID and write it into `.clasp.json`.
- Do not use **Project Settings → Google Cloud Platform project → Change project** in the Apps Script editor. Switching to a standard project cannot be undone. If that project's OAuth consent screen is External and in Testing, refresh tokens expire after 7 days.
- Do not enable the Google Chat API. Posts use **incoming webhooks** only. Membership is Team column E + **Apply Team spaces to reminder matrix**.

See [docs/decisions/0001-keep-default-gcp-project.md](docs/decisions/0001-keep-default-gcp-project.md).

## Architecture

Members type a daily row on their own tab: date, summary, hours, blockers, tomorrow's plan, an optional **GitHub Issues** cell, and a **Space** chosen from the **Chat Spaces** sheet. The script reads that Space cell and sends the row only to the matching Google Chat space. A blank GitHub Issues cell still posts. When the cell has recognized issue URLs, the daily Chat line appends `Issues:` and the canonical issue URLs after blockers. The Monday message does not include those URLs.

**Apply schedules from sheet** installs three clock schedules in Asia/Kolkata, plus an hourly GitHub issue formatter that is not a row on the Schedules sheet. A fourth clock job, Space access, exists on the Schedules sheet but only reapplies Team column E to the Reminder Matrix; it cannot read Google Chat. Leave it uninstalled unless you want that reapply trigger.

| Default | Function | What it does |
|---|---|---|
| Weekdays ~6:00 PM | `sendReminder_trigger` | For each space, pings members whose **Reminder Matrix** cell is checked and who have no today summary for that space. Includes the workbook URL. One email per person lists every space they are missing. |
| Every day ~7:00 PM | `postDailyUpdatesToChat_trigger` | Posts today's rows, split by the Space column, to each space whose Script Property webhook is set. Saturday, Sunday, and a holiday are included when that day is today. Recognized GitHub issue URLs are appended on that summary line. |
| Every hour | `formatGithubIssues_trigger` | Rewrites today's GitHub Issues cells to linked issue numbers. Does not post to Chat. The 7:00 PM post and the Monday roll-up format again before they read the sheet. |
| Monday ~9:00 AM | `weeklyRollup_trigger` | Formats last week's GitHub Issues cells, writes **Weekly Rollup**, then posts one summary to each space with a webhook. Those issue URLs stay out of the Monday message and the OpenRouter prompt. Uses OpenRouter free models when `OPENROUTER_API_KEY` is set (`gemma-4-31b-it:free`, then `gemma-4-26b-a4b-it:free`, then `openrouter/free`). The prompt uses member names and `[YYYY-MM-DD]` tags. Each member gets one section in date order: one short sentence per outcome, simple past, member as the subject. Saturday, Sunday, and holidays in the source stay in that section. One member stays in one Chat message. A long week is split between members so one member is not summarized twice. A stored summary that was cut off is generated again. A member still missing is appended. If every model fails, the post is that space's member week text. |

Team column **E Spaces** lists which Chat spaces each member belongs to (multi-select chips). Fill it from Chat, then run **Apply Team spaces to reminder matrix**. Non-member matrix cells become blank. The script never calls the Chat API.

Webhook URLs and `OPENROUTER_API_KEY` are Script Properties. The sheet stores property **names**, not secrets. Slack code remains behind `SLACK_ENABLED = false` and does not send.

Full setup, webhooks, Chat user ids, and failure modes: [docs/runbooks/spaces-roster-and-daily-posts.md](docs/runbooks/spaces-roster-and-daily-posts.md).

## Add the GitHub Issues column on every member sheet

The script is already on Google. The column appears after you run one menu item. You do not insert the column by hand.

1. Open [DailyProgressTracker](https://docs.google.com/spreadsheets/d/1NHSu_IvUWXnNJqyEbqnAydQ4joftWk6DP68RPQRgMX4/edit) in Chrome as `dr.jayaram@arcaai.com`.
2. Reload the spreadsheet. The reload loads the **Daily Progress** menu from the script that was pushed.
3. Click **Daily Progress → Sync member sheets**.
4. Wait for the alert. It says `Synced N member sheet(s). (No data cleared)`. `N` is the number of names on the Team sheet.
5. Open a member tab. Row 1 should read, from left to right: Date, Summary, Hours, Blockers, Tomorrow Plan, Space, **GitHub Issues**.
6. Hover the **GitHub Issues** header. The note explains which URLs to paste and how to separate several URLs.
7. Click **Daily Progress → Format today’s GitHub issues** once. That rewrites today’s cells and installs the hourly rewrite if it is missing. **Apply schedules from sheet** installs it as well. The alert ends with `GitHub issues: every hour, today's rows only`. Syncing the sheets does not install it.

What that sync does on every tab whose name matches a Team name:

- Writes **GitHub Issues** in column G when that header is missing or different.
- Puts the paste instructions in the header note.
- Turns on wrap for column G.
- Refreshes the date format on column A and the Space dropdown on column F.
- Leaves every row below the header where it is.

A tab whose name is not on Team is left alone. **Add or update member** does this repair for one person. **Bootstrap roster, spaces & sheets** also repairs every roster tab, and it rewrites roster names and Chat Spaces rows, so use it only when you want that full repair.

After the header exists, a member pastes issue URLs into column G, or leaves the cell blank. Blank is a normal row and still posts. **Format today’s GitHub issues** rewrites today’s recognized URLs into linked numbers. The hourly trigger and the 7:00 PM post do that same today-only rewrite. Monday’s roll-up rewrites the previous Monday–Sunday week and leaves the URLs out of the Monday Chat message.

## Daily Progress menu

Open the spreadsheet in Chrome as `dr.jayaram@arcaai.com`. Click **Daily Progress** in the menu bar. Reload the tab after `npm run push` so this list matches the script.

Cancel on a prompt leaves the sheet unchanged. An item that posts to Chat says so below. Slack items stay off the menu while `SLACK_ENABLED` is false.

### Add or update member

Use this for one person: a new teammate, a name change, or an email change.

1. Click **Add or update member**.
2. Type the full name. This name becomes the personal tab. Click **OK**.
3. Type the `@arcaai.com` email. Click **OK**.

A blank name stops the item. A name that already exists on Team updates that row. A new name adds a Team row and creates the personal tab, including **GitHub Issues**. The Chat mention in column D is filled when that email is in the built-in map. An existing `<users/…>` mention is kept when the email is not in the map. The Slack cell is left as it is. The Reminder Matrix gains a row for a new name.

Afterward, set Team column **E Spaces** with the chip dropdown, then run **Apply Team spaces to reminder matrix**.

### Sync member sheets

Use this after you edit Team by hand, and use it to add **GitHub Issues** on every existing member tab. Steps are in [Add the GitHub Issues column on every member sheet](#add-the-github-issues-column-on-every-member-sheet).

### Bootstrap roster, spaces & sheets

Use this when Team, Chat Spaces, or member tabs are missing. On the live workbook, those sheets already exist. Running it again keeps extra Team rows and refreshes the built-in roster.

1. Click **Bootstrap roster, spaces & sheets**.
2. Wait for the alert. It reports how many Team members and Chat spaces are present, and asks you to fill column E.

The script adds any built-in roster email that is missing, writes Chat Spaces rows for the nine project spaces, fills a blank Chat mention from the email map, creates a personal tab for each Team name (with **GitHub Issues**), and writes default Schedules rows when that sheet is empty. It keeps existing member rows. It does not turn on the Space access trigger by itself.

Then fill column E and run **Apply Team spaces to reminder matrix**.

### Set Chat webhook…

Use this when a project space needs its incoming webhook. The URL is a secret. Paste it only into this prompt.

1. In Google Chat, open that space → **Apps & integrations** → **Incoming webhooks**, and copy the URL.
2. Click **Set Chat webhook…**.
3. Type the space name exactly as it appears in Chat Spaces column A. Click **OK**.
4. Paste the URL. Click **OK**.

The alert names the Script Property that now holds the URL. Chat Spaces column D (**Configured**) is refreshed. The sheet never stores the URL. A URL whose space id differs from column B is rejected.

### Test Chat webhooks

This posts one live test message into every space that already has a webhook. Use it only when you want those messages in Chat.

1. Click **Test Chat webhooks**.
2. Read the alert. Each space is listed as OK or Failed.
3. Open a Failed space in Chat only when you need the error text.

A space with no webhook is omitted.

### Post today’s updates now

This runs the 7:00 PM job immediately and posts to live Chat. It posts today’s rows only. It does not replay an older date. A Saturday row posts on Saturday.

1. On each row you want posted, set Date to today (Asia/Kolkata), write a Summary, and pick Space from the dropdown.
2. Paste GitHub issue URLs in column G when that work has an issue. Leave the cell blank when it does not.
3. Click **Post today’s updates now**.
4. Read the alert, then open the Chat space and read the post.

A row is posted when the date is today, Summary is not empty, and Space matches that space’s name. A blank GitHub Issues cell still posts. Recognized URLs are formatted first, then the Chat line adds `Issues:` and the full issue URLs after blockers. A space with no matching rows gets no message. The Reminder Matrix is not used. OpenRouter is not called.

### Format today’s GitHub issues

This rewrites today’s **GitHub Issues** cells on every member tab. It does not post to Chat.

1. Paste one or more GitHub URLs into column G, or leave the cell blank.
2. Separate several URLs with a comma, a space, a new line, a semicolon, or a pipe.
3. Use an issue page such as `https://github.com/ArcaAI/project-hope/issues/8`, or a project-board link whose query contains `issue=ArcaAI|project-hope|8` (the `|` may be `%7C`).
4. Click **Format today’s GitHub issues**.
5. Read the alert. It counts member sheets, not links.

A recognized cell becomes the issue numbers, separated by commas, and each number is its own link to `https://github.com/owner/repo/issues/N`. A blank cell stays blank. A project link that only has `itemId` stays as pasted. Column G is plain text, so a pair such as `9, 10` stays two links instead of becoming the date 10 September. This menu item, **Post today’s updates now**, and **Run weekly roll-up now** install the hourly rewrite when it is missing. **Apply schedules from sheet** installs it too.

### Send reminders now

This posts reminders into live Chat and sends one email to each person who still owes a row.

1. Click **Send reminders now**.
2. Read the alert.
3. Open the Chat space when you want to read the reminder.

A person is included for a space when their Reminder Matrix cell for that space is checked and they have no today row for that space. A today row needs a Summary and a matching Space. The message names the Daily post time from the Schedules sheet. The default is 7:00 PM IST.

### Run weekly roll-up now

This writes **Weekly Rollup** and posts the previous Monday–Sunday week to each space that has a webhook. A second click posts that week again. Use it only when you want that live post.

1. Click **Run weekly roll-up now**.
2. Read the alert.
3. Open **Weekly Rollup**.
4. Open **Weekly Space Summaries** when OpenRouter is on.
5. Open one Chat space and read the post.

Last week’s GitHub Issues cells are formatted first. Those URLs stay out of the Monday message and out of the model prompt. When OpenRouter returns text, Chat gets that summary, and any member the model omitted is appended. When every model fails, Chat gets that space’s member text. A space with no rows for the week gets no post.

### Sync reminder matrix

Use this after you add a person or a Chat space, before you decide who gets reminders.

1. Click **Sync reminder matrix**.
2. Open **Reminder Matrix**.
3. Check the box for each space that should remind that person.

New Team members and new Chat Spaces columns appear. An existing check stays. A person who left Team is removed. This item does not clear boxes for spaces the person is not in. Use the next item for that.

### Apply Team spaces to reminder matrix

Team column E is the membership list. Each cell is a multi-select of names from Chat Spaces.

1. On Team, set column **E Spaces** with the chip dropdown.
2. Click **Apply Team spaces to reminder matrix**.
3. Read the alert. It names how many members were updated.
4. Open **Reminder Matrix**. A cell is blank when that person is not in that space. An existing check stays when they are still in the space.

The script stores `SPACE_ACCESS_SYNCED` as `1`. It does not read live Chat membership. An empty Spaces column stops the item and tells you to fill column E. Edit column E with the chip dropdown. Recreating that dropdown in Apps Script removes the chips.

### Apply schedules from sheet

Use this after you change a clock time, and once after the GitHub Issues update so the hourly formatter exists.

1. Open the **Schedules** sheet.
2. For each job, set Days, Hour, Minute, and Enabled. Minutes must be 0, 15, 30, or 45.
3. Leave **Space access** unchecked unless you want a weekday 8:00 AM reapply of column E. That job cannot read Google Chat.
4. Click **Apply schedules from sheet**.
5. Read the alert. Clock jobs list their days and time. The last line is `GitHub issues: every hour, today's rows only`.
6. Optional check: **Extensions → Apps Script → Triggers**. The clock handlers and `formatGithubIssues_trigger` are listed in Asia/Kolkata.

| Job | Default | Handler |
|---|---|---|
| Reminder | Weekdays 6:00 PM | `sendReminder_trigger` |
| Daily post | Every day 7:00 PM | `postDailyUpdatesToChat_trigger` |
| Weekly roll-up | Monday 9:00 AM | `weeklyRollup_trigger` |
| Space access | Weekdays 8:00 AM, leave off | `refreshSpaceAccess_trigger` |
| GitHub issues | Every hour, not a Schedules row | `formatGithubIssues_trigger` |

Apps Script may start a clock job up to about 15 minutes after the minute you set. Applying schedules replaces the previous copies of these triggers.

### Set OpenRouter API key

Monday posts still go out with the collated member text when this key is empty. The key is a Script Property. Keep it out of git, the sheet, and Chat.

1. Create a free-tier key at [openrouter.ai](https://openrouter.ai/).
2. Click **Set OpenRouter API key**.
3. Paste the key. Click **OK**.
4. To remove the key, open the same item, leave the box empty, and click **OK**.

A saved key stores `OPENROUTER_API_KEY`, writes the free-model list, and turns summaries on when `OPENROUTER_ENABLED` is missing. To pause summaries and keep the key, set Script Property `OPENROUTER_ENABLED` to `0`. Defaults: `google/gemma-4-31b-it:free`, then `google/gemma-4-26b-a4b-it:free`, then `openrouter/free`.

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
2. Run `npx clasp --auth .clasprc.json --user arca login` and sign in as `dr.jayaram@arcaai.com`.
3. Confirm `.clasp.json` contains only `scriptId` and `rootDir`. Do not add `projectId`.
4. Run `npm run pull` to refresh `src/`, or `npm test` then `npm run push` after editing `src/`.
5. In the spreadsheet, reload so the **Daily Progress** menu appears. Run **Sync member sheets** so every member tab has the **GitHub Issues** column. Then run **Apply schedules from sheet**. Defaults: weekday 6:00 PM reminder, daily 7:00 PM post on all seven days, Monday 9:00 AM weekly roll-up, plus an hourly GitHub issue formatter. Leave the Space access row off until Team column E is filled and you want the 8:00 AM reapply job. Menu steps: [Daily Progress menu](#daily-progress-menu).
6. Optionally configure OpenRouter (**Set OpenRouter API key**) as above.

For empty-sheet bootstrap, webhooks, membership, and failure modes, follow the [runbook](docs/runbooks/spaces-roster-and-daily-posts.md) from §4 onward.

Do not run `clasp run`, and do not change the Apps Script Cloud project.

## What is not in git

- Script Properties that hold each space's incoming webhook URL
- `OPENROUTER_API_KEY` and related OpenRouter settings
- Installed triggers
- Spreadsheet rows

Pushing code does not delete those.
