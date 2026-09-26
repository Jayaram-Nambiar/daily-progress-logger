# ADR-002: Keep secrets in Script Properties

## Status

Accepted

## Date

2026-09-26

## Context

Each Chat space has an incoming webhook URL. Weekly summaries optionally use an OpenRouter API key. Both values authorize an external post. The workbook is shared with the people who log progress, so a sheet cell is visible to everyone who can open the file. Source control is public.

## Options Considered

### Option A: Cells on the Chat Spaces sheet

- Pros: Easy to edit next to the space name.
- Cons: Anyone with sheet access can copy the webhook. A `clasp pull` or a shared screenshot can leak it into git.

### Option B: Constants in `src/Code.js`

- Pros: Nothing to configure in the Apps Script UI.
- Cons: `npm run push` and git history both contain the secret.

### Option C: Script Properties

- Pros: Apps Script stores them outside the source files and outside sheet cells. `clasp push` does not read or write them. The sheet stores the property **name** only.
- Cons: Menu 5 writes one property. Additional spaces are set under Project Settings → Script properties. A property is still visible to anyone who can open the script project.

## Decision

We choose **Script Properties**.

| Name | Holds |
|---|---|
| `GOOGLE_CHAT_WEBHOOK_URL` | Primary space webhook |
| Name from Chat Spaces column C | That space's webhook |
| `OPENROUTER_API_KEY` | Optional weekly-summary key |
| `OPENROUTER_MODEL` | Comma-separated model ids |
| `OPENROUTER_ENABLED` | `0` skips the model and keeps the key |
| `SLACK_WEBHOOK_URL` | Unused while Slack is disabled |

`readConfiguredSpaces_` checks the box in column D from whether the named property has a value. The checkbox is a display, not the secret.

## Consequences

- `.clasp.json` and `.clasprc.json` stay gitignored. The example file has a placeholder script id only.
- Execution logs must not print property values. OpenRouter failures log a short response excerpt, not the key.
- Sharing the Apps Script project shares the properties. Treat script editors as secret holders.
