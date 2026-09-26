# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x on `main` | Yes |

This is a template you copy into your own spreadsheet. Security of a deployment also depends on who can edit that spreadsheet and who can open its Apps Script project.

## Report a vulnerability

Use a [private security advisory](https://github.com/Jayaram-Nambiar/daily-progress-logger/security/advisories/new) on this repository.

Do not open a public issue for a vulnerability. Do not paste webhook URLs, API keys, script ids, access tokens, or personal data into the report. Describe the file, the behavior, and the impact. If you need to prove a leak, redact the secret and say where it appeared.

## What this project treats as a secret

- Google Chat incoming webhook URLs
- Slack webhook URLs, even while Slack posting is disabled
- `OPENROUTER_API_KEY` and any other API key
- `.clasprc.json` (clasp login) and `.clasp.json` (your script id)
- The contents of Script Properties

The Chat Spaces sheet stores the property **name** only. `npm run push` does not upload Script Properties.

## Operator expectations

- Script editors can read Script Properties. Limit that access to people who may post into the Chat spaces.
- Menu **18** and menu **5** write secrets into Script Properties. They do not write them into `src/`.
- Weekly summaries send progress text and the spreadsheet URL to OpenRouter when a key is set. Leave the key unset to keep that text inside Google.
- The script posts with the webhook you stored. Anyone who obtains that URL can post to the space until you delete the webhook in Chat.
