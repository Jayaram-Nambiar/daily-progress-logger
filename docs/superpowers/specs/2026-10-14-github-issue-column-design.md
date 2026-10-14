# GitHub issue column

Date: 2026-10-14

Status: approved design, pending spec review

## Problem

Each team member logs daily work on a personal sheet: Date, Summary, Hours, Blockers, Tomorrow Plan, Space. The weekday 19:00 Google Chat post sends one summary line per row that has a Summary and a Space. Monday 09:00 posts a weekly roll-up for the previous Monday–Sunday week.

Members need a place to attach the GitHub issues that belong to a row. The same issue shows up as more than one URL. Several issues may be pasted into one cell, separated by commas, spaces, newlines, semicolons, pipes, or similar characters. The sheet should show the issue numbers, each linked to one canonical issue URL. The daily Chat post should include those canonical URLs on the summary line.

Many rows have no GitHub issue. An empty issue cell is a normal record.

## Decision

Add a **GitHub Issues** column after **Space**. Keep parsing and Chat-line formatting in `src/logic.js` so `npm test` covers them. `src/Code.js` writes the linked numbers into the sheet, runs the formatter, and appends issue URLs to the daily Chat line.

The column is optional. A blank cell is left blank. A row with a Summary and a Space and no issue URLs posts exactly as it does today, with no `Issues:` segment.

## Column

Personal tabs become:

`Date | Summary | Hours | Blockers | Tomorrow Plan | Space | GitHub Issues`

Column G is new. Columns A–F stay where they are. **Sync member sheets** writes the header and the header note when column G is missing. The formatter does the same before it reads rows, so the column exists before anyone runs Sync. Existing rows below the header are kept.

Header note, shown to the person filling the sheet:

> Optional. Paste one or more GitHub issue URLs for this row. Separate them with commas, spaces, newlines, or semicolons. Leave the cell blank when the work has no GitHub issue. The sheet replaces recognized URLs with the issue numbers, each linked to the issue.

## What counts as an issue URL

The host is `github.com`, with optional `www`. `http` and `https` are both accepted. A bare `github.com/...` URL with no scheme is accepted. The parser scans the whole cell, so the characters between URLs can be commas, spaces, tabs, newlines, semicolons, pipes, or other separators.

Two shapes count.

**Issue page.** The path contains `/<owner>/<repo>/issues/<number>`. A trailing slash, a `?query`, and a `#fragment` are ignored. Example: `https://github.com/ArcaAI/project-hope/issues/8`.

**Project pane.** Any `github.com` URL whose query string has `issue=<owner>|<repo>|<number>`. The pipe may be written as `|` or as `%7C`. This includes organization and user project links. Example:

`https://github.com/orgs/ArcaAI/projects/10/views/3?pane=issue&itemId=256599110&issue=ArcaAI%7Cproject-hope%7C8`

Both examples are the same issue. When one URL contains an issue-page path and an `issue=` parameter, both are read and the duplicate canonical URL is kept once.

A project link that only has `itemId`, and no `issue=owner|repo|number` parameter, stays as typed. That URL does not contain the repository or the issue number, and this script does not call the GitHub API. A project `issue=` parameter is normalized the same way when GitHub used it for a pull request on the board. A path that contains `/pull/<number>` and no `issue=` parameter is left as typed.

Owner and repo use GitHub’s usual name characters. The issue number is 1 to 10 digits. Leading zeros are dropped, so `08` is issue `8`. Owner and repo are lowercased in the stored link.

A `/pull/<number>` path is not itself an issue URL. A host other than `github.com`, a bare issue number, and an `issue` parameter that is not exactly three pipe-separated parts do not become issues.

## Canonical form and cell display

Each recognized issue becomes:

`https://github.com/<owner>/<repo>/issues/<number>`

The cell displays only the numbers, separated by a comma and a space. Each number is a hyperlink to that canonical URL. The two examples above, pasted together or separately, display as `8`.

The same canonical URL twice is one link. First-seen order, left to right, is kept. Issue 42 in two different repositories displays as `42, 42`, each number linked to its own issue.

A cell that already shows those linked numbers, with the same links in the same order, is not rewritten.

A formula in the column is left unchanged.

## Optional cells and invalid text

| Cell contents | Sheet | Daily Chat line |
|---|---|---|
| Blank | Stays blank | No `Issues:` segment. The rest of the line is unchanged. |
| Text with no recognized issue URL | Left as typed | No `Issues:` segment |
| One or more recognized URLs, plus other text | Rewritten to the linked numbers. The other text is removed from that cell. | `Issues:` plus the canonical URLs |
| Already in canonical linked form | Unchanged | `Issues:` plus those URLs |

A row still needs a non-empty Summary and a Space before it is posted. Issues on a row that does not meet those rules are formatted in the sheet and omitted from Chat.

## When formatting runs

All dates use Asia/Kolkata.

| Run | Rows formatted | Chat |
|---|---|---|
| Hourly trigger | Date equals today | None |
| **Format today’s GitHub issues** menu | Date equals today | None |
| Start of the weekday 19:00 daily post, and **Post today’s updates now** | Date equals today | Daily post, after formatting |
| Start of the Monday 09:00 roll-up, and **Run weekly roll-up now** | Date falls in the previous Monday–Sunday week, using the existing week bounds | Weekly post is unchanged. Issue URLs are not added to the weekly message or the weekly summary prompt. |

Rows with a blank or unparseable date are skipped. The hourly trigger also runs on weekends; it only rewrites today’s issue cells and does not post.

**Apply schedules from sheet** installs the hourly trigger and deletes any previous copy of that same trigger so copies do not stack. Apps Script may start the hourly job late. The format pass at the start of the daily post and the Monday roll-up is the pass those jobs rely on.

The hourly handler is separate from the Schedules sheet clock-time rows. Reminder, daily post, weekly roll-up, and space access keep their current hours.

## Daily Chat line

When the row has recognized issues, append them after blockers on the existing summary line:

`– shipped the parser (2h) • Blockers: staging • Issues: https://github.com/arcaai/project-hope/issues/8, https://github.com/arcaai/project-hope/issues/9`

Hours and blockers stay optional. With neither, the line is:

`– shipped the parser • Issues: https://github.com/arcaai/project-hope/issues/8`

With no recognized issues, the line stays:

`– shipped the parser (2h) • Blockers: staging`

The Chat text uses the canonical URLs. Google Chat linkifies those URLs. The sheet is where the short issue numbers are clickable.

The Chat line is built from the parsed URLs. A failed write of the linked numbers still includes the issues for that row.

## Failures

Each member sheet is processed on its own, and each issue cell is processed on its own. One bad cell is logged with the sheet name and the row number, then skipped. Other cells, other rows, and other members continue. The log does not include the cell text.

## Tests

`test/logic.test.js` covers:

- Both URL shapes, including `%7C` and a literal pipe, `http`, `www`, no scheme, a trailing slash, a query, and a fragment
- Mixed delimiters in one cell
- Duplicate URLs collapsing to one issue
- The same issue number in two repositories
- Leading zeros and owner/repo case
- A blank value, a non-URL value, and a `/pull/` URL producing no issues
- A project link that only has `itemId` producing no issues
- Mixed valid URLs and other text keeping only the valid issues, in first-seen order
- The daily line with issues, without issues, without hours, and without blockers
- A weekly member line builder that does not receive issue URLs (the weekly text stays free of an `Issues:` segment)

## Documentation to update with the implementation

- `AGENTS.md` current product behavior
- `docs/runbooks/spaces-roster-and-daily-posts.md` sections 1, 7, 9, 11, 12, 13, and 16
- `context/workbook.md` and `context/project.md`
- The column list and header note in `src/Code.js`
- `README.md` only where it describes member columns or the daily post contents

Remove sentences that say a personal tab has only the six current columns, or that a daily line cannot carry issue URLs. Describe the Monday roll-up as formatting last week’s issue cells and still posting the weekly summary without those URLs. Leave ADR-001 as it is. This feature uses the spreadsheet and incoming webhooks only.

## Out of scope

- Calling the GitHub API to resolve an `itemId`-only project link
- Adding issue URLs to the Monday Chat post or the OpenRouter prompt
- Formatting issue cells for dates outside today, except the previous-week pass inside the Monday roll-up
- Enabling Slack, changing the Cloud project, or storing webhook URLs or tokens in the repo
