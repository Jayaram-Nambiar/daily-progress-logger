# Setup

Generic instructions for this template. Account names, spreadsheet ids, and space ids below are placeholders. The example rows live in [workbook-sample.md](workbook-sample.md).

## 1. Prerequisites

- Node.js
- A Google account that can edit the spreadsheet and the Chat spaces
- [clasp](https://github.com/google/clasp) via `npm install` in this folder

## 2. Create the spreadsheet and script

1. Create a Google Sheet.
2. **Extensions → Apps Script**. Note the script id from the editor URL (`https://script.google.com/home/projects/SCRIPT_ID/edit` or the project settings).
3. In this folder:

```powershell
npm install
npx clasp login
copy .clasp.json.example .clasp.json
```

4. Edit `.clasp.json` so it contains only:

```json
{
  "scriptId": "YOUR_APPS_SCRIPT_ID",
  "rootDir": "src"
}
```

Do not add `projectId`. Do not run `clasp run-function`, `clasp setup-logs`, or `clasp enable-api`. Those commands attach a standard Cloud project. Switching off Apps Script's default project cannot be undone.

5. Push and test:

```powershell
npm test
node --check src/Code.js
node --check src/logic.js
npm run push
```

If clasp prints `Skipping push` after an OAuth scope change in a non-interactive shell, run `npx clasp push --force`. That flag forces the clasp upload. It is not a git force-push.

6. Reload the spreadsheet. Approve the consent screen if Google asks. The **Daily Progress** menu should appear.

Confirm **Project Settings → Google Cloud Platform project** still shows the default Apps Script project.

## 3. Replace the fictional roster

In `src/Code.js`, edit these constants, then push again:

| Constant | What to put |
|---|---|
| `EXAMPLE_ROSTER` | `[Full name, email]` pairs. Email is the identity key. |
| `EXAMPLE_SPACE_ROWS` | `[Space name, Space id, Script Property name, false]`. The first example space uses property `GOOGLE_CHAT_WEBHOOK_URL`. |
| `EXAMPLE_CHAT_USER_IDS` | Map of lowercase email → numeric Chat user id (digits only). |

`Logic.DEFAULT_SPACE` in `src/logic.js` is `TEAM_ALPHA`. If you rename the primary space, change that string too. It is used only when an old Remind column is migrated onto one matrix column.

Then run **4) Provision roster, spaces, and sheets**. That adds missing people by email, ensures Chat Spaces rows, fills blank Chat mentions, syncs the reminder matrix, and creates a personal tab per member. It does not clear existing body rows.

## 4. Chat webhooks

Create one incoming webhook inside each Chat space (**Apps & integrations → Incoming webhooks**). The URL looks like:

```text
https://chat.googleapis.com/v1/spaces/SPACE_ID/messages?key=KEY&token=TOKEN
```

Store the URL only as a Script Property:

| Space | Property name | How |
|---|---|---|
| Primary example (`TEAM_ALPHA`) | `GOOGLE_CHAT_WEBHOOK_URL` | Spreadsheet menu **5) Set Google Chat webhook URL** |
| Any other space | The name in Chat Spaces column C, such as `GOOGLE_CHAT_WEBHOOK_TEAM_BETA` | Apps Script → Project Settings → Script properties |

Do not paste the URL into a sheet cell or into git. Column D (**Configured**) is rewritten from whether that property has a value.

## 5. Membership and reminders

Team column **E (Spaces)** should be a multi-select chip dropdown whose options are `Chat Spaces!A2:A`. Apps Script cannot create "Allow multiple selections". Set that flag once in the Sheets UI. Do not call `setDataValidation` on column E later; that replaces chips with a single-select list. The script only copies the existing chip rule.

1. Select each member's spaces in column E.
2. Run **16) Apply Team spaces to reminder matrix**. Cells for spaces the person is not in become blank.
3. Check **Reminder Matrix** boxes for people who should be reminded in a space.

## 6. Schedules

**14) Apply schedules** installs triggers from the **Schedules** sheet. Minutes must be 0, 15, 30, or 45. Apps Script may start a job up to about 15 minutes after that minute.

| Job | Typical default | Notes |
|---|---|---|
| Reminder | Weekdays 18:00 | |
| Daily post | Weekdays 19:00 | |
| Weekly roll-up | Monday 09:00 | |
| Space access | Weekdays 08:00 | Only reapplies column E. It cannot read Chat. Leave **Enabled** unchecked unless you want that reapply job. |

Menus **11–13** and **17** edit one job and reinstall triggers. Menu **15** removes an old Slack daily trigger.

Timezone is `Asia/Kolkata` in `src/appsscript.json` and `TZ` in `src/Code.js`. Change both if your team uses another zone.

## 7. OpenRouter weekly summaries (optional)

Without a key, Monday still posts each space's collated member text when that space has previous-week content.

1. Create an API key at [openrouter.ai](https://openrouter.ai/).
2. **Daily Progress → 18) Set OpenRouter API key** and paste it. The key is stored as Script Property `OPENROUTER_API_KEY`. The same menu writes the free-tier model list.
3. Models are tried in order. Only ids ending in `:free` are sent. Default:

```text
meta-llama/llama-3.3-70b-instruct:free,deepseek/deepseek-v4-flash:free
```

4. To disable summaries without deleting the key, set `OPENROUTER_ENABLED` to `0`.
5. A space with no previous-week member posts is skipped: no model call and no Chat message.
6. Successful text is stored on **Weekly Space Summaries** and reused on later runs. Clear that row if you want a fresh summary.
7. If every model fails, Chat receives that space's member week text unchanged.

The prompt tags each post with `[YYYY-MM-DD]` so the summary can follow the week's order.

## 8. Day-to-day

On a personal tab, add today's date, a summary, and a **Space** from the dropdown. A blank Space is not posted and does not clear a reminder.

| Need | Menu |
|---|---|
| Post today now | 7 |
| Send reminders now | 8 |
| Run last week's roll-up now | 9 |
| Add a person | 1, then 2 |
| Rebuild matrix columns | 10, then 16 if column E changed |

## 9. Maintenance

- After someone joins or leaves a space, edit Team column E and run menu 16.
- After a code change, run `npm test`, then `npm run push`, then reload the sheet.
- Push does not delete Script Properties or triggers.
- Do not commit `.clasp.json`, `.clasprc.json`, webhook URLs, or API keys.
