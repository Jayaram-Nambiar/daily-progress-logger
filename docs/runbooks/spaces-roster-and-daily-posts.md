# Runbook: Daily Progress Logger

Operator guide for **DailyProgressTracker** — setup, configuration, daily use, and maintenance. Written for a beginner who has not touched this project before.

| | |
|---|---|
| Spreadsheet | [DailyProgressTracker](https://docs.google.com/spreadsheets/d/1NHSu_IvUWXnNJqyEbqnAydQ4joftWk6DP68RPQRgMX4/edit) |
| Spreadsheet ID | `1NHSu_IvUWXnNJqyEbqnAydQ4joftWk6DP68RPQRgMX4` |
| Apps Script ID | `1SbZPWZVEXklZ7xlFhsGMI6AelcAkfkllyLuZ-pBh2sjFlZZ6NMmpEB_g` |
| Default GCP project | `984576077062` (do not switch away) |
| Timezone | `Asia/Kolkata` |
| Chrome / Chat account | `dr.jayaram@arcaai.com` |
| Local code | this repo → `src/` |

Agents and developers should also read [AGENTS.md](../../AGENTS.md) and [ADR-001](../decisions/0001-keep-default-gcp-project.md).

---

## Contents

1. [What this system does](#1-what-this-system-does)
2. [Hard rules (read once)](#2-hard-rules-read-once)
3. [Prerequisites](#3-prerequisites)
4. [Setup from scratch](#4-setup-from-scratch)
5. [Configure Google Chat webhooks](#5-configure-google-chat-webhooks)
6. [Configure Team, membership, and reminders](#6-configure-team-membership-and-reminders)
7. [Configure schedules and triggers](#7-configure-schedules-and-triggers)
8. [Configure OpenRouter weekly summaries](#8-configure-openrouter-weekly-summaries)
9. [Day-to-day use](#9-day-to-day-use)
10. [Manual Chat lookups](#10-manual-chat-lookups)
11. [Menu reference](#11-menu-reference)
12. [Sheet contracts](#12-sheet-contracts)
13. [How posts decide what to send](#13-how-posts-decide-what-to-send)
14. [Weekly roll-up and LLM behavior](#14-weekly-roll-up-and-llm-behavior)
15. [Maintenance checklist](#15-maintenance-checklist)
16. [Failure modes](#16-failure-modes)
17. [Out of scope](#17-out-of-scope)
18. [Appendix — current space ids and Chat user ids](#18-appendix--current-space-ids-and-chat-user-ids)

---

## 1. What this system does

Each team member has a personal tab in the spreadsheet. They log a daily row (date, summary, hours, blockers, tomorrow’s plan) and pick a **Space** from a dropdown.

On a schedule (Asia/Kolkata):

| When (default) | What happens |
|---|---|
| Weekdays ~18:00 | Reminder in each Chat space for people who are checked on the Reminder Matrix and have not logged today for that space. Also one email per person listing spaces they still owe. |
| Weekdays ~19:00 | Today’s rows are posted to Google Chat, split by the Space column (only spaces with a webhook). |
| Monday ~09:00 | Previous Mon–Sun week is written to **Weekly Rollup**. Each space with a webhook gets a **summary-only** Chat post (OpenRouter free models when keyed). If LLM fails, that space gets the member week text as-is. |

The script never calls the Google Chat API. It posts only through **incoming webhooks** stored as Script Properties. Slack code exists but does not send (`SLACK_ENABLED = false`).

---

## 2. Hard rules (read once)

1. Stay on the **default** Apps Script Cloud project. Do not use **Project Settings → Google Cloud Platform project → Change project**.
2. `.clasp.json` may contain only `scriptId` and `rootDir`. Never add `projectId`.
3. Do not run `clasp run-function`, `clasp setup-logs`, `clasp enable-api`, `clasp open-api-console`, or `clasp open-credentials-setup`.
4. Do not enable the Google Chat API on this script or any other Cloud project as a workaround.
5. Never paste webhook URLs, OpenRouter keys, or other Script Property **values** into the repo, sheet cells, docs, or Chat.
6. Do Chat / sheet work in Chrome as `dr.jayaram@arcaai.com` (not `jayaramhnambiar@gmail.com`).
7. Do not spam live Chat with test messages. A PRJ_VOX test already landed on 2026-09-25. Prefer dry verification when possible.
8. Do not call `setDataValidation` on Team column **E (Spaces)** — that destroys the multi-select chip dropdown. Only copy the existing rule with `applyTeamSpacesDropdown_`.

---

## 3. Prerequisites

| Need | Notes |
|---|---|
| Node.js | LTS is fine. Used for `npm install`, `npm test`, and clasp. |
| This repo | Local clone of Daily Progress Logger. |
| clasp login | `npx clasp login` as `dr.jayaram@arcaai.com`. Credentials land in `%USERPROFILE%\.clasprc.json`. |
| Spreadsheet access | Edit rights on DailyProgressTracker. |
| Google Chat | Membership in the project spaces you will configure. |
| OpenRouter (optional) | Free-tier account + API key if you want LLM weekly summaries. |

---

## 4. Setup from scratch

The Apps Script project and spreadsheet already exist. This checkout does **not** create a second script. “From scratch” means a new machine or a new operator bringing the local workspace online and confirming the live sheet is healthy.

### 4.1 Install local tools

In PowerShell, from the repo root:

```powershell
cd "C:\Users\jayar\Documents\Daily Progress Logger"
npm install
npx clasp login
```

Sign in as `dr.jayaram@arcaai.com`. Then:

```powershell
# Confirm .clasp.json has only scriptId and rootDir — no projectId
Get-Content .clasp.json

npm run pull
npm test
```

Check: `npm test` prints a pass. `.clasp.json` still has no `projectId`.

### 4.2 Confirm the live script and Cloud project

1. Open the [spreadsheet](https://docs.google.com/spreadsheets/d/1NHSu_IvUWXnNJqyEbqnAydQ4joftWk6DP68RPQRgMX4/edit) as `dr.jayaram@arcaai.com`.
2. **Extensions → Apps Script**. The URL must contain script id `1SbZPWZVEXklZ7xlFhsGMI6AelcAkfkllyLuZ-pBh2sjFlZZ6NMmpEB_g`.
3. Click the gear (**Project Settings**). Under **Google Cloud Platform (GCP) Project**, it must still be the **default** Apps Script project (number `984576077062`). If you see a standard project you chose yourself, **stop** — do not click Change project. See [ADR-001](../decisions/0001-keep-default-gcp-project.md).

Check: editor files include `Code.gs` / `logic` content with `SLACK_ENABLED = false`, and the manifest lists spreadsheet, mail, external_request, and scriptapp scopes only (no Chat API scopes).

### 4.3 Push code after local edits

Whenever you change `src/`:

```powershell
npm test
node --check src/Code.js
node --check src/logic.js
npm run push
```

If clasp prints `Skipping push` after an `oauthScopes` change in a non-TTY session:

```powershell
npx clasp push --force
```

That is clasp force, not git force. Push/pull do **not** change Script Properties, triggers, or sheet cells.

### 4.4 Reload the spreadsheet menu

Reload the spreadsheet tab. The **Daily Progress** menu should appear. If Google asks for authorization, approve as `dr.jayaram@arcaai.com`.

Continue with sections 5–8 as needed. On a healthy production sheet, webhooks and roster are already filled; you mainly verify and optionally set OpenRouter.

### 4.5 First-time sheet bootstrap (only if sheets are empty)

If Team / Chat Spaces / member tabs are missing or empty (unusual for this production sheet):

1. **Daily Progress → Bootstrap roster, spaces & sheets** (or run `provisionRosterSpacesAndSheets` from the Apps Script editor — preferred for the first headless run because it does not call `getUi()`).
2. **Sync member sheets**.
3. **Sync reminder matrix**.
4. Fill Team column **E Spaces** (see [§6](#6-configure-team-membership-and-reminders)).
5. **Apply Team spaces to reminder matrix**.
6. Set webhooks ([§5](#5-configure-google-chat-webhooks)).
7. **Apply schedules from sheet** ([§7](#7-configure-schedules-and-triggers)).
8. Optionally configure OpenRouter ([§8](#8-configure-openrouter-weekly-summaries)).

---

## 5. Configure Google Chat webhooks

Webhook URLs are **secrets**. They live only in Script Properties. The sheet stores the **property name** (Chat Spaces column C), never the URL.

### 5.1 Create a webhook in Chat

1. In Chrome, sign in as `dr.jayaram@arcaai.com` and open [Google Chat](https://chat.google.com/).
2. Open the project space (header name must match Chat Spaces column A exactly).
3. Open management: `https://chat.google.com/app/management/<SPACE_ID>` (see [§10.1](#101-read-a-space-id)).
4. Left menu → **Apps & integrations** → **Incoming webhooks** → **Add**.
5. Name: `Daily Progress`. Save. Copy the URL (looks like `https://chat.googleapis.com/v1/spaces/SPACE_ID/messages?key=...&token=...`).
6. Confirm the `SPACE_ID` inside the URL matches Chat Spaces column B for that row. If not, delete the webhook and recreate it in the correct space.

Do **not** create a second Daily Progress webhook in a space that already has one.

### 5.2 Store the URL

| Space | Chat Spaces column C | How to save |
|---|---|---|
| PRJ_VOX | `GOOGLE_CHAT_WEBHOOK_URL` | Spreadsheet → **Daily Progress → Set Chat webhook…**. Paste URL → OK. |
| Any other space | e.g. `GOOGLE_CHAT_WEBHOOK_LAB_STATUS_NOTICE` | **Extensions → Apps Script → Project Settings (gear) → Script properties → Add script property**. Property = column C exactly. Value = full URL. Save. |

After the property exists, run **Post today's updates now** (with a today row tagged to that space) or wait for `readConfiguredSpaces_` on the next post — it checks column D (**Configured**) when the property has a value.

### 5.3 Test carefully

- PRJ_VOX: **Test Chat webhooks** (one message). Prefer not to repeat if a recent test already landed.
- Other spaces: put a today row on a member tab with Space = that name, then **Post today's updates now**, and read that Chat space.

All nine project spaces already have webhooks as of 2026-09-25. Add another only when a new space is added to Chat Spaces.

---

## 6. Configure Team, membership, and reminders

### 6.1 Team columns

| Column | Header | Purpose |
|---|---|---|
| A | Name | Full name. Sanitized form = personal tab name. |
| B | Slack | Unused while Slack is off. Keep existing values. |
| C | Email | Identity key. Also the reminder email address. |
| D | Chat | `<users/NUMERIC_ID>` so Chat can ping them. Blank → bold name only. |
| E | Spaces | Multi-select chip dropdown of Chat Spaces names. Comma-separated under the hood. Source of truth for who belongs where. |

There is **no** Remind column on Team. Who is reminded lives on **Reminder Matrix**.

### 6.2 Add or update a member

1. **Add or update member** (name, then email), or edit Team by hand (match existing rows by **email**, not first name). The menu fills Chat (D) from `CHAT_USER_IDS` when the email is in that map. A blank email on update keeps the existing email. A valid `<users/DIGITS>` cell is kept when the email is not in the map. The menu does not ask you to paste a user id.
2. **Sync member sheets** if you edited Team by hand, so their personal tab exists with headers and Space dropdown. **Add or update member** already syncs that tab.
3. If the alert says column D was left blank, add the id to `CHAT_USER_IDS` — see [§10.3](#103-read-a-persons-chat-user-id) — then run **Add or update member** again or **Bootstrap roster, spaces & sheets**.
4. Set Spaces (E) with the chip dropdown.
5. **Sync reminder matrix**, then check the boxes for spaces they should be reminded in.
6. **Apply Team spaces to reminder matrix** so non-member cells go blank.

### 6.3 Update who belongs in which space

1. On **Team**, click a Spaces cell and add/remove chips (options come from `Chat Spaces!A2:A`).
2. For a bulk audit from Chat: open each `https://chat.google.com/app/management/<SPACE_ID>` as `dr.jayaram@arcaai.com` → **Copy member emails** → keep only `@arcaai.com` addresses that are on Team → align column E.
3. Run **Apply Team spaces to reminder matrix**. That sets Script Property `SPACE_ACCESS_SYNCED=1` and blanks matrix cells for spaces the person is not in. Existing checks stay where they remain a member.
4. Spot-check **Reminder Matrix**.

Apps Script cannot turn on “Allow multiple selections”. That flag was set in the Sheets UI. Never recreate column E validation with `setDataValidation`.

### 6.4 Reminder Matrix

- Column A = member name; later columns = one checkbox per Chat space.
- Checked = remind this person in that space when they have no today summary for that space.
- **Sync reminder matrix** adds people/spaces unchecked, keeps existing checks, drops people who left Team.
- After **Apply Team spaces to reminder matrix**, non-member cells are blank (no checkbox).

---

## 7. Configure schedules and triggers

### 7.1 Schedules sheet

| Job | Default Days | Hour | Minute | Handler |
|---|---|---|---|---|
| Reminder | Mon–Fri | 18 | 0 | `sendReminder_trigger` |
| Daily post | Mon–Fri | 19 | 0 | `postDailyUpdatesToChat_trigger` |
| Weekly roll-up | Mon | 9 | 0 | `weeklyRollup_trigger` |
| Space access | Mon–Fri | 8 | 0 | `refreshSpaceAccess_trigger` |

Apps Script only accepts minutes **0, 15, 30, 45**, and may start up to ~15 minutes from that minute. The job also checks the Days cell at run time.

**Space access** only reapplies Team column E to the Reminder Matrix. It cannot read Google Chat membership. Leave it **uninstalled** (Enabled = FALSE, then Apply) unless you intentionally want a weekday 08:00 reapply of column E.

### 7.2 Install or change triggers

| Goal | Action |
|---|---|
| Change one job | Edit the **Schedules** sheet (days / hour / minute / Enabled). |
| Apply the whole sheet | **Apply schedules from sheet** |
| Disable one job | Uncheck Enabled on that row → **Apply schedules from sheet** |
| Remove old Slack 20:30 trigger | Slack-only cleanup (Apply schedules from sheet also deletes the old Slack trigger) |

Check: **Extensions → Apps Script → Triggers** (clock icon) lists the expected handlers in Asia/Kolkata.

### 7.3 Run jobs immediately (ignore day list)

- **Post today's updates now**
- **Send reminders now**
- **Run weekly roll-up now**
- **Apply Team spaces to reminder matrix**

---

## 8. Configure OpenRouter weekly summaries

Optional. Without a key, Monday posts still work: each configured space receives the **member week text** (collated posts for that space).

### 8.1 What you get

When configured and enabled:

1. For each Chat space that has a webhook **and** at least one previous-week member update tagged to that space…
2. The script calls OpenRouter (`UrlFetchApp` only — stays on default GCP).
3. Primary free model, then fallback free model.
4. Chat receives a **summary-only** message (no per-member dump).
5. Summaries are stored on sheet **Weekly Space Summaries** and reused on re-runs.
6. If every free model fails (or returns empty), Chat gets that space’s member week text **unchanged**.

Spaces with **no** previous-week member content for that space are skipped entirely: no LLM call (saves free-tier tokens), no Chat post, no Weekly Space Summaries row. The LLM input uses the member’s name and tags each post with `[YYYY-MM-DD]` (sorted ascending). It asks for a short synthesis, not a copy of every line.

### 8.2 Get a free-tier API key

1. Open [https://openrouter.ai/](https://openrouter.ai/) and create / sign in to an account on the **free** plan.
2. Create an API key in the OpenRouter dashboard.
3. Do not paste the key into git, docs, sheet cells, or Chat.

### 8.3 Save the key in Apps Script (recommended)

1. Open the spreadsheet as `dr.jayaram@arcaai.com`.
2. **Daily Progress → Set OpenRouter API key**.
3. Paste the key → OK.
4. Leave the prompt blank and OK if you want to **clear** the key (LLM summaries stop; member-text fallback remains).

**Set OpenRouter API key** also writes Script Property `OPENROUTER_MODEL` to the free defaults and sets `OPENROUTER_ENABLED` to `1` if it was missing.

### 8.4 Script Properties reference

| Property | Required? | Meaning |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes, for LLM | Secret. Set via **Set OpenRouter API key**. |
| `OPENROUTER_MODEL` | No | Comma-separated free model ids. **`:free` ids and `openrouter/free` are used.** Default: `google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free`, then the `openrouter/free` router. Paid ids are ignored. Retired ids `meta-llama/llama-3.3-70b-instruct:free`, `deepseek/deepseek-v4-flash:free`, and `qwen/qwen3.8-27b:free` are skipped even when this property still lists them. |
| `OPENROUTER_ENABLED` | No | Default on when key exists. Set to `0`, `false`, `off`, or `no` to disable LLM without deleting the key. |

To edit properties by hand: **Extensions → Apps Script → Project Settings → Script properties**.

Example free model list (safe to store; not a secret):

```text
google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free
```

### 8.5 Disable LLM without deleting the key

Add or edit Script Property:

| Property | Value |
|---|---|
| `OPENROUTER_ENABLED` | `0` |

Weekly posts continue with member-text fallback only.

### 8.6 Verify without spamming every space

1. Confirm `OPENROUTER_API_KEY` is set (**Set OpenRouter API key**).
2. Prefer waiting for Monday ~09:00, **or** run **Run weekly roll-up now** once when you intentionally want live posts.
3. Check **Weekly Space Summaries** for new LLM Summary rows.
4. Read one Chat space that had previous-week content — expect summary-only bullets when LLM succeeded.
5. Apps Script → **Executions**: look for OpenRouter HTTP errors if a space fell back to member text.

Re-running weekly roll-up **reuses** stored summaries unless code is changed to force regeneration. Clearing the matching **Weekly Space Summaries** row forces a fresh LLM call on the next run (when enabled).

### 8.7 Free-tier model policy

| Order | Model id | Role |
|---|---|---|
| 1 | `google/gemma-4-31b-it:free` | Primary summarizer |
| 2 | `google/gemma-4-26b-a4b-it:free` | Fallback if primary fails or returns empty content |
| 3 | `openrouter/free` | Router over whatever OpenRouter currently offers for free |
| 4 | _(none)_ | Post that space’s collated member updates as-is |

Requests send `reasoning.effort: none`. A stored `OPENROUTER_MODEL` that still names the retired Llama 3.3, DeepSeek V4 Flash, or `qwen/qwen3.8-27b:free` ids does not call those ids. **Set OpenRouter API key** rewrites the property to the current defaults. The weekday **Daily post** reads each member sheet once, then posts. It does not call OpenRouter.

If you change `OPENROUTER_MODEL`, keep only `:free` ids. After changing models by hand, you can re-run **Set OpenRouter API key** (paste the same key) to reset the list to code defaults.

---

## 9. Day-to-day use

### For each member

1. Open your personal tab.
2. Add a row: today’s date, summary, optional hours / blockers / tomorrow plan.
3. Set **Space** from the dropdown to the project that should receive the update.
4. A blank or invalid Space on a today row shows a toast; that row will not post and will not clear a reminder for any space.

### For an operator

| Task | Action |
|---|---|
| Someone joined a Chat space | Update Team E → **Apply Team spaces to reminder matrix** |
| New project space | Add Chat Spaces row → create webhook → set Script Property → sync matrix → fill Team E |
| Change reminder / post time | Edit Schedules or menus 11–13 / 17 → Apply |
| Turn off LLM summaries | `OPENROUTER_ENABLED=0` or clear key via **Set OpenRouter API key** |
| Check why a space got no post | Configured checkbox, webhook property, Space column on rows, Executions log |

---

## 10. Manual Chat lookups

Do this in Chrome as `dr.jayaram@arcaai.com`. Another profile (`jayaramhnambiar@gmail.com`) is a different Chat account — ids will not match.

Before every lookup:

1. Open https://chat.google.com/
2. Check the avatar → account must be `dr.jayaram@arcaai.com`

| What you hold | Looks like | Where it goes |
|---|---|---|
| Space id | `AAQA-0Z41U4` | Chat Spaces column B |
| Person id | `user/human/1055…` | Digits only, as `<users/1055…>` in Team column D |
| Webhook URL | `https://chat.googleapis.com/v1/spaces/…?key=…&token=…` | Script Property only |

Ignore DMs and meeting conversations (e.g. `Daily Catchup (HOPE) - Sep 24`).

### 10.1 Read a Space id

1. Open the space from the left **Spaces** list. Trust the **header** name (tab title can be stale).
2. Address bar examples:
   - `https://chat.google.com/room/AAQA-0Z41U4/...` or
   - `https://chat.google.com/app/chat/AAQA-0Z41U4`
   - `https://chat.google.com/app/management/AAQA-0Z41U4`
3. Space id = last path segment starting with `AAQA…`. No `?key=` / `token=`.
4. Paste into Chat Spaces column B for the row whose column A matches the header exactly.

### 10.2 Create and store a webhook

See [§5](#5-configure-google-chat-webhooks).

### 10.3 Read a person’s Chat user id

Chat hides the id in an HTML attribute. Prefer the members table (includes email).

Example attributes:

```text
data-member-id="user/human/105560557556056333545"
data-name="Karan Mohan"
data-hovercard-id="karan@arcaai.com"
```

Team column D stores:

```text
<users/105560557556056333545>
```

Steps:

1. Open `https://chat.google.com/app/management/<SPACE_ID>` → **Manage members** → **Added**.
2. Scroll until the person’s **name and email** are visible (virtualized list).
3. `Ctrl+Shift+I` → `Ctrl+Shift+C` → click the **name**.
4. Walk up parents until you see `data-name`, `data-member-id`, and `data-hovercard-id`.
5. Match `data-hovercard-id` to Team column C email.
6. Copy digits after `user/human/` into Team D as `<users/DIGITS>`.

Do not put `user/human/...` or the email in column D. A bare number is accepted by `normalizeChatMention_` and rewritten to `<users/...>`.

`fillChatMentions_` fills blank cells from the `CHAT_USER_IDS` map in `src/Code.js` and does not overwrite an existing `<users/…>` cell. **Add or update member** uses the same map for the email you enter, and keeps an existing `<users/DIGITS>` value when the email is not in the map.

Ids already collected are in the [appendix](#182-chat-user-ids-already-collected).

---

## 11. Menu reference

Reload the spreadsheet after a clasp push so `onOpen` rebuilds the menu.

| Menu item | Function | What it does |
|---|---|---|
| Add or update member | `addOrUpdateMember` | Name and email prompts. Fills Chat (D) from `CHAT_USER_IDS` when the email matches. Keeps an existing `<users/DIGITS>` mention when it does not. Syncs the personal sheet |
| Sync member sheets | `syncMemberSheets` | Ensure personal tabs / headers / Space dropdown |
| Bootstrap roster, spaces & sheets | `provisionRosterFromMenu` | Roster merge, Chat Spaces, mentions, matrix, schedules, member tabs |
| Set Chat webhook… | `setGoogleChatWebhookForSpace` | Prompt for Chat Spaces name + URL; checks space id; writes that row’s Script Property |
| Test Chat webhooks | `testAllGoogleChatWebhooks` | One test post per Chat Spaces row that has a webhook property; reports OK/Failed |
| Post today’s updates now | `postDailyUpdatesToChat` | Immediate daily post |
| Send reminders now | `sendReminderNow` | Immediate reminders (Chat + email mention the Schedules **Daily post** time) |
| Run weekly roll-up now | `runWeeklyRollupNow` | Immediate weekly collate + Chat posts (LLM if keyed) |
| Sync reminder matrix | `syncReminderMatrixFromMenu` | Add/drop people and spaces; keep checks |
| Apply Team spaces to reminder matrix | `refreshSpaceAccess` | Column E → matrix; sets `SPACE_ACCESS_SYNCED=1` |
| Apply schedules from sheet | `applySchedulesFromMenu` | Reinstall triggers from the **Schedules** sheet (edit the sheet, then run this) |
| Set OpenRouter API key | `setOpenRouterApiKey` | Save/clear key; write free-tier model list |

Removed from the menu (still in source for compatibility or Slack-only paths):

- **Ensure Team headers** — covered by Bootstrap / Sync
- **PRJ_VOX-only set/test webhook** — replaced by Set/Test Chat webhooks for every space
- **Per-job schedule prompts** (reminder / daily / weekly / space access) — edit the **Schedules** sheet, then **Apply schedules from sheet**
- **Remove daily Slack post trigger** — Slack-only; Apply schedules also deletes that old trigger. Appears under Slack items only when `SLACK_ENABLED` is true

Slack menu items appear only if `SLACK_ENABLED` is true (it is not).

---

## 12. Sheet contracts

### Team

See [§6.1](#61-team-columns). Header frozen. Do not `clear()` the sheet.

### Chat Spaces

| Column | Header | Rule |
|---|---|---|
| A | Space | Exact Chat space name (dropdown source) |
| B | Space id | From Chat URL. Not a secret |
| C | Webhook property | Script Property **name** only |
| D | Configured | Rewritten from whether that property has a value |

### Personal member tabs

| Column | Header | Rule |
|---|---|---|
| A | Date | Date picker / `yyyy-mm-dd` |
| B | Summary | Required for posting and for “updated” |
| C | Hours | Parsed by `parseHoursToNumber_` |
| D | Blockers | Included in daily / weekly member text |
| E | Tomorrow Plan | Daily Chat only; omitted from weekly roll-up |
| F | Space | Dropdown from Chat Spaces. Blank → nowhere |

Do not insert Space between A–E; `syncOneMember_` is position-based.

### Reminder Matrix / Schedules / Weekly Rollup / Weekly Space Summaries

Documented in [context/workbook.md](../../context/workbook.md). Weekly Space Summaries holds reused LLM text (Week Start, Week End, Space, LLM Summary) — not secrets.

---

## 13. How posts decide what to send

### Daily post (per configured space)

Keep a member row only when:

1. Date is **today** (Asia/Kolkata `yyyy-MM-dd`)
2. Summary is non-empty
3. Space equals that Chat Spaces name exactly (case-sensitive; use the dropdown)

If nobody matches, that space gets **no** message (no “no updates” spam).

### Reminder (per space)

Matrix cell checked **and** no qualifying today row for that space → include in that space’s reminder. Chat and email both mention the Schedules **Daily post** clock time (Asia/Kolkata), e.g. `around 19:00 IST`. Email is one note per person listing all spaces they still owe.

### Weekly roll-up

Previous Monday–Sunday (Asia/Kolkata). Same Space filter. Written to **Weekly Rollup**. Chat: summary-only if LLM succeeds; else member blocks for that space. Spaces without a webhook are skipped for Chat (sheet rows still saved).

---

## 14. Weekly roll-up and LLM behavior

1. Collate previous week per member per space (pretty dates in member text; ISO dates for LLM).
2. Upsert **Weekly Rollup** (`weekStart|space|member`).
3. For each space with a webhook:
   - If OpenRouter enabled and no stored summary → call free models in order with dated prompt.
   - Write success to **Weekly Space Summaries**.
   - Build Chat message: AI summary alone, or member detail fallback.
   - `sendToChat_` via that space’s webhook.

Prompt rules (in `src/logic.js`): use only provided text; do not invent work, people, dates, or blockers; heading is the member name; `[YYYY-MM-DD]` tags stay on the source lines; do not restate every daily line; 3–6 `• ` bullets; never emit `<users/…>` tokens.

---

## 15. Maintenance checklist

| Cadence | Task |
|---|---|
| When someone joins/leaves a space | Edit Team E → **Apply Team spaces to reminder matrix** |
| When a new project space appears | Chat Spaces row + webhook property + Team E + matrix sync |
| After pulling code changes | `npm test` → `npm run push` → reload sheet |
| If Monday summary looks wrong | Check Weekly Space Summaries, Executions, OpenRouter free model availability |
| Quarterly | Spot-check Chat Spaces Configured vs Script Properties; confirm GCP still default |
| Never | Commit Script Property values; switch GCP project; enable Chat API |

---

## 16. Failure modes

| What you see | Why | What to do |
|---|---|---|
| Two tabs for one person | Rename after a second tab was created | Copy rows to the tab with history; delete empty duplicate |
| Hours / Blockers look swapped | Space inserted mid-header | Move Space to column F; restore A–E headers |
| Everyone posted into PRJ_VOX | Blank Space treated as all, or wrong column | Blank Space must be excluded; Space is column F |
| Wrong space gets rows | Shared webhook or skipped Space compare | One webhook per space; Space must equal destination name |
| Reminder includes unchecked person | Matrix not synced / non-boolean check | **Sync reminder matrix**; checks use `=== true` |
| Matrix still shows non-member checkboxes | Column E empty or **Apply Team spaces to reminder matrix** not run | Fill E → **Apply Team spaces to reminder matrix** |
| **Apply Team spaces to reminder matrix** says Spaces empty | E1 ≠ `Spaces` or all blank | Fix header; set at least one list |
| Chat API 403 / enable API dialog | Something called `chat.googleapis.com` | Cancel. Stay on default GCP. Membership is column E only |
| Slack message appears | Flag true or old 20:30 trigger | `SLACK_ENABLED=false`, push, **Apply schedules from sheet** |
| Ping shows `user/human/...` | Wrong Chat column format | Use `<users/digits>` |
| Posts land in wrong space | Webhook URL space id ≠ column B | Delete webhook; recreate in correct space |
| Weekly Chat is raw member dumps | No key, disabled, retired model ids, or every free model failed | **Set OpenRouter API key**; check `OPENROUTER_ENABLED`; Executions log. Empty **Weekly Space Summaries** means the model did not return text |
| OpenRouter HTTP 404 on llama-3.3, deepseek-v4-flash, or qwen3.8-27b `:free` | Those free ids were removed from the catalog | Current code skips them and calls `openrouter/free` last. **Set OpenRouter API key** stores the new defaults |
| OpenRouter HTTP 402 / paid model | Non-free id in property | **Set OpenRouter API key** to reset the free list. Paid ids are ignored |
| No daily Chat post, Executions **Failed** after several minutes with "a server error occurred" | Daily post read every member sheet once per space | Current code reads each sheet once, then posts. A single sheet that still throws is logged and skipped |
| Only PRJ_VOX gets daily/weekly/reminder Chat posts; other spaces stay silent; Executions still **Completed** | Script Property webhook URLs stored with HTML-escaped `&amp;` (no real `token=` param) → HTTP 403 invalid token; failures were logged and skipped | Fixed properties must use a normal `&` between `key` and `token`. Code now decodes `&amp;` on read. Use **Test Chat webhooks** to confirm every space returns OK |
| Consent loop every week | Script moved to standard GCP Testing | Stop. See ADR-001 |
| `getUi()` error in Executions | Headless run called alert / `onOpen` | Run `provisionRosterSpacesAndSheets` or `*_` trigger helpers |

---

## 17. Out of scope

- Second Daily Progress webhook in a space that already has one
- Deleting the unused `Najmunneesa MC` tab
- Turning Slack on (`SLACK_ENABLED` stays false)
- Storing webhook URLs or API keys in git or on the spreadsheet
- Google Chat API / leaving the default Cloud project (needs a new ADR)

---

## 18. Appendix — current space ids and Chat user ids

Verified during 2026-09-25 work. Re-check if a cell is blank or a new person joins.

### 18.1 Project spaces

| Space | Space id |
|---|---|
| HAK_HEALTH_A_THON | `AAQALEBwG_c` |
| PRJ_VOX | `AAQA-0Z41U4` |
| LAB_STATUS_NOTICE | `AAQAautJJpw` |
| LEARNING_ARCA | `AAQAZB4dIEU` |
| PRJ_AURA | `AAQAoanHnMA` |
| PRJ_TRUECLAIM | `AAQAjn_vK0E` |
| CORE_ENGINEERING | `AAQAKebVtzU` |
| Leaders & Managers | `AAQAdLsaqpE` |
| PRJ_PATHREADY_INT | `AAQAsNpLVh4` |

Meeting conversations are excluded. All nine have Script Property webhooks; Configured is driven by those properties.

### 18.2 Chat user ids already collected

| Email | Team column D |
|---|---|
| dr.jayaram@arcaai.com | `<users/105136892834486514658>` |
| sumankumar@arcaai.com | `<users/110367492583288019964>` |
| tushar@arcaai.com | `<users/109313311788049396884>` |
| anantha@arcaai.com | `<users/109473194711852956541>` |
| indumati@arcaai.com | `<users/100542642015747516815>` |
| josekutty@arcaai.com | `<users/112217037113835338884>` |
| karan@arcaai.com | `<users/105560557556056333545>` |
| karthik@arcaai.com | `<users/116148811746914162896>` |
| neena@arcaai.com | `<users/112238864895487291779>` |
| nitik@arcaai.com | `<users/105624718225903316093>` |
| ramya@arcaai.com | `<users/107878147491660645515>` |
| rijna@arcaai.com | `<users/104338317742127926068>` |
| rohit@arcaai.com | `<users/117885350726889887078>` |
| dr.shibu@arcaai.com | `<users/106177154370554184641>` |
| surya@arcaai.com | `<users/114773095626200612235>` |
| tap@arcaai.com | `<users/114622970193957514150>` |
| vidit@arcaai.com | `<users/116156027267557744097>` |

### 18.3 Historical roster note

Production Team has 17 roster emails. Unused personal tab `Najmunneesa MC` may remain; do not delete unless asked. Early short names (Rijna, Tap, Josekutty, Jayaram) were renamed to full names with history kept on the same tab.
