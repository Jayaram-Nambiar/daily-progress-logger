# ADR-003: Keep schedule and message rules in logic.js

## Status

Accepted

## Date

2026-09-26

## Context

Week ranges, schedule validation, reminder text, and weekly-summary prompts must stay stable. Apps Script services (`SpreadsheetApp`, `UrlFetchApp`, `PropertiesService`) cannot run under `node --test`.

## Options Considered

### Option A: All behavior in `src/Code.js`

- Pros: One file to push.
- Cons: Tests need a mock of every Apps Script service, or they do not exist.

### Option B: A pure `Logic` object in `src/logic.js`

- Pros: `test/logic.test.js` loads the file with `vm` and asserts dates, schedules, prompts, and message shape. `Code.js` calls `Logic` and owns the side effects.
- Cons: Two files must stay in agreement. Apps Script loads both because they share the same project; there is no `require`.

### Option C: Move the script to Node and call the Sheets API

- Pros: Ordinary unit tests and a normal server.
- Cons: Replaces the spreadsheet-bound menu, triggers, and default Cloud project this template is built around.

## Decision

We choose **Option B**. `src/logic.js` has no Apps Script calls. `npm test` is the check for date math, schedule minutes, reminder copy, and the weekly prompt. Sheet I/O, triggers, and HTTP stay in `src/Code.js`.

## Consequences

- A change to week boundaries or prompt wording needs a test in `test/logic.test.js`.
- Do not add `SpreadsheetApp` or `UrlFetchApp` to `logic.js`. That would make `npm test` fail and would hide side effects inside the pure module.
