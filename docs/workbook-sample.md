# Workbook sample

This is a **fictional** picture of the workbook the script expects. Headers match `src/Code.js`. Every name, email, Slack id, Chat user id, space id, summary, and checkbox below is invented. None of it is copied from a live spreadsheet.

The same rows are in [workbook-sample.xlsx](workbook-sample.xlsx). `npm install` does not create a Google Sheet and does not upload this file. The script builds an empty workbook of the same shape when you run menu **4** on a blank Sheet. Open the `.xlsx` when you want to see the tabs, including the example log rows and weekly tables that menu 4 does not invent.

Uploading it is optional. To look at it as a Google Sheet in your own account:

1. In Google Drive, choose **New → File upload** and select `docs/workbook-sample.xlsx`.
2. Right-click the uploaded file and choose **Open with → Google Sheets**. Drive keeps the `.xlsx` and adds a Sheet.

Then bind Apps Script to that Sheet and continue at [runbook step 2](runbook.md). The file contains no webhook URL and no API key.

What the conversion does not keep:

- Team column E is comma-separated text. Google Sheets multi-select chips cannot be stored in Excel. Create that dropdown once in the Sheets UI, as the runbook describes.
- Checkboxes may arrive as `TRUE` / `FALSE` text. Click them so they are real checkboxes before you run menu **14** or rely on reminders. **Configured** is false in the sample until a Script Property has a URL.
- Space access is off in the sample. A blank Sheet that the script creates will insert that job as enabled. Uncheck it there too unless you want the weekday reapply.

Personal tabs use the member's name as the sheet name (`Alex Rivera`, `Sam Chen`, `Jordan Patel`).

## Team

| Name | Slack | Email | Chat | Spaces |
|---|---|---|---|---|
| Alex Rivera | U0EXAMPLE01 | alex.rivera@example.com | `<users/900000000000000000001>` | TEAM_ALPHA, TEAM_GAMMA |
| Sam Chen | U0EXAMPLE02 | sam.chen@example.com | `<users/900000000000000000002>` | TEAM_ALPHA, TEAM_BETA |
| Jordan Patel | U0EXAMPLE03 | jordan.patel@example.com | `<users/900000000000000000003>` | TEAM_BETA |

Column E is a multi-select chip dropdown. The stored value is still a comma-separated list.

## Chat Spaces

| Space | Space id | Webhook property | Configured |
|---|---|---|---|
| TEAM_ALPHA | EXAMPLESPACEALPHA | GOOGLE_CHAT_WEBHOOK_URL | (checkbox; true only after the property has a URL) |
| TEAM_BETA | EXAMPLESPACEBETA1 | GOOGLE_CHAT_WEBHOOK_TEAM_BETA | |
| TEAM_GAMMA | EXAMPLESPACEGAMMA | GOOGLE_CHAT_WEBHOOK_TEAM_GAMMA | |

Column C is the Script Property **name**. The webhook URL is not on the sheet.

## Reminder Matrix

A checked cell means "remind this person in this space." After menu 16, a space they are not in has no checkbox.

| Member | TEAM_ALPHA | TEAM_BETA | TEAM_GAMMA |
|---|---|---|---|
| Alex Rivera | TRUE | | TRUE |
| Sam Chen | TRUE | TRUE | |
| Jordan Patel | | TRUE | |

## Schedules

| Job | Enabled | Days | Hour | Minute |
|---|---|---|---|---|
| Reminder | TRUE | Mon,Tue,Wed,Thu,Fri | 18 | 0 |
| Daily post | TRUE | Mon,Tue,Wed,Thu,Fri | 19 | 0 |
| Weekly roll-up | TRUE | Mon | 9 | 0 |
| Space access | FALSE | Mon,Tue,Wed,Thu,Fri | 8 | 0 |

The script writes Space access as enabled when that row is missing. Uncheck it and run **14) Apply schedules** unless you want the weekday reapply job. Times are in the script timezone (`Asia/Kolkata` unless you change it).

## Personal tab — Alex Rivera

Same columns on `Sam Chen` and `Jordan Patel`.

| Date | Summary | Hours | Blockers | Tomorrow Plan | Space |
|---|---|---|---|---|---|
| 2026-09-22 | Drafted the onboarding checklist | 2 | Waiting on review | Share the checklist | TEAM_ALPHA |
| 2026-09-23 | Paired on the signup form | 3 | | Write tests | TEAM_GAMMA |

## Personal tab — Sam Chen

| Date | Summary | Hours | Blockers | Tomorrow Plan | Space |
|---|---|---|---|---|---|
| 2026-09-22 | Fixed the export timeout | 4 | Staging was down | Recheck staging | TEAM_BETA |
| 2026-09-23 | Wrote release notes | 1.5 | | Post the notes | TEAM_ALPHA |

## Personal tab — Jordan Patel

| Date | Summary | Hours | Blockers | Tomorrow Plan | Space |
|---|---|---|---|---|---|
| 2026-09-23 | Reviewed the beta spec | 2h | | Collect comments | TEAM_BETA |

## Weekly Rollup

One row per space and member for the previous Monday–Sunday. Example week 2026-09-21 through 2026-09-27:

| Week Start | Week End | Space | Member | Weekly Summary |
|---|---|---|---|---|
| 2026-09-21 | 2026-09-27 | TEAM_ALPHA | Alex Rivera | • Tue, Sep 22: Drafted the onboarding checklist (2h) |
| 2026-09-21 | 2026-09-27 | TEAM_GAMMA | Alex Rivera | • Wed, Sep 23: Paired on the signup form (3h) |
| 2026-09-21 | 2026-09-27 | TEAM_BETA | Sam Chen | • Tue, Sep 22: Fixed the export timeout (4h) — Blockers: Staging was down |
| 2026-09-21 | 2026-09-27 | TEAM_ALPHA | Sam Chen | • Wed, Sep 23: Wrote release notes (1.5h) |
| 2026-09-21 | 2026-09-27 | TEAM_BETA | Jordan Patel | • Wed, Sep 23: Reviewed the beta spec (2h) |

## Weekly Space Summaries

Created when a model summary is stored. Reused on the next run for that week and space.

| Week Start | Week End | Space | LLM Summary |
|---|---|---|---|
| 2026-09-21 | 2026-09-27 | TEAM_ALPHA | • Tue 2026-09-22: Alex drafted an onboarding checklist. • Wed 2026-09-23: Sam wrote release notes. |
| 2026-09-21 | 2026-09-27 | TEAM_BETA | • Tue 2026-09-22: Sam fixed an export timeout; staging was down. • Wed 2026-09-23: Jordan reviewed the beta spec. |

`TEAM_GAMMA` would get its own row only when that space has previous-week text and a webhook. A space with no member posts for the week is omitted: no summary row and no model call.
