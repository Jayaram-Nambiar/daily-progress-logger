# GitHub Issue Column Implementation Plan

Implemented. Do not re-run the old task list.

The living description is the [README](../../../README.md) and the [runbook](../../runbooks/spaces-roster-and-daily-posts.md). The approved design remains the [spec](../specs/2026-10-14-github-issue-column-design.md).

Two later corrections are part of that behavior:

- Column G is plain text. A display such as `9, 10` must not be stored as a date.
- **Format today’s GitHub issues**, the daily post, and the Monday roll-up install the hourly trigger when it is missing. They do not change the other clock triggers.
