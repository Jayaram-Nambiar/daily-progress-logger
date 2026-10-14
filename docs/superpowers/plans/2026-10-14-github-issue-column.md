# GitHub Issue Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional GitHub Issues column on each member tab, rewrite recognized issue URLs to linked issue numbers, and append the canonical URLs to the daily Google Chat summary line.

**Architecture:** `src/logic.js` parses issue URLs and builds the daily and weekly text lines. `npm test` covers that file through `node:vm`. `src/Code.js` writes rich text into column G, runs the formatter on an hourly trigger and again at the start of the daily post and the Monday roll-up, and reads the parsed URLs when it builds the daily Chat line. The Monday roll-up formats last week's cells and leaves the weekly Chat message unchanged.

**Tech Stack:** Apps Script V8, Google Sheets rich text, existing `Logic` object, Node's built-in test runner (`npm test`).

## Global Constraints

- Timezone is `Asia/Kolkata`.
- Personal tabs stay `Date | Summary | Hours | Blockers | Tomorrow Plan | Space | GitHub Issues`. GitHub Issues is column G.
- A blank GitHub Issues cell is valid. It stays blank. The daily line has no `Issues:` segment.
- A cell with no recognized issue URL stays as typed.
- A cell with one or more recognized URLs is rewritten to the issue numbers, separated by `, `, each number linked to `https://github.com/<owner>/<repo>/issues/<number>`. Owner and repo are lowercased. Leading zeros are removed. The number `0` is not an issue.
- Recognized shapes are an issue-page path `/<owner>/<repo>/issues/<number>` on `github.com` (optional `http` or `https`, optional `www`, optional missing scheme, trailing slash, query, and fragment ignored) and any `github.com` URL with query `issue=<owner>|<repo>|<number>` (`|` or `%7C`, either letter case).
- A project link with only `itemId` stays as typed. A `/pull/<number>` path with no `issue=` parameter stays as typed. An `issue=` value that is not exactly three pipe-separated parts is ignored.
- The same canonical URL twice is one link. First-seen order is existing rich-text link order, then new URLs found in the cell text. The same issue number in two repositories stays as two links.
- A formula in the column is left unchanged. An already-canonical cell is not rewritten.
- One bad cell logs the sheet name and row number only, then the job continues. One bad member sheet does not stop the others.
- The daily Chat line appends ` • Issues: ` plus the canonical URLs after blockers, only when that row has recognized issues. Hours and blockers stay optional. A row still posts only when Summary is non-empty and Space is set.
- The hourly trigger formats rows whose date is today. The daily post does that again, then posts. The Monday roll-up formats the previous Monday–Sunday week, then posts the weekly summary with no issue URLs in the message or the OpenRouter prompt.
- **Apply schedules from sheet** installs `formatGithubIssues_trigger` every hour and deletes any previous copy of that handler.
- Do not call the GitHub API or the Google Chat API. Do not add `projectId`, OAuth scopes, webhook URLs, or tokens.
- Do not `clasp push`. Do not `git push`. Run a commit step only when the user has asked for a commit.
- `npm test` runs all of `test/logic.test.js`. The file uses top-level asserts, so a missing function fails the whole file.

## File structure

- `src/logic.js` — `planGithubIssueCell`, `formatDailyUpdateLine`, `formatWeeklyEntryLine`, `datesInRange`. No Sheets calls.
- `test/logic.test.js` — asserts for those functions. Append only. Do not rewrite existing asserts.
- `src/Code.js` — column header, rich-text writer, hourly trigger, menu item, daily-post line, weekly format pass.
- `docs/runbooks/spaces-roster-and-daily-posts.md`, `AGENTS.md`, `README.md`, `context/workbook.md`, `context/project.md` — operator and agent docs for the new column.

---

### Task 1: Parse issue-page URLs

**Files:**
- Modify: `src/logic.js` (insert the methods below immediately before `collectSafe`)
- Test: `test/logic.test.js` (append)

**Interfaces:**
- Consumes: nothing
- Produces: `Logic.planGithubIssueCell(text, linkUrls)` returns `{ issues: [{ number: string, url: string }], display: string, rewrite: boolean }`. `issues` is empty and `rewrite` is false when the cell has no recognized issue. `display` is the numbers joined with `, `.

- [ ] **Step 1: Write the failing test**

Append this to `test/logic.test.js`:

```javascript
const hope8 = 'https://github.com/arcaai/project-hope/issues/8';
const hope9 = 'https://github.com/arcaai/project-hope/issues/9';

const pageIssue = Logic.planGithubIssueCell(
  'https://github.com/ArcaAI/project-hope/issues/08',
  []
);
assert.strictEqual(pageIssue.rewrite, true);
assert.strictEqual(pageIssue.display, '8');
assert.deepStrictEqual(pageIssue.issues, [{ number: '8', url: hope8 }]);

const decorated = Logic.planGithubIssueCell(
  'http://www.github.com/ArcaAI/project-hope/issues/8/?utm=1#issuecomment-5',
  []
);
assert.deepStrictEqual(decorated.issues, [{ number: '8', url: hope8 }]);

const bareHost = Logic.planGithubIssueCell('github.com/ArcaAI/project-hope/issues/9.', []);
assert.deepStrictEqual(bareHost.issues, [{ number: '9', url: hope9 }]);

const notGithub = Logic.planGithubIssueCell('https://notgithub.com/ArcaAI/project-hope/issues/8', []);
assert.deepStrictEqual(notGithub.issues, []);
assert.strictEqual(notGithub.rewrite, false);

const blankIssues = Logic.planGithubIssueCell('', []);
assert.deepStrictEqual(blankIssues.issues, []);
assert.strictEqual(blankIssues.rewrite, false);
assert.strictEqual(blankIssues.display, '');

const typedNote = Logic.planGithubIssueCell('no issue for this row', []);
assert.strictEqual(typedNote.rewrite, false);
assert.deepStrictEqual(typedNote.issues, []);

const alreadyLinked = Logic.planGithubIssueCell('8, 9', [hope8, hope9]);
assert.strictEqual(alreadyLinked.rewrite, false);
assert.strictEqual(alreadyLinked.display, '8, 9');
assert.deepStrictEqual(alreadyLinked.issues, [
  { number: '8', url: hope8 },
  { number: '9', url: hope9 }
]);

const rawPair = Logic.planGithubIssueCell(
  'https://github.com/ArcaAI/project-hope/issues/8, https://github.com/ArcaAI/project-hope/issues/8',
  []
);
assert.deepStrictEqual(rawPair.issues, [{ number: '8', url: hope8 }]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with `TypeError: Logic.planGithubIssueCell is not a function`

- [ ] **Step 3: Write minimal implementation**

Insert this object entry immediately before `collectSafe` in `src/logic.js`. Keep the comma after `cellText`.

```javascript
  githubIssueNumber_: function (raw) {
    var text = String(raw || '').trim();
    if (!/^\d{1,10}$/.test(text)) return '';
    var number = String(parseInt(text, 10));
    if (!number || number === '0') return '';
    return number;
  },

  githubOwner_: function (raw) {
    var text = String(raw || '');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(text)) return '';
    return text.toLowerCase();
  },

  githubRepo_: function (raw) {
    var text = String(raw || '');
    if (text === '.' || text === '..') return '';
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(text)) return '';
    return text.toLowerCase();
  },

  canonicalGithubIssue_: function (owner, repo, number) {
    var safeOwner = Logic.githubOwner_(owner);
    var safeRepo = Logic.githubRepo_(repo);
    var safeNumber = Logic.githubIssueNumber_(number);
    if (!safeOwner || !safeRepo || !safeNumber) return null;
    return {
      number: safeNumber,
      url: 'https://github.com/' + safeOwner + '/' + safeRepo + '/issues/' + safeNumber
    };
  },

  githubIssuesFromText_: function (text) {
    var source = String(text || '');
    var host = '(?:https?:\\/\\/(?:www\\.)?|(?:^|[^A-Za-z0-9.])(?:www\\.)?)github\\.com\\/';
    var pathRe = new RegExp(
      host + '([^\\/\\s?#]+)\\/([^\\/\\s?#]+)\\/issues\\/(\\d{1,10})(?![A-Za-z0-9])',
      'gi'
    );
    var found = [];
    var match;
    while ((match = pathRe.exec(source))) {
      var issue = Logic.canonicalGithubIssue_(match[1], match[2], match[3]);
      if (issue) found.push({ index: match.index, issue: issue });
    }
    found.sort(function (a, b) { return a.index - b.index; });
    var seen = {};
    var issues = [];
    found.forEach(function (item) {
      if (seen[item.issue.url]) return;
      seen[item.issue.url] = true;
      issues.push(item.issue);
    });
    return issues;
  },

  planGithubIssueCell: function (text, linkUrls) {
    var fromLinks = [];
    (linkUrls || []).forEach(function (url) {
      Logic.githubIssuesFromText_(url).forEach(function (issue) {
        fromLinks.push(issue);
      });
    });
    var fromText = Logic.githubIssuesFromText_(text);
    var seen = {};
    var issues = [];
    function add(list) {
      list.forEach(function (issue) {
        if (!issue || seen[issue.url]) return;
        seen[issue.url] = true;
        issues.push(issue);
      });
    }
    add(fromLinks);
    add(fromText);
    var display = issues.map(function (issue) { return issue.number; }).join(', ');
    var currentLinks = [];
    (linkUrls || []).forEach(function (url) {
      Logic.githubIssuesFromText_(url).forEach(function (issue) {
        if (currentLinks.indexOf(issue.url) === -1) currentLinks.push(issue.url);
      });
    });
    var sameLinks = currentLinks.length === issues.length && currentLinks.every(function (url, index) {
      return url === issues[index].url;
    });
    var rewrite = issues.length > 0 && !(String(text || '') === display && sameLinks);
    return { issues: issues, display: display, rewrite: rewrite };
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS, exit code 0

- [ ] **Step 5: Commit**

Run this only when the user has asked for a commit:

```powershell
git add src/logic.js test/logic.test.js
git commit -m "parse GitHub issue-page URLs into canonical links"
```

---

### Task 2: Parse project-pane URLs and mixed cells

**Files:**
- Modify: `src/logic.js` (`githubIssuesFromText_` only)
- Test: `test/logic.test.js` (append)

**Interfaces:**
- Consumes: `Logic.planGithubIssueCell(text, linkUrls)` from Task 1
- Produces: the same return shape. Project `issue=` values and issue-page paths share one deduped list.

- [ ] **Step 1: Write the failing test**

Append this to `test/logic.test.js`:

```javascript
const pane = 'https://github.com/orgs/ArcaAI/projects/10/views/3?pane=issue&itemId=256599110&issue=ArcaAI%7Cproject-hope%7C8';
const paneIssue = Logic.planGithubIssueCell(pane, []);
assert.deepStrictEqual(paneIssue.issues, [{ number: '8', url: hope8 }]);
assert.strictEqual(paneIssue.display, '8');

const literalPipe = Logic.planGithubIssueCell(
  'https://github.com/users/octocat/projects/1?issue=ArcaAI|project-hope|9',
  []
);
assert.deepStrictEqual(literalPipe.issues, [{ number: '9', url: hope9 }]);

const lowerEncoded = Logic.planGithubIssueCell(
  'https://github.com/orgs/ArcaAI/projects/10?issue=ArcaAI%7cproject-hope%7c8',
  []
);
assert.deepStrictEqual(lowerEncoded.issues, [{ number: '8', url: hope8 }]);

const pathAndParam = Logic.planGithubIssueCell(
  'https://github.com/ArcaAI/project-hope/issues/8?issue=ArcaAI%7Cproject-hope%7C8',
  []
);
assert.deepStrictEqual(pathAndParam.issues, [{ number: '8', url: hope8 }]);

const bothShapes = Logic.planGithubIssueCell(
  pane + '\n' + 'https://github.com/ArcaAI/project-hope/issues/8',
  []
);
assert.deepStrictEqual(bothShapes.issues, [{ number: '8', url: hope8 }]);

const itemOnly = Logic.planGithubIssueCell(
  'https://github.com/orgs/airbytehq/projects/37/views/1?itemId=26937554&pane=issue',
  []
);
assert.deepStrictEqual(itemOnly.issues, []);
assert.strictEqual(itemOnly.rewrite, false);

const pullPath = Logic.planGithubIssueCell('https://github.com/ArcaAI/project-hope/pull/8', []);
assert.deepStrictEqual(pullPath.issues, []);

const mixedDelimiters = Logic.planGithubIssueCell(
  'https://github.com/ArcaAI/project-hope/issues/8; https://github.com/Other/widget/issues/8\nhttps://github.com/ArcaAI/project-hope/issues/9 | https://github.com/ArcaAI/project-hope/issues/9',
  []
);
assert.deepStrictEqual(mixedDelimiters.issues, [
  { number: '8', url: hope8 },
  { number: '8', url: 'https://github.com/other/widget/issues/8' },
  { number: '9', url: hope9 }
]);
assert.strictEqual(mixedDelimiters.display, '8, 8, 9');

const mixedNote = Logic.planGithubIssueCell('see ' + pane + ' thanks', []);
assert.deepStrictEqual(mixedNote.issues, [{ number: '8', url: hope8 }]);
assert.strictEqual(mixedNote.rewrite, true);
assert.strictEqual(mixedNote.display, '8');

const appended = Logic.planGithubIssueCell(
  '8, https://github.com/ArcaAI/project-hope/issues/9',
  [hope8]
);
assert.strictEqual(appended.display, '8, 9');
assert.strictEqual(appended.rewrite, true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because `paneIssue.issues` is empty (`issue=` is not parsed yet). The failure is an assertion error, not a syntax error.

- [ ] **Step 3: Replace `githubIssuesFromText_`**

Replace the Task 1 function with this complete function. Leave `planGithubIssueCell` unchanged.

```javascript
  githubIssuesFromText_: function (text) {
    var source = String(text || '');
    var host = '(?:https?:\\/\\/(?:www\\.)?|(?:^|[^A-Za-z0-9.])(?:www\\.)?)github\\.com\\/';
    var found = [];
    var match;
    var pathRe = new RegExp(
      host + '([^\\/\\s?#]+)\\/([^\\/\\s?#]+)\\/issues\\/(\\d{1,10})(?![A-Za-z0-9])',
      'gi'
    );
    while ((match = pathRe.exec(source))) {
      var pathIssue = Logic.canonicalGithubIssue_(match[1], match[2], match[3]);
      if (pathIssue) found.push({ index: match.index, issue: pathIssue });
    }
    var paramRe = new RegExp(
      host + '[^\\s<>"\']*?[?&]issue=([A-Za-z0-9._-]+(?:%7C|\\|)[A-Za-z0-9._-]+(?:%7C|\\|)\\d{1,10})',
      'gi'
    );
    while ((match = paramRe.exec(source))) {
      var decoded = match[1];
      try {
        decoded = decodeURIComponent(match[1]);
      } catch (e) {
        decoded = match[1];
      }
      var parts = decoded.split('|');
      if (parts.length !== 3) continue;
      var paramIssue = Logic.canonicalGithubIssue_(parts[0], parts[1], parts[2]);
      if (paramIssue) found.push({ index: match.index, issue: paramIssue });
    }
    found.sort(function (a, b) { return a.index - b.index; });
    var seen = {};
    var issues = [];
    found.forEach(function (item) {
      if (seen[item.issue.url]) return;
      seen[item.issue.url] = true;
      issues.push(item.issue);
    });
    return issues;
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS, exit code 0

- [ ] **Step 5: Commit**

Run this only when the user has asked for a commit:

```powershell
git add src/logic.js test/logic.test.js
git commit -m "normalize GitHub project-pane issue links"
```

---

### Task 3: Daily line, weekly line, and week dates

**Files:**
- Modify: `src/logic.js` (insert immediately after `planGithubIssueCell`)
- Test: `test/logic.test.js` (append)

**Interfaces:**
- Consumes: nothing from the parser beyond the URL strings the caller already has
- Produces:
  - `Logic.formatDailyUpdateLine(summary, hoursText, blockers, issueUrls)` returns a string. `hoursText` is `''` or a number string such as `'2'` or `'1.5'`. `issueUrls` is an array of canonical URL strings. Empty hours, blockers, and issue URLs are omitted.
  - `Logic.formatWeeklyEntryLine(prettyDate, summary, hoursText, blockers)` returns a string with no issue parameter and no `Issues:` text.
  - `Logic.datesInRange(startYmd, endYmd)` returns inclusive `yyyy-MM-dd` strings, or `[]` when the start is after the end.

- [ ] **Step 1: Write the failing test**

Append this to `test/logic.test.js`:

```javascript
assert.strictEqual(
  Logic.formatDailyUpdateLine('shipped the parser', '2', 'staging', [hope8, hope9]),
  '– shipped the parser (2h) • Blockers: staging • Issues: ' + hope8 + ', ' + hope9
);
assert.strictEqual(
  Logic.formatDailyUpdateLine('shipped the parser', '2', 'staging', []),
  '– shipped the parser (2h) • Blockers: staging'
);
assert.strictEqual(
  Logic.formatDailyUpdateLine('shipped the parser', '', '', [hope8]),
  '– shipped the parser • Issues: ' + hope8
);
assert.strictEqual(
  Logic.formatWeeklyEntryLine('Mon, Sep 14', 'shipped login', '2', 'staging'),
  '• Mon, Sep 14: shipped login (2h) — Blockers: staging'
);
assert.strictEqual(Logic.formatWeeklyEntryLine('Mon, Sep 14', 'shipped login', '', '').indexOf('Issues:'), -1);
assert.deepStrictEqual(Logic.datesInRange('2026-10-05', '2026-10-11'), [
  '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'
]);
assert.deepStrictEqual(Logic.datesInRange('2026-10-11', '2026-10-05'), []);
```

The weekly expected string uses an em dash (`—`, U+2014) before `Blockers`, matching the current weekly line in `weeklyCollatePreviousWeek_`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL with `TypeError: Logic.formatDailyUpdateLine is not a function`

- [ ] **Step 3: Write minimal implementation**

Insert these methods immediately after `planGithubIssueCell`:

```javascript
  formatDailyUpdateLine: function (summary, hoursText, blockers, issueUrls) {
    var line = '– ' + String(summary || '');
    var hours = String(hoursText || '').trim();
    if (hours) line += ' (' + hours + 'h)';
    var blocks = String(blockers || '').trim();
    if (blocks) line += ' • Blockers: ' + blocks;
    var urls = [];
    (issueUrls || []).forEach(function (url) {
      var cleaned = String(url || '').trim();
      if (cleaned) urls.push(cleaned);
    });
    if (urls.length) line += ' • Issues: ' + urls.join(', ');
    return line;
  },

  formatWeeklyEntryLine: function (prettyDate, summary, hoursText, blockers) {
    var parts = ['• ' + String(prettyDate || '') + ': ' + String(summary || '')];
    var hours = String(hoursText || '').trim();
    if (hours) parts.push('(' + hours + 'h)');
    var blocks = String(blockers || '').trim();
    if (blocks) parts.push('— Blockers: ' + blocks);
    return parts.join(' ');
  },

  datesInRange: function (startYmd, endYmd) {
    var start = String(startYmd || '');
    var end = String(endYmd || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return [];
    var out = [];
    var cursor = start;
    while (cursor <= end) {
      out.push(cursor);
      cursor = Logic.shiftYmd_(cursor, 1);
    }
    return out;
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS, exit code 0

- [ ] **Step 5: Commit**

Run this only when the user has asked for a commit:

```powershell
git add src/logic.js test/logic.test.js
git commit -m "format daily Chat lines with optional GitHub issue URLs"
```

---

### Task 4: Sheet column, triggers, and posts

**Files:**
- Modify: `src/Code.js`
- Test: `npm test` still passes. `node --check src/Code.js` and `node --check src/logic.js` pass. There is no Sheets runtime in this repo, so the rich-text writer is checked by syntax and by calling the Task 1–3 functions.

**Interfaces:**
- Consumes: `Logic.planGithubIssueCell`, `Logic.formatDailyUpdateLine`, `Logic.formatWeeklyEntryLine`, `Logic.datesInRange`
- Produces: menu `formatTodaysGithubIssues`, hourly handler `formatGithubIssues_trigger`, and a format pass at the start of `postDailyUpdatesToChat_` and `weeklyCollatePreviousWeek_`

- [ ] **Step 1: Add the column constant and header note**

In `src/Code.js`, change the file comment line for per-member tabs to:

```javascript
 * Per-member tabs: Date | Summary | Hours | Blockers | Tomorrow Plan | Space | GitHub Issues
```

Change `MEMBER_HEADERS` to:

```javascript
const MEMBER_HEADERS = ['Date', 'Summary', 'Hours', 'Blockers', 'Tomorrow Plan', 'Space', 'GitHub Issues'];
```

Add this entry to `HEADER_NOTES` after the `Space` entry:

```javascript
  'GitHub Issues':
    'Optional. Paste one or more GitHub issue URLs for this row. ' +
    'Separate them with commas, spaces, newlines, or semicolons. ' +
    'Leave the cell blank when the work has no GitHub issue. ' +
    'The sheet replaces recognized URLs with the issue numbers, each linked to the issue.'
```

`syncOneMember_` already writes every `MEMBER_HEADERS` cell and its note. Leave the `onEdit` header comparison as it is. Once column G has this header, that comparison includes GitHub Issues. After `sh.getRange('B2:B').setWrap(true);`, add:

```javascript
  const issueCol = MEMBER_HEADERS.indexOf('GitHub Issues') + 1;
  sh.getRange(2, issueCol, Math.max(sh.getMaxRows() - 1, 1), 1).setWrap(true);
```

- [ ] **Step 2: Add the formatter**

Insert these functions immediately after `syncOneMember_`:

```javascript
function ensureMemberIssueColumn_(sh) {
  const header = 'GitHub Issues';
  const col = MEMBER_HEADERS.indexOf(header) + 1;
  const current = String(sh.getRange(1, col).getValue() || '').trim();
  if (current !== header) sh.getRange(1, col).setValue(header).setFontWeight('bold');
  sh.getRange(1, col).setNote(HEADER_NOTES[header] || '');
  sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setWrap(true);
}

function writeGithubIssueCell_(range, plan) {
  const builder = SpreadsheetApp.newRichTextValue().setText(plan.display);
  let cursor = 0;
  plan.issues.forEach((issue, index) => {
    if (index > 0) cursor += 2;
    const start = cursor;
    const end = start + String(issue.number).length;
    builder.setLinkUrl(start, end, issue.url);
    cursor = end;
  });
  range.setRichTextValue(builder.build());
}

function formatGithubIssuesOnSheet_(sh, ymdSet) {
  if (!sh) return;
  try {
    ensureMemberIssueColumn_(sh);
  } catch (e) {
    console.error(sh.getName() + ' GitHub issues header skipped: ' + errorMessage_(e));
    return;
  }
  if (sh.getLastRow() < 2) return;
  const col = MEMBER_HEADERS.indexOf('GitHub Issues') + 1;
  const height = sh.getLastRow() - 1;
  let dates;
  let rich;
  let formulas;
  try {
    dates = sh.getRange(2, 1, height, 1).getValues();
    rich = sh.getRange(2, col, height, 1).getRichTextValues();
    formulas = sh.getRange(2, col, height, 1).getFormulas();
  } catch (e) {
    console.error(sh.getName() + ' GitHub issues skipped: ' + errorMessage_(e));
    return;
  }
  for (let i = 0; i < dates.length; i++) {
    const rowNumber = i + 2;
    if (formulas[i][0]) continue;
    const ymd = normalizeDateOnly_(dates[i][0]);
    if (!ymd || !ymdSet[ymd]) continue;
    try {
      const cell = rich[i][0];
      const links = [];
      cell.getRuns().forEach(run => {
        const url = run.getLinkUrl();
        if (url) links.push(url);
      });
      const plan = Logic.planGithubIssueCell(cell.getText(), links);
      if (!plan.rewrite) continue;
      writeGithubIssueCell_(sh.getRange(rowNumber, col), plan);
    } catch (e) {
      console.error(sh.getName() + ' row ' + rowNumber + ' GitHub issues skipped: ' + errorMessage_(e));
    }
  }
}

function formatGithubIssuesForYmds_(ymds) {
  const ss = SpreadsheetApp.getActive();
  const team = ss.getSheetByName(SHEETS.TEAM);
  if (!team) return { members: 0, missingTeam: true };
  const ymdSet = {};
  (ymds || []).forEach(ymd => { if (ymd) ymdSet[ymd] = true; });
  const members = readTeamRows_(team);
  members.forEach(member => {
    try {
      formatGithubIssuesOnSheet_(ss.getSheetByName(sanitizeSheetName_(member.name)), ymdSet);
    } catch (e) {
      console.error('GitHub issues skipped ' + member.name + ': ' + errorMessage_(e));
    }
  });
  return { members: members.length, missingTeam: false };
}

function formatGithubIssuesForToday_() {
  return formatGithubIssuesForYmds_([Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')]);
}

function formatTodaysGithubIssues() {
  const result = formatGithubIssuesForToday_();
  const ui = SpreadsheetApp.getUi();
  if (result.missingTeam) {
    ui.alert('Team sheet is missing.');
    return;
  }
  ui.alert('Formatted today\'s GitHub issue cells on ' + result.members + ' member sheet(s).');
}

function formatGithubIssues_trigger() {
  formatGithubIssuesForToday_();
}

function readMemberIssuePlans_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = sheet.getLastRow() - 1;
  const col = MEMBER_HEADERS.indexOf('GitHub Issues') + 1;
  try {
    return sheet.getRange(2, col, rows, 1).getRichTextValues().map(row => {
      const cell = row[0];
      const links = [];
      cell.getRuns().forEach(run => {
        const url = run.getLinkUrl();
        if (url) links.push(url);
      });
      return Logic.planGithubIssueCell(cell.getText(), links);
    });
  } catch (e) {
    console.error(sheet.getName() + ' GitHub issue read skipped: ' + errorMessage_(e));
    return [];
  }
}
```

`setLinkUrl(start, end, url)` uses an exclusive end offset. The two characters between numbers are the comma and the space already present in `plan.display`.

A failed write leaves the original cell text. The daily post still parses that text in `readMemberIssuePlans_`, so the Chat line can include the URLs.

- [ ] **Step 3: Install the hourly trigger with the other triggers**

In `installSchedulesFromSheet_`, change the handler list to:

```javascript
  const handlers = Object.values(SCHEDULE_HANDLERS).concat([
    'postTodaysSummary_trigger',
    'formatGithubIssues_trigger'
  ]);
```

After the `readSchedules_(ss).forEach(...)` loop, and still inside `installSchedulesFromSheet_`, add:

```javascript
  ScriptApp.newTrigger('formatGithubIssues_trigger').timeBased().everyHours(1).create();
```

The delete loop above already removes an older `formatGithubIssues_trigger`, so Apply does not stack copies. The Schedules sheet rows stay clock-time jobs. This hourly trigger is not one of those rows.

- [ ] **Step 4: Add the menu item**

In `onOpen`, immediately after `.addItem('Post today’s updates now', 'postDailyUpdatesToChat')`, add:

```javascript
    .addItem('Format today’s GitHub issues', 'formatTodaysGithubIssues')
```

- [ ] **Step 5: Format today, then add issue URLs to the daily line**

In `postDailyUpdatesToChat_`, immediately after `const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');`, add:

```javascript
  try {
    formatGithubIssuesForYmds_([today]);
  } catch (e) {
    console.error('GitHub issue format before daily post failed: ' + errorMessage_(e));
  }
```

Inside the member `try`, replace the `readMemberBody_` / `collectSafe` pair with:

```javascript
      const rows = readMemberBody_(sh);
      const issuePlans = readMemberIssuePlans_(sh);
      if (!rows.length) return;
      const linesBySpace = {};
      const parsed = Logic.collectSafe(rows, (row, index) => {
        const item = parsedMemberRow_(row);
        if (!item) return null;
        const plan = issuePlans[index];
        item.issueUrls = plan && plan.issues ? plan.issues.map(issue => issue.url) : [];
        return item;
      });
```

Replace the summary-line construction:

```javascript
        let line = '– ' + summary;
        if (item.hours) line += ` (${round1_(item.hours)}h)`;
        if (blockers) line += ` • Blockers: ${blockers}`;
        linesBySpace[item.space].push(line);
```

with:

```javascript
        const hoursText = item.hours ? String(round1_(item.hours)) : '';
        const line = Logic.formatDailyUpdateLine(summary, hoursText, blockers, item.issueUrls);
        linesBySpace[item.space].push(line);
```

Leave the keep test as `if (item.date !== today || !item.summary || !item.space) return;`. An empty issue list does not drop the row.

- [ ] **Step 6: Format the previous week, and keep issue URLs out of the weekly line**

In `weeklyCollatePreviousWeek_`, immediately after `const { weekStartYMD, weekEndYMD } = getPreviousWeekRangeIST_();`, add:

```javascript
  try {
    formatGithubIssuesForYmds_(Logic.datesInRange(weekStartYMD, weekEndYMD));
  } catch (e) {
    console.error('GitHub issue format before weekly roll-up failed: ' + errorMessage_(e));
  }
```

Replace the weekly parts array:

```javascript
      const parts = [`• ${prettyDate}: ${item.summary}`];
      if (item.hours) parts.push(`(${round1_(item.hours)}h)`);
      if (item.blockers) parts.push(`— Blockers: ${item.blockers}`);
      if (!buckets[item.space]) buckets[item.space] = [];
      buckets[item.space].push({ ymd: rowYMD, line: parts.join(' ') });
```

with:

```javascript
      const hoursText = item.hours ? String(round1_(item.hours)) : '';
      const line = Logic.formatWeeklyEntryLine(prettyDate, item.summary, hoursText, item.blockers);
      if (!buckets[item.space]) buckets[item.space] = [];
      buckets[item.space].push({ ymd: rowYMD, line: line });
```

Do not read `issueUrls` in this function. Do not change `buildWeeklySummaryUserPrompt` or `WEEKLY_SUMMARY_SYSTEM`.

- [ ] **Step 7: Verify**

Run:

```powershell
npm test
node --check src/logic.js
node --check src/Code.js
```

Expected: `npm test` PASS, and both `node --check` commands print nothing and exit 0.

- [ ] **Step 8: Commit**

Run this only when the user has asked for a commit:

```powershell
git add src/Code.js src/logic.js test/logic.test.js
git commit -m "format GitHub issue cells before the daily post and weekly roll-up"
```

---

### Task 5: Document the column and the jobs

**Files:**
- Modify: `docs/runbooks/spaces-roster-and-daily-posts.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `context/workbook.md`
- Modify: `context/project.md`

**Interfaces:**
- Consumes: the menu name **Format today’s GitHub issues**, the handler `formatGithubIssues_trigger`, and the column header `GitHub Issues`
- Produces: operator instructions a new teammate can follow without reading the script

- [ ] **Step 1: Update the runbook overview, schedules, and day-to-day steps**

In §1, change the opening sentence to:

```markdown
Each team member has a personal tab in the spreadsheet. They log a daily row (date, summary, hours, blockers, tomorrow’s plan, and an optional GitHub issue cell) and pick a **Space** from a dropdown.
```

Add this row to the §1 schedule table, after the weekday 19:00 row:

```markdown
| Every hour | Today’s **GitHub Issues** cells are rewritten to linked issue numbers. This does not post to Chat. The 19:00 post and the Monday roll-up format again before they read the sheet. |
```

In §7.2, add this bullet under the install table:

```markdown
**Apply schedules from sheet** also installs `formatGithubIssues_trigger` to run every hour. That job is not a row on the Schedules sheet. Apply deletes the previous copy of that same trigger before it creates a new one.
```

In §7.3, add:

```markdown
- **Format today’s GitHub issues**
```

In §9, replace steps 6–9 with:

```markdown
6. Hours, Blockers, Tomorrow Plan, and GitHub Issues are optional.
7. To attach GitHub issues, paste one or more issue URLs into **GitHub Issues**. Commas, spaces, newlines, and semicolons all work. Leave the cell blank when the work has no GitHub issue.
8. Recognized URLs become the issue numbers, each linked to the issue. A project-board link counts when it contains `issue=owner|repo|number`. A link that only has `itemId` is left as pasted.
9. Set Space from the dropdown.
10. Use the exact Chat space name.
11. Leave the row saved before 19:00.
```

Add this paragraph after the keep-test bullets in §9:

```markdown
A blank **GitHub Issues** cell still posts. When the cell has recognized issue URLs, the daily Chat line adds `Issues:` and those full URLs after blockers. The Monday roll-up formats last week’s issue cells and does not put those URLs in the Monday Chat message.
```

- [ ] **Step 2: Document the menu item and the sheet contract**

Insert this section after `### 11.6 Post today’s updates now` and before `### 11.7 Send reminders now`:

```markdown
### 11.6a Format today’s GitHub issues

Function: `formatTodaysGithubIssues`.

This item rewrites today’s **GitHub Issues** cells on every member tab.
It does not post to Chat.

1. Open the member tab.
2. Paste GitHub issue URLs into **GitHub Issues**, or leave the cell blank.
3. Click **Format today’s GitHub issues**.
4. Read the alert. It counts member sheets, not issue links.

Recognized cells show the issue numbers, separated by commas, and each number is a link.
A blank cell stays blank.
Text that is not a GitHub issue URL stays as typed.
The same rewrite runs every hour, again at the start of **Post today’s updates now**, and for the previous Monday–Sunday week at the start of **Run weekly roll-up now**.

An issue page looks like `https://github.com/ArcaAI/project-hope/issues/8`.
A project-board link also counts when its query contains `issue=ArcaAI|project-hope|8` or the `%7C` encoding of those pipes.
Both become `https://github.com/arcaai/project-hope/issues/8`.
A project link that only contains `itemId` stays as pasted, because it does not include the repository or the issue number.
```

In §12, add this row after the Space row:

```markdown
| G | GitHub Issues | Optional. Paste GitHub issue URLs. The formatter stores linked issue numbers. Blank is a normal row. |
```

Replace `Do not insert Space between columns A and E.` with:

```markdown
Do not insert a column before Space or before GitHub Issues. Space stays column F. GitHub Issues stays column G.
`syncOneMember_` reads columns by position.
```

In §13, after the three daily keep rules, add:

```markdown
GitHub issues are optional. They do not decide whether the row posts.
When the cell has recognized issues, the summary line gains ` • Issues: ` and the canonical `https://github.com/<owner>/<repo>/issues/<number>` URLs after blockers.
A blank issue cell leaves that line unchanged.
```

In §13 weekly roll-up, after the date sentence, add:

```markdown
Before it collates, the roll-up formats **GitHub Issues** for every row dated in that week.
Those URLs are not added to the weekly Chat message or the OpenRouter prompt.
```

In §14 step 1, replace the first sentence with:

```markdown
1. Format last week’s **GitHub Issues** cells, then collate the previous week per member per space. Member text uses a readable date and does not include issue URLs. The model input uses an ISO date and also does not include issue URLs.
```

In §16, replace the row that says the job reads columns A through F with:

```markdown
| One bad cell stops a member, or stops the daily or weekly Chat post | A formula error such as `#REF!` made the whole sheet read throw | The job reads columns A through G. A bad data cell skips that row. A bad GitHub Issues cell skips that cell and logs the sheet name and row number. Other rows, other members, the roll-up, and the other Chat posts continue |
```

Add this row after it:

```markdown
| GitHub Issues still shows a long URL | The URL is not a recognized issue link, the date is not in the format pass, or Apply schedules has not installed the hourly trigger | Use an issue-page URL or a project URL that contains `issue=owner|repo|number`. Run **Format today’s GitHub issues** for today. Run **Apply schedules from sheet** once so the hourly trigger exists. Monday’s roll-up formats the previous week. |
```

Replace `Space is column F` in the “Everyone posted into PRJ_VOX” row with `Space is column F. GitHub Issues is column G.`

- [ ] **Step 3: Update the agent handoff, README, and workbook memory**

In `AGENTS.md`, change the `src/logic.js` layout row so it includes GitHub issue parsing and the daily Chat line. Change the current-behavior date to `2026-10-14`. Add this bullet after the personal-tab bullet:

```markdown
- Each personal tab has an optional **GitHub Issues** column (column G). Members paste GitHub issue URLs. An hourly trigger, the daily post, and the Monday roll-up rewrite recognized URLs for the dates those jobs cover: today for the hourly job and the daily post, and the previous Monday–Sunday week for the roll-up. The cell shows comma-separated issue numbers linked to `https://github.com/owner/repo/issues/N`. A blank cell stays blank and the row still posts. The daily Chat summary line appends `Issues:` plus the canonical URLs when the cell has recognized issues. The Monday Chat message and the weekly prompt do not include those URLs. **Apply schedules from sheet** installs `formatGithubIssues_trigger` every hour. Menu **Format today’s GitHub issues** runs the today-only pass without posting.
```

In `README.md`, after the sentence that lists the default reminder, daily post, and weekly roll-up, add:

```markdown
**Apply schedules from sheet** also installs an hourly GitHub issue formatter. It rewrites today’s GitHub Issues cells and does not post to Chat.
```

At the top of `context/workbook.md`, add:

```markdown
## 2026-10-14 — Optional GitHub Issues column

Personal tabs use column G, **GitHub Issues**. The cell is optional. Recognized `github.com` issue-page URLs and project URLs with `issue=owner|repo|number` become linked issue numbers. `formatGithubIssues_trigger` runs every hour for today’s rows. The daily post formats today again, then appends the canonical URLs on the summary line. The Monday roll-up formats the previous Monday–Sunday week and leaves those URLs out of the weekly Chat message and the OpenRouter prompt. **Format today’s GitHub issues** runs the today-only pass from the menu.
```

In the “One tab per member” table, add:

```markdown
| G | GitHub Issues | Optional. Blank stays blank and the row can still post. The formatter writes linked issue numbers for recognized GitHub issue URLs. |
```

Change the sentence that begins `Row 1 is frozen` so it also says column G is wrapped.

In the Schedules section, after the Space access sentence, add:

```markdown
**Apply schedules from sheet** also installs `formatGithubIssues_trigger` every hour. That trigger is not a Schedules row. It formats today’s GitHub Issues cells only.
```

In `context/project.md`, change the current-stage date to `2026-10-14` and add the same column, hourly trigger, daily Chat line, and weekly format-only behavior in one sentence. In the layout bullet for `src/logic.js`, mention GitHub issue parsing and the daily line helper.

Do not edit `docs/decisions/0001-keep-default-gcp-project.md`.

- [ ] **Step 4: Verify the docs and the tests**

Run:

```powershell
npm test
node --check src/logic.js
node --check src/Code.js
```

Expected: PASS and both checks exit 0.

Search the runbook, `AGENTS.md`, `README.md`, `context/workbook.md`, and `context/project.md` for `columns A through F` and for a personal-tab column list that stops at Space. Those phrases should be gone. The weekly sections should still say the Monday Chat message does not include issue URLs.

- [ ] **Step 5: Commit**

Run this only when the user has asked for a commit:

```powershell
git add docs/runbooks/spaces-roster-and-daily-posts.md AGENTS.md README.md context/workbook.md context/project.md
git commit -m "document the optional GitHub Issues column"
```
