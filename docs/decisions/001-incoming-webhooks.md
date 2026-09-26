# ADR-001: Post to Google Chat with incoming webhooks

## Status

Accepted

## Date

2026-09-26

## Context

Daily progress has to reach a Google Chat space. The Google Chat API can post as the app and manage membership, but it requires a standard Google Cloud project, extra OAuth scopes, and a Cloud project switch in Apps Script. That switch cannot be undone. This template is meant to stay on Apps Script's default Cloud project.

## Options Considered

### Option A: Google Chat API on a standard Cloud project

- Pros: App identity, membership reads, richer message cards.
- Cons: `projectId` in `.clasp.json`, or `clasp run-function` / `clasp setup-logs` / `clasp enable-api`, binds a standard project permanently. Operators must manage a Cloud project they did not ask for.

### Option B: Incoming webhooks

- Pros: One HTTPS POST per space. No Chat API scope. The script stays on the default Apps Script project. Each space owner creates the webhook.
- Cons: The script cannot read space membership. Mentions need a Chat user id typed on the Team sheet. Webhook URLs are bearer secrets.

### Option C: Email only

- Pros: No webhook to store.
- Cons: The team does not see the update in the space where the work is discussed.

## Decision

We choose **incoming webhooks**. `UrlFetchApp` posts plain text to `https://chat.googleapis.com/v1/spaces/.../messages`. The script never calls the Chat API. Operators must not add `projectId` to `.clasp.json`.

Slack incoming-webhook code remains in `src/Code.js` with `SLACK_ENABLED = false`, so a future Slack deployment is a deliberate switch, not an accidental send.

## Consequences

- Membership is whatever the operator types in Team column E. Menu 16 copies that column onto the reminder matrix. It does not query Chat.
- Menu 5 stores only `GOOGLE_CHAT_WEBHOOK_URL`. Every other space uses the Script Property name in Chat Spaces column C.
- Webhook URLs are Script Properties. See ADR-002.
