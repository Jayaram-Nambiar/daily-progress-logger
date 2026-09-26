# Contributing

Issues and pull requests are welcome. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## What belongs here

This repository is a published template. Changes should stay generic.

- Do not add webhook URLs, API keys, script ids, `.clasp.json`, or `.clasprc.json`.
- Do not add a real name, email address, Chat user id, Slack id, or space id. Examples use `@example.com` and obvious placeholders such as `EXAMPLESPACEALPHA`.
- Do not add `projectId` to clasp config, and do not document a path that switches off the default Apps Script Cloud project.

## Local check

```powershell
npm install
npm test
node --check src/Code.js
node --check src/logic.js
```

`npm test` loads `src/logic.js` in Node. It does not call Google. Put date math, schedule rules, and message formatting in `src/logic.js`, and cover the change in `test/logic.test.js`. Keep `SpreadsheetApp`, `UrlFetchApp`, `PropertiesService`, and `MailApp` in `src/Code.js`.

## Pull requests

- Explain why the behavior should change. Link an issue when there is one.
- Update [docs/runbook.md](docs/runbook.md) or [docs/architecture.md](docs/architecture.md) when an operator step or a trust boundary changes.
- A hard-to-reverse choice gets a new file in [docs/decisions/](docs/decisions/README.md). Do not delete a superseded record; point it at the replacement.
- Prefer a small diff. Do not reformat unrelated code.

## Publishing secrets by mistake

If a webhook or key reached a commit or an issue, revoke it at the provider, store the replacement only in Script Properties, and say so in [a private security advisory](https://github.com/Jayaram-Nambiar/daily-progress-logger/security/advisories/new) if the value was exposed. Do not paste the secret into the advisory.
