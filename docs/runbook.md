# Runbook

Operational steps for a new spreadsheet. Each step says what to do, why that order matters, and what fails if you skip the constraint. Names in examples are fictional. Put real people only in your spreadsheet and Script Properties, never in git.

Architecture: [architecture.md](architecture.md). Sample workbook: [workbook-sample.md](workbook-sample.md) and [workbook-sample.xlsx](workbook-sample.xlsx).

## Current application

This runbook matches version 1.0.0 of the template.

- Members type a daily row on a personal tab. The **Space** column chooses the Chat space.
- Weekday defaults in `Asia/Kolkata`: reminder 18:00, daily post 19:00, weekly roll-up Monday 09:00.
- Reminders go to Chat (one message per space) and to email (one message per person).
- Slack code is present and does not send.
- OpenRouter is optional. Without a key, Monday posts the member text for each space that has rows and a webhook.

## 1. Install local tools

**Do this**

```powershell
npm install
npm test
node --check src/Code.js
node --check src/logic.js
```

**Why.** `npm test` locks the date, schedule, and message rules in `src/logic.js`. `node --check` only proves the Apps Script files parse. It does not execute `SpreadsheetApp`.

**Pitfalls**

- `npm install` pulls `@google/clasp` as a dev dependency. You do not need a global clasp binary.
- A failing test is a logic change, not a Google outage. Fix `src/logic.js` or the test before pushing.

## 2. Create the Sheet and bind a script

**Do this**

1. Create a Google Sheet. A blank file is enough. `npm install` does not create one.
2. Optional: upload [workbook-sample.xlsx](workbook-sample.xlsx) to Drive and open it with Google Sheets if you want the fictional rows already filled in. That file is an example, not a setup step. It has no webhook URL. Chips and checkboxes may not survive the conversion. Details are in [workbook-sample.md](workbook-sample.md).
3. **Extensions → Apps Script**.
4. Copy the script id from the editor URL: `https://script.google.com/home/projects/SCRIPT_ID/edit`.

```powershell
npx clasp login
copy .clasp.json.example .clasp.json
```

Edit `.clasp.json` so it is only:

```json
{
  "scriptId": "YOUR_APPS_SCRIPT_ID",
  "rootDir": "src"
}
```

```powershell
npm run push
```

Reload the spreadsheet and accept the consent screen. Confirm **Project Settings → Google Cloud Platform project** still shows the default Apps Script project.

**Why.** The script is container-bound. Triggers and the menu run as the user who authorized the project, against the active spreadsheet. `rootDir` makes clasp upload `src/` and not the docs.

**Pitfalls**

- Do not add `projectId`. Do not run `clasp run-function`, `clasp setup-logs`, or `clasp enable-api`. Those attach a standard Cloud project. Leaving the default project cannot be undone.
- If clasp prints `Skipping push` after an OAuth scope change in a non-interactive shell, run `npx clasp push --force`. That flag forces the clasp upload. It is not a git force-push.
- `.clasp.json` holds your script id. `.clasprc.json` holds your clasp login. Both are gitignored. Do not commit them.
- `npm run push` does not change Script Properties, triggers, or sheet cells. `npm run pull` overwrites local `src/` with whatever is in the Apps Script project. Pull only when the editor is the source you intend to keep.
- The sample workbook already contains the fictional people. If you imported it and then point `EXAMPLE_ROSTER` at a real team, menu 4 adds the real people and leaves Alex, Sam, and Jordan in place. Delete those rows yourself before you treat the sheet as production.

## 3. Replace the fictional roster before provision

**Do this.** In `src/Code.js`, replace the example constants, then push again.

```javascript
const EXAMPLE_ROSTER = [
  ['Alex Rivera', 'alex.rivera@example.com']
];

const EXAMPLE_SPACE_ROWS = [
  ['TEAM_ALPHA', 'EXAMPLESPACEALPHA', 'GOOGLE_CHAT_WEBHOOK_URL', false]
];

const EXAMPLE_CHAT_USER_IDS = {
  'alex.rivera@example.com': '900000000000000000001'
};
```

Use your own names, emails, space ids, and numeric Chat user ids. Keep every webhook URL out of this file.

If the primary space is not named `TEAM_ALPHA`, also change `Logic.DEFAULT_SPACE` in `src/logic.js`. That string is used only when an old Remind column is migrated onto the matrix.

**Why.** Menu **4) Provision roster, spaces, and sheets** appends any email in `EXAMPLE_ROSTER` that is not already on Team, ensures Chat Spaces rows, fills a blank Chat cell from `EXAMPLE_CHAT_USER_IDS`, rebuilds the matrix, and creates a personal tab per member. It does not clear existing body rows.

**Pitfalls**

- Provisioning the published examples inserts `alex.rivera@example.com` and the other sample people into a real workbook.
- Email is the identity key. Two rows with the same email are treated as one person; a renamed person keeps the row and the personal tab is renamed when the old tab still exists.
- Sheet tabs cannot contain `: \ / ? * [ ]`. Names are trimmed to 99 characters. A collision after cleaning overwrites the tab title rules, not the other person's rows, but the tab name will not match the display name.
- Chat ids in the published file are fake. A ping of `<users/900000000000000000001>` does not mention a real person. Replace them or leave the Chat cell blank to post `*Name*` with no ping.

## 4. Store webhooks as Script Properties

**Do this.** In each Chat space: **Apps & integrations → Incoming webhooks**. The URL looks like:

```text
https://chat.googleapis.com/v1/spaces/SPACE_ID/messages?key=KEY&token=TOKEN
```

| Space | Property name | Where to save the URL |
|---|---|---|
| Primary (`TEAM_ALPHA` in the sample) | `GOOGLE_CHAT_WEBHOOK_URL` | Menu **5) Set Google Chat webhook URL** |
| Every other space | The name in Chat Spaces column C, for example `GOOGLE_CHAT_WEBHOOK_TEAM_BETA` | Apps Script → Project Settings → Script properties |

Run menu **6) Test Google Chat webhook** for the primary property. Posting to another space is covered when you run menu **7** after someone has a row for that space.

**Why.** [ADR-002](decisions/002-script-properties-for-secrets.md). The sheet stores the property name. `readConfiguredSpaces_` sets column D from whether that property has a value, then returns only those spaces.

**Pitfalls**

- Menu 5 writes only `GOOGLE_CHAT_WEBHOOK_URL`. A second space stays silent until its own property exists.
- Checking column D by hand does nothing lasting. The next post rewrites the box from the property.
- Pasting the URL into a cell, a commit, or an issue shares the ability to post as the webhook. Rotate the webhook in Chat if that happens, then save the new URL in the property.
- The URL must be `https://chat.googleapis.com/v1/spaces/.../messages` with both `key` and `token`. Menu 5 rejects anything else.

## 5. Set membership and reminder checks

**Do this**

1. On **Team**, select cell E2. **Data → Data validation → Dropdown**. Use the range `Chat Spaces!A2:A`. Turn on **Allow multiple selections**. That chip control is created in the Sheets UI once.
2. Pick each person's spaces in column E.
3. Menu **16) Apply Team spaces to reminder matrix**. Cells for spaces the person is not in become blank.
4. Check the remaining boxes for people who should be reminded.

**Why.** Apps Script cannot create "Allow multiple selections". `applyTeamSpacesDropdown_` only copies the validation that is already on E2. Menu 16 does not call Chat. Column E is the list.

**Pitfalls**

- If E2 has no validation, menu actions will not invent a multi-select. Set the dropdown in the UI first.
- Do not run `setDataValidation` on column E later. That replaces chips with a single-select list and can flatten multiple spaces into one value.
- A checked box in a space the person is not in is cleared by menu 16. Re-check after you add them to column E.
- An empty column E makes menu 16 stop with "The Spaces column is empty" and does not wipe the matrix.

## 6. Apply schedules

**Do this.** Open **Schedules**. For a first install the script inserts this default, including Space access **enabled**:

| Job | Enabled | Days | Hour | Minute |
|---|---|---|---|---|
| Reminder | yes | Mon–Fri | 18 | 0 |
| Daily post | yes | Mon–Fri | 19 | 0 |
| Weekly roll-up | yes | Mon | 9 | 0 |
| Space access | yes, until you uncheck it | Mon–Fri | 8 | 0 |

Uncheck **Space access** unless you want a weekday job that only reapplies column E. Then run menu **14) Apply schedules**.

**Why.** Editing the sheet does not change triggers. Menu 14 deletes triggers whose handlers are the four jobs (and the old Slack daily handler), then creates triggers for enabled, valid rows. The trigger handler also checks the day at run time.

**Pitfalls**

- Minute must be 0, 15, 30, or 45. Other minutes are rejected and that job is not installed.
- The job can start up to about 15 minutes after that minute. Do not schedule the reminder and the daily post on the same minute if the post must see rows written after the reminder.
- Time zone is `Asia/Kolkata` in both `src/appsscript.json` and `TZ` in `src/Code.js`. Change both, then push, or the trigger hour and the "today" date will disagree.
- Menus 11–13 and 17 prompt for one job, store it as enabled, and reinstall triggers. Menu 15 only removes a legacy Slack daily trigger.
- Space access does not read Chat. Leaving it enabled reapplies column E every weekday morning.

## 7. Optional weekly summaries

**Do this**

1. Create a key at [openrouter.ai](https://openrouter.ai/).
2. Menu **18) Set OpenRouter API key**. The key is stored as `OPENROUTER_API_KEY`. The same menu writes the free-tier model list.
3. Default models, in order:

```text
meta-llama/llama-3.3-70b-instruct:free,deepseek/deepseek-v4-flash:free
```

4. Set Script Property `OPENROUTER_ENABLED` to `0` to skip the model without deleting the key.

**Why.** [ADR-004](decisions/004-optional-openrouter-summaries.md). Without a key, Monday still posts each space's member text when that space has previous-week content and a webhook. With a key, Chat receives the summary only. If every model fails, Chat receives the member text unchanged.

**Pitfalls**

- Only model ids that end in `:free` are sent. Any other id is dropped. If none remain, the default free list is used.
- A space with no previous-week rows is skipped. No model call, no Chat post.
- A stored row on **Weekly Space Summaries** is reused. Clear that row to force a new summary. Menu 9 does not set `forceSummary`.
- The call sends the progress text and the spreadsheet URL (`HTTP-Referer`) to OpenRouter. Do not enable the key if that text must stay inside Google.
- Calls are spaced by 1.5 seconds per space. HTTP 429 or 5xx retries once after 2.5 seconds, then the next model is tried. Apps Script URL Fetch quota still applies.
- The prompt tells the model not to invent work, people, or dates. It can still drop detail. The Weekly Rollup sheet keeps the source lines.

## 8. Day-to-day

On a personal tab, add today's date, a summary, and a **Space** from the dropdown.

| Need | Menu |
|---|---|
| Post today now | 7 |
| Send reminders now | 8 |
| Run last week's roll-up now | 9 |
| Add a person | 1, then 2 |
| Rebuild matrix columns after a new space | 10, then 16 if column E changed |

**Why the Space column is mandatory for a post.** The daily job groups rows by that cell. A blank space is dropped. If someone edits today's other cells and leaves Space blank or invalid, `onEdit` shows a toast. It does not fill the cell for them.

**Pitfalls**

- Reminder emails use the Team email column and the `script.send_mail` scope. A missing email skips that person and still posts the Chat line. MailApp has a daily send quota.
- One person who owes three spaces gets one email listing all three, and appears in each of those Chat reminders.
- Hours accept decimals, `H:MM`, `8h`, `15m`, and mixed forms such as `1h 30m`. Unparseable hours are omitted from the weekly line; the summary text is still kept.
- Menu 1 matches an existing member by name for updates. Provision matches by email. Prefer menu 1 for a person who is not part of `EXAMPLE_ROSTER`.

## 9. Change the code

```powershell
npm test
node --check src/Code.js
node --check src/logic.js
npm run push
```

Reload the spreadsheet after a push so `onOpen` rebuilds the menu.

**Why.** Tests do not cover `SpreadsheetApp`. After a push, run one menu that matches the change (post, reminder, or roll-up) on a sheet that contains only data you are willing to send.

**Pitfalls**

- Do not commit `.clasp.json`, `.clasprc.json`, webhook URLs, or API keys.
- Do not commit a real roster into `EXAMPLE_ROSTER` or `EXAMPLE_CHAT_USER_IDS`.
- Push does not delete Script Properties or triggers. A renamed handler in `SCHEDULE_HANDLERS` will not remove an old trigger until menu 14 runs, and only if the old handler name is still in the delete list (`SCHEDULE_HANDLERS` values plus `postTodaysSummary_trigger`).
- `npm run pull` can overwrite local fixes. Diff before you pull.

## 10. If a post did not appear

1. Confirm the personal row's date is today in `Asia/Kolkata`, the summary is non-empty, and **Space** matches Chat Spaces column A exactly.
2. Confirm the Script Property named in column C has a URL. Column D should become checked after a post or reminder run.
3. **Executions** in the Apps Script editor shows the trigger run. A webhook HTTP error is thrown as `Google Chat webhook failed (HTTP ...)`. The URL is not included in that message.
4. If the trigger never ran, open Schedules and run menu 14. Check that the authorizing user still has access to the spreadsheet.
5. For a missing Monday summary, check whether **Weekly Space Summaries** already has a row for that week and space, and whether `OPENROUTER_ENABLED` is `0`.
