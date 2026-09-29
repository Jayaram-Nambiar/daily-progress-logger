# Setup

The operational steps, the reason for each step, and the pitfalls live in the [runbook](runbook.md).

Start there. The constraints that are easy to miss:

- `.clasp.json` contains `scriptId` and `rootDir` only. Do not add `projectId`.
- Do not run `clasp run-function`, `clasp setup-logs`, or `clasp enable-api`. Those attach a standard Cloud project, and leaving the default Apps Script project cannot be undone.
- Replace `EXAMPLE_ROSTER`, `EXAMPLE_SPACE_ROWS`, and `EXAMPLE_CHAT_USER_IDS` before menu **Bootstrap roster, spaces & sheets**. The published values are fictional.
- Webhook URLs and API keys belong in Script Properties, not in git and not in sheet cells.

Sample headers for the workbook: [workbook-sample.md](workbook-sample.md).
