# ADR-001: Keep the default Apps Script Cloud project

## Status

Accepted

## Date

2026-09-25

## Context

The Daily Progress Logger script is container-bound to spreadsheet `1NHSu_IvUWXnNJqyEbqnAydQ4joftWk6DP68RPQRgMX4`. It posts to Slack on a time trigger, sends reminder email, and reads the active spreadsheet. Those calls run as the user who authorized the script.

Google issues a refresh token that expires in 7 days when a Cloud project has an OAuth consent screen set to an external user type and a publishing status of Testing, unless the only scopes are name, email, and profile. A standard Cloud project in Testing hits that limit. The script then stops until someone re-authorizes it.

Apps Script creates a default Cloud project for every new script and builds the consent screen from the script. Default projects are not configurable in the Cloud console for most users, and they are the path that avoids that 7-day Testing expiry. Switching from a default project to a standard project deletes the default project. There is no switch back. Everyone who already authorized the script must authorize it again.

The script was created on 2025-08-26, after Google's 8 April 2019 change that puts new scripts on a default project. This workspace has not called any clasp command that sets a Cloud project. `.clasp.json` has no `projectId`. The Apps Script API `projects.get` response does not include the Cloud project id, and the editor settings page was behind a Google sign-in in this session, so the editor UI was not re-checked here. Confirm once in the editor: **Project Settings → Google Cloud Platform project** should still show the default project, with no standard project number that you chose.

`clasp run-function` needs a standard project because `scripts.run` requires one. This script does not need remote function execution. Executions are simple triggers, installable triggers, and the spreadsheet menu.

## Options Considered

### Option A: Stay on the default Cloud project

- Pros: No 7-day Testing-mode re-authorization. Advanced services enabled in the editor are turned on in the default project automatically. `clasp push` and `clasp pull` work with `scriptId` alone.
- Cons: No Cloud Logging explorer, Error Reporting, Marketplace add-on publishing, or `scripts.run`. The consent screen cannot be customized.

### Option B: Switch to a standard project and publish the consent screen

- Pros: Cloud logs and a stable refresh token after the app is In production (or Internal, for Workspace).
- Cons: Irreversible. Forces a fresh authorization immediately. Verification is required for sensitive scopes if the app is external and in production. More than this script needs.

### Option C: Switch to a standard project and leave the consent screen in Testing

- Pros: None for this script.
- Cons: Irreversible, plus refresh tokens expire every 7 days. This is the failure mode to avoid.

## Decision

Stay on the default Cloud project.

1. `.clasp.json` must contain only `scriptId` and `rootDir`.
2. Do not run clasp commands that prompt for or persist `projectId`.
3. Do not change the Cloud project in the Apps Script editor.

## Reconfirmation — 2026-09-25

A later attempt to list Chat spaces and members via `chat.googleapis.com` failed with HTTP 403: the Chat API is not enabled on default project `984576077062`, and that project does not appear in the Cloud Console resource picker. Enabling the API on STT-Automation, My First Project, or the org resource does not attach it to this script. Switching Project Settings → Google Cloud Platform project would be irreversible.

The user selected **Keep the default project**. The script therefore:

- Does not call the Google Chat API and does not request Chat OAuth scopes.
- Posts only through incoming webhooks in Script Properties.
- Treats Team column E (Spaces) as membership filled from the signed-in Chat session; menu **Apply Team spaces to reminder matrix** applies that column to the Reminder Matrix.

## Consequences

- `npm run pull` and `npm run push` are the supported sync path.
- Logs stay in the Apps Script executions page (`exceptionLogging` is `STACKDRIVER` in the manifest, which the Apps Script dashboard shows for a default project).
- Automated Chat membership sync is not available without leaving the default project. Column E is maintained manually (or by a browser session scrape) and applied with **Apply Team spaces to reminder matrix**.
- Optional Monday LLM summaries use OpenRouter over `UrlFetchApp` (no Chat API, no standard GCP). See runbook §8.
- A future need for `clasp run-function`, Cloud console logs, or the Chat API requires a new decision, because taking it means abandoning the default project permanently.
