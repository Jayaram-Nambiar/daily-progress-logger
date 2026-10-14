const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'logic.js'), 'utf8'), sandbox);
const Logic = sandbox.Logic;

function sameRange(ymd, start, end) {
  const range = Logic.previousWeekRange(ymd);
  assert.strictEqual(range.weekStartYMD, start);
  assert.strictEqual(range.weekEndYMD, end);
}
sameRange('2026-09-25', '2026-09-14', '2026-09-20');
sameRange('2026-09-21', '2026-09-14', '2026-09-20');
sameRange('2026-09-20', '2026-09-07', '2026-09-13');
sameRange('2026-09-27', '2026-09-14', '2026-09-20');

assert.strictEqual(Array.from(Logic.parseDays('Mon, Tue, Mon, Fri')).join(','), 'Mon,Tue,Fri');
assert.strictEqual(Array.from(Logic.parseDays('Monday, Funday')).join(','), '');
assert.strictEqual(Logic.isScheduledDay('Mon,Tue,Wed,Thu,Fri', 5), true);
assert.strictEqual(Logic.isScheduledDay('Mon,Tue,Wed,Thu,Fri', 0), false);
assert.strictEqual(Logic.isScheduledDay('Mon,Tue,Wed,Thu,Fri', 6), false);

assert.strictEqual(Logic.validateSchedule('Mon,Fri', 18, 0).ok, true);
assert.strictEqual(Logic.validateSchedule('Mon', 19, 0).ok, true);
assert.strictEqual(Logic.validateSchedule('Mon', 9, 7).ok, false);
assert.strictEqual(Logic.validateSchedule('Mon', 24, 0).ok, false);
assert.strictEqual(Logic.validateSchedule('', 18, 0).ok, false);

assert.strictEqual(Logic.hasUpdateForSpace([
  { date: '2026-09-25', summary: 'Did the lab notes', space: 'PRJ_VOX' }
], '2026-09-25', 'PRJ_VOX'), true);
assert.strictEqual(Logic.hasUpdateForSpace([
  { date: '2026-09-25', summary: 'Did the lab notes', space: 'PRJ_VOX' }
], '2026-09-25', 'LAB_STATUS_NOTICE'), false);
assert.strictEqual(Logic.hasUpdateForSpace([
  { date: '2026-09-25', summary: '', space: 'PRJ_VOX' }
], '2026-09-25', 'PRJ_VOX'), false);
assert.strictEqual(Logic.hasUpdateForSpace([
  { date: '2026-09-24', summary: 'Yesterday', space: 'PRJ_VOX' }
], '2026-09-25', 'PRJ_VOX'), false);

const text = Logic.reminderText('PRJ_VOX', 'Fri, Sep 25, 2026', ['<users/1>', '*Ada*'], 'https://docs.google.com/spreadsheets/d/SHEET', '19:00 IST');
assert.ok(text.indexOf('Space: PRJ_VOX') >= 0);
assert.ok(text.indexOf('https://docs.google.com/spreadsheets/d/SHEET') >= 0);
assert.ok(text.indexOf('• <users/1>') >= 0);
assert.ok(text.indexOf('• *Ada*') >= 0);
assert.ok(text.indexOf('around 19:00 IST') >= 0);
assert.strictEqual(Logic.formatClockTime(19, 0), '19:00');
assert.strictEqual(Logic.formatClockTime(9, 5), '09:05');
const mail = Logic.reminderEmailHtml('Ada', ['PRJ_VOX', 'HAK_HEALTH_A_THON'], 'https://docs.google.com/spreadsheets/d/SHEET', '19:00 IST');
assert.ok(mail.indexOf('PRJ_VOX, HAK_HEALTH_A_THON') >= 0);
assert.ok(mail.indexOf('around <b>19:00 IST</b>') >= 0);
assert.ok(mail.indexOf('https://docs.google.com/spreadsheets/d/SHEET') >= 0);

const seeded = Logic.seedMatrix(
  ['Ada', 'Bea'],
  ['PRJ_VOX', 'PRJ_AURA'],
  {},
  { Ada: true, Bea: false }
);
assert.strictEqual(Array.from(seeded.headers).join('|'), 'Member|PRJ_VOX|PRJ_AURA');
assert.strictEqual(JSON.stringify(seeded.grid), JSON.stringify([
  ['Ada', true, false],
  ['Bea', false, false]
]));

const kept = Logic.seedMatrix(
  ['Ada'],
  ['PRJ_VOX', 'PRJ_AURA'],
  { Ada: { PRJ_AURA: true } },
  { Ada: true }
);
assert.strictEqual(JSON.stringify(kept.grid), JSON.stringify([['Ada', false, true]]));

const addedSpace = Logic.seedMatrix(
  ['Ada', 'Cy'],
  ['PRJ_VOX', 'PRJ_AURA'],
  { Ada: { PRJ_VOX: true } },
  { Cy: true }
);
assert.strictEqual(JSON.stringify(addedSpace.grid), JSON.stringify([
  ['Ada', true, false],
  ['Cy', false, false]
]));

const spaces = ['PRJ_VOX', 'PRJ_AURA'];
const spaceCol = 5;
assert.strictEqual(Logic.needsSpacePrompt([1], spaceCol, '2026-09-25', '2026-09-25', '', spaces), true);
assert.strictEqual(Logic.needsSpacePrompt([1], spaceCol, '2026-09-25', '2026-09-25', 'Not A Space', spaces), true);
assert.strictEqual(Logic.needsSpacePrompt([1], spaceCol, '2026-09-25', '2026-09-25', 'PRJ_VOX', spaces), false);
assert.strictEqual(Logic.needsSpacePrompt([5], spaceCol, '2026-09-25', '2026-09-25', '', spaces), false);
assert.strictEqual(Logic.needsSpacePrompt([1, 5], spaceCol, '2026-09-25', '2026-09-25', 'PRJ_AURA', spaces), false);
assert.strictEqual(Logic.needsSpacePrompt([1], spaceCol, '2026-09-24', '2026-09-25', '', spaces), false);
assert.strictEqual(Logic.needsSpacePrompt([1], spaceCol, '2026-09-26', '2026-09-25', '', spaces), false);
assert.strictEqual(Logic.needsSpacePrompt([1], spaceCol, '', '2026-09-25', '', spaces), false);

assert.strictEqual(Logic.formatSpaceList(['PRJ_AURA', 'PRJ_VOX', 'PRJ_VOX']), 'PRJ_AURA, PRJ_VOX');
assert.strictEqual(Logic.parseSpaceList('PRJ_VOX, PRJ_AURA').join('|'), 'PRJ_VOX|PRJ_AURA');
assert.strictEqual(Logic.isNamedProjectSpace('SPACE', 'PRJ_VOX'), true);
assert.strictEqual(Logic.isNamedProjectSpace('SPACE', 'Meeting started'), false);
assert.strictEqual(Logic.isNamedProjectSpace('GROUP_CHAT', 'PRJ_VOX'), false);
assert.strictEqual(Logic.chatUserKey('<users/105>'), 'users/105');
const access = Logic.spacesForMember('users/105', { PRJ_VOX: { 'users/105': true }, PRJ_AURA: {} });
assert.strictEqual(access.join('|'), 'PRJ_VOX');
const keptGrid = Logic.seedMatrix(['Ada'], ['PRJ_VOX', 'PRJ_AURA'], { Ada: { PRJ_VOX: true, PRJ_AURA: true } }, {}).grid;
const limited = Logic.applyMembership(keptGrid, ['PRJ_VOX', 'PRJ_AURA'], { Ada: ['PRJ_VOX'] }, true);
assert.strictEqual(JSON.stringify(limited), JSON.stringify([['Ada', true, '']]));
const untouched = Logic.applyMembership(keptGrid, ['PRJ_VOX', 'PRJ_AURA'], { Ada: [] }, false);
assert.strictEqual(JSON.stringify(untouched), JSON.stringify([['Ada', true, true]]));

assert.strictEqual(Logic.truncateText('abcdef', 10), 'abcdef');
assert.ok(Logic.truncateText('abcdefghijklmnop', 12).indexOf('…[truncated]') >= 0);
const prompt = Logic.buildWeeklySummaryUserPrompt('PRJ_VOX', '2026-09-14', '2026-09-20', [
  {
    label: '*Ada*',
    text: '• Wed, Sep 16: followed up\n• Mon, Sep 14: shipped login',
    entries: [
      { ymd: '2026-09-16', line: '• Wed, Sep 16: followed up' },
      { ymd: '2026-09-14', line: '• Mon, Sep 14: shipped login' }
    ]
  }
]);
assert.ok(prompt.indexOf('Space: PRJ_VOX') >= 0);
assert.ok(prompt.indexOf('shipped login') >= 0);
assert.ok(prompt.indexOf('[2026-09-14]') >= 0);
assert.ok(prompt.indexOf('[2026-09-16]') >= 0);
assert.ok(prompt.indexOf('member name') >= 0);
assert.ok(
  prompt.indexOf('[2026-09-14]') < prompt.indexOf('[2026-09-16]'),
  'dated entries should be sorted ascending for chronology'
);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('[YYYY-MM-DD]') >= 0);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('Do not invent') >= 0);
assert.strictEqual(Logic.hasWeeklyMemberContent([]), false);
assert.strictEqual(Logic.hasWeeklyMemberContent([{ label: '*Ada*', text: '', entries: [] }]), false);
assert.strictEqual(
  Logic.hasWeeklyMemberContent([{ label: '*Ada*', text: '', entries: [{ ymd: '2026-09-14', line: '' }] }]),
  false
);
assert.strictEqual(
  Logic.hasWeeklyMemberContent([{ label: '*Ada*', entries: [{ ymd: '2026-09-14', line: '• shipped' }] }]),
  true
);
assert.strictEqual(Logic.hasWeeklyMemberContent([{ label: '*Ada*', text: '• shipped' }]), true);
const promptFallback = Logic.buildWeeklySummaryUserPrompt('PRJ_VOX', '2026-09-14', '2026-09-20', [
  { label: '*Ada*', text: '• Mon: shipped login' }
]);
assert.ok(promptFallback.indexOf('shipped login') >= 0);
assert.strictEqual(
  Logic.extractOpenRouterText({ choices: [{ message: { content: '  • Done\n• More  ' } }] }),
  '• Done\n• More'
);
assert.strictEqual(Logic.sanitizeWeeklySummary(''), '');
const chat = Logic.buildWeeklyChatMessage(
  'PRJ_VOX',
  '2026-09-14',
  '2026-09-20',
  '• Login shipped',
  [{ label: '*Ada*', text: '• Mon: shipped login' }]
);
assert.ok(chat.indexOf('• Login shipped') >= 0);
assert.ok(chat.indexOf('*By member*') < 0);
assert.ok(chat.indexOf('*Ada*') < 0);
const chatNoAi = Logic.buildWeeklyChatMessage(
  'PRJ_VOX',
  '2026-09-14',
  '2026-09-20',
  '',
  [{ label: '*Ada*', text: '• Mon: shipped login' }]
);
assert.ok(chatNoAi.indexOf('*Ada*') >= 0);
assert.ok(chatNoAi.indexOf('shipped login') >= 0);
assert.strictEqual(
  Logic.parseOpenRouterModels(
    'meta-llama/llama-3.3-70b-instruct:free, deepseek/deepseek-v4-flash:free, meta-llama/llama-3.3-70b-instruct:free',
    ''
  ).join('|'),
  'meta-llama/llama-3.3-70b-instruct:free|deepseek/deepseek-v4-flash:free'
);
assert.strictEqual(
  Logic.preferFreeOpenRouterModels(
    ['meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-v4-flash:free'],
    'meta-llama/llama-3.3-70b-instruct:free,deepseek/deepseek-v4-flash:free'
  ).join('|'),
  'deepseek/deepseek-v4-flash:free'
);
assert.strictEqual(
  Logic.preferFreeOpenRouterModels(
    ['meta-llama/llama-3.3-70b-instruct', 'nvidia/nemotron-3-ultra-550b-a55b'],
    'meta-llama/llama-3.3-70b-instruct:free,deepseek/deepseek-v4-flash:free'
  ).join('|'),
  'meta-llama/llama-3.3-70b-instruct:free|deepseek/deepseek-v4-flash:free'
);

const fallbackModels = 'google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free';
assert.strictEqual(
  Logic.resolveOpenRouterModels(
    'meta-llama/llama-3.3-70b-instruct:free,deepseek/deepseek-v4-flash:free',
    fallbackModels
  ).join('|'),
  'google/gemma-4-31b-it:free|google/gemma-4-26b-a4b-it:free|openrouter/free'
);
assert.strictEqual(
  Logic.resolveOpenRouterModels(
    'google/gemma-4-26b-a4b-it:free, meta-llama/llama-3.3-70b-instruct',
    fallbackModels
  ).join('|'),
  'google/gemma-4-26b-a4b-it:free|openrouter/free'
);
assert.strictEqual(
  Logic.resolveOpenRouterModels('openrouter/free', fallbackModels).join('|'),
  'openrouter/free'
);
assert.strictEqual(Logic.isFreeOpenRouterModel('meta-llama/llama-3.3-70b-instruct'), false);
assert.strictEqual(Logic.isFreeOpenRouterModel('deepseek/deepseek-v4-flash:free'), false);
assert.strictEqual(Logic.isFreeOpenRouterModel('openrouter/free'), true);
const body = Logic.openRouterChatBody('google/gemma-4-31b-it:free', 'system', 'user');
assert.strictEqual(body.model, 'google/gemma-4-31b-it:free');
assert.strictEqual(body.reasoning.effort, 'none');
  assert.strictEqual(body.max_tokens, 1200);
assert.strictEqual(body.messages[1].content, 'user');

const chatWhitespace = Logic.buildWeeklyChatMessage(
  'PRJ_VOX',
  '2026-09-14',
  '2026-09-20',
  '   ',
  [{ label: '*Ada*', text: '• Mon: shipped login' }]
);
assert.ok(chatWhitespace.indexOf('*Ada*') >= 0);
assert.ok(chatWhitespace.indexOf('shipped login') >= 0);
const chatNull = Logic.buildWeeklyChatMessage(
  'PRJ_VOX',
  '2026-09-14',
  '2026-09-20',
  null,
  [{ label: '*Bea*', text: '• Tue: fixed export' }]
);
assert.ok(chatNull.indexOf('*Bea*') >= 0);
assert.ok(chatNull.indexOf('fixed export') >= 0);
assert.strictEqual(
  Logic.extractOpenRouterText({ choices: [{ message: { content: '', reasoning: '• hidden' } }] }),
  ''
);

const rosterIds = { 'ada@arcaai.com': '105560557556056333545' };
const fromMap = Logic.resolveChatMention('Ada@arcaai.com', rosterIds, '');
assert.strictEqual(fromMap.mention, '<users/105560557556056333545>');
assert.strictEqual(fromMap.source, 'map');
const keptMention = Logic.resolveChatMention('new@arcaai.com', rosterIds, '<users/111>');
assert.strictEqual(keptMention.mention, '<users/111>');
assert.strictEqual(keptMention.source, 'kept');
const keptDigits = Logic.resolveChatMention('', rosterIds, '222');
assert.strictEqual(keptDigits.mention, '<users/222>');
assert.strictEqual(keptDigits.source, 'kept');
const missingMention = Logic.resolveChatMention('new@arcaai.com', rosterIds, 'not-an-id');
assert.strictEqual(missingMention.mention, '');
assert.strictEqual(missingMention.source, 'missing');
const mapWins = Logic.resolveChatMention('ada@arcaai.com', rosterIds, '<users/111>');
assert.strictEqual(mapWins.mention, '<users/105560557556056333545>');
assert.strictEqual(mapWins.source, 'map');

const namedPrompt = Logic.buildWeeklySummaryUserPrompt('PRJ_VOX', '2026-09-28', '2026-10-04', [
  {
    member: 'Ada',
    label: '<users/105>',
    entries: [{ ymd: '2026-09-28', line: '• Mon, Sep 28: shipped login <users/999>' }]
  }
]);
assert.ok(namedPrompt.indexOf('Ada') >= 0);
assert.strictEqual(namedPrompt.indexOf('<users/'), -1);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('Do not restate every daily line') >= 0);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('Do not omit a member') >= 0);

const cleanedSummary = Logic.sanitizeWeeklySummary('• Ada shipped login <users/105>.');
assert.ok(cleanedSummary.indexOf('Ada shipped login') >= 0);
assert.strictEqual(cleanedSummary.indexOf('<users/'), -1);
const safeChat = Logic.buildWeeklyChatMessage(
  'PRJ_VOX',
  '2026-09-14',
  '2026-09-20',
  '• Ada <users/105>',
  [{ label: '<users/105>', text: 'raw line' }]
);
assert.strictEqual(safeChat.indexOf('<users/'), -1);
assert.ok(safeChat.indexOf('raw line') < 0);

const namedSummary = Logic.buildWeeklyChatMessage(
  'PRJ_VOX',
  '2026-10-05',
  '2026-10-11',
  '• Konduka Sanjali tested transcription.',
  [{ member: 'Konduka Sanjali', label: '<users/102>', text: '• Wed: raw detail <users/102>' }]
);
assert.ok(namedSummary.indexOf('tested transcription') >= 0);
assert.ok(namedSummary.indexOf('raw detail') < 0);
assert.strictEqual(namedSummary.indexOf('<users/'), -1);

const restoredMember = Logic.buildWeeklyChatMessage(
  'PRJ_VOX',
  '2026-10-05',
  '2026-10-11',
  '• Rijna Shameen wrote API docs.',
  [
    { member: 'Rijna Shameen', label: '<users/1>', text: '• Mon: docs' },
    { member: 'Konduka Sanjali', label: '<users/102>', text: '• Wed: tested transcription' }
  ]
);
assert.ok(restoredMember.indexOf('Rijna Shameen') >= 0);
assert.ok(restoredMember.indexOf('• Mon: docs') < 0);
assert.ok(restoredMember.indexOf('Konduka Sanjali') >= 0);
assert.ok(restoredMember.indexOf('tested transcription') >= 0);

assert.strictEqual(Logic.isFreeOpenRouterModel('qwen/qwen3.8-27b:free'), false);
assert.strictEqual(
  Logic.resolveOpenRouterModels(
    'google/gemma-4-31b-it:free,qwen/qwen3.8-27b:free',
    'google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free'
  ).join('|'),
  'google/gemma-4-31b-it:free|openrouter/free'
);

assert.strictEqual(Logic.cellText('#REF!'), '');
assert.strictEqual(Logic.cellText('#N/A'), '');
assert.strictEqual(Logic.cellText('  shipped login  '), 'shipped login');

const safeRows = Logic.collectSafe(
  ['good', '#REF!', 'also good'],
  function (item) {
    if (item === '#REF!') throw new Error('bad cell');
    return item;
  }
);
assert.strictEqual(safeRows.values.join('|'), 'good|also good');
assert.strictEqual(safeRows.skipped, 1);

const hope8 = 'https://github.com/arcaai/project-hope/issues/8';
const hope9 = 'https://github.com/arcaai/project-hope/issues/9';

const pageIssue = Logic.planGithubIssueCell(
  'https://github.com/ArcaAI/project-hope/issues/08',
  []
);
assert.strictEqual(pageIssue.rewrite, true);
assert.strictEqual(pageIssue.display, '8');
assert.strictEqual(JSON.stringify(pageIssue.issues), JSON.stringify([{ number: '8', url: hope8 }]));

const decorated = Logic.planGithubIssueCell(
  'http://www.github.com/ArcaAI/project-hope/issues/8/?utm=1#issuecomment-5',
  []
);
assert.strictEqual(JSON.stringify(decorated.issues), JSON.stringify([{ number: '8', url: hope8 }]));

const bareHost = Logic.planGithubIssueCell('github.com/ArcaAI/project-hope/issues/9.', []);
assert.strictEqual(JSON.stringify(bareHost.issues), JSON.stringify([{ number: '9', url: hope9 }]));

const notGithub = Logic.planGithubIssueCell('https://notgithub.com/ArcaAI/project-hope/issues/8', []);
assert.strictEqual(JSON.stringify(notGithub.issues), '[]');
assert.strictEqual(notGithub.rewrite, false);

const blankIssues = Logic.planGithubIssueCell('', []);
assert.strictEqual(JSON.stringify(blankIssues.issues), '[]');
assert.strictEqual(blankIssues.rewrite, false);
assert.strictEqual(blankIssues.display, '');

const typedNote = Logic.planGithubIssueCell('no issue for this row', []);
assert.strictEqual(typedNote.rewrite, false);
assert.strictEqual(JSON.stringify(typedNote.issues), '[]');

const alreadyLinked = Logic.planGithubIssueCell('8, 9', [hope8, hope9]);
assert.strictEqual(alreadyLinked.rewrite, false);
assert.strictEqual(alreadyLinked.display, '8, 9');
assert.strictEqual(JSON.stringify(alreadyLinked.issues), JSON.stringify([
  { number: '8', url: hope8 },
  { number: '9', url: hope9 }
]));

const rawPair = Logic.planGithubIssueCell(
  'https://github.com/ArcaAI/project-hope/issues/8, https://github.com/ArcaAI/project-hope/issues/8',
  []
);
assert.strictEqual(JSON.stringify(rawPair.issues), JSON.stringify([{ number: '8', url: hope8 }]));

const pane = 'https://github.com/orgs/ArcaAI/projects/10/views/3?pane=issue&itemId=256599110&issue=ArcaAI%7Cproject-hope%7C8';
const paneIssue = Logic.planGithubIssueCell(pane, []);
assert.strictEqual(JSON.stringify(paneIssue.issues), JSON.stringify([{ number: '8', url: hope8 }]));
assert.strictEqual(paneIssue.display, '8');

const literalPipe = Logic.planGithubIssueCell(
  'https://github.com/users/octocat/projects/1?issue=ArcaAI|project-hope|9',
  []
);
assert.strictEqual(JSON.stringify(literalPipe.issues), JSON.stringify([{ number: '9', url: hope9 }]));

const lowerEncoded = Logic.planGithubIssueCell(
  'https://github.com/orgs/ArcaAI/projects/10?issue=ArcaAI%7cproject-hope%7c8',
  []
);
assert.strictEqual(JSON.stringify(lowerEncoded.issues), JSON.stringify([{ number: '8', url: hope8 }]));

const pathAndParam = Logic.planGithubIssueCell(
  'https://github.com/ArcaAI/project-hope/issues/8?issue=ArcaAI%7Cproject-hope%7C8',
  []
);
assert.strictEqual(JSON.stringify(pathAndParam.issues), JSON.stringify([{ number: '8', url: hope8 }]));

const bothShapes = Logic.planGithubIssueCell(
  pane + '\n' + 'https://github.com/ArcaAI/project-hope/issues/8',
  []
);
assert.strictEqual(JSON.stringify(bothShapes.issues), JSON.stringify([{ number: '8', url: hope8 }]));

const itemOnly = Logic.planGithubIssueCell(
  'https://github.com/orgs/airbytehq/projects/37/views/1?itemId=26937554&pane=issue',
  []
);
assert.strictEqual(JSON.stringify(itemOnly.issues), '[]');
assert.strictEqual(itemOnly.rewrite, false);

const pullPath = Logic.planGithubIssueCell('https://github.com/ArcaAI/project-hope/pull/8', []);
assert.strictEqual(JSON.stringify(pullPath.issues), '[]');

const mixedDelimiters = Logic.planGithubIssueCell(
  'https://github.com/ArcaAI/project-hope/issues/8; https://github.com/Other/widget/issues/8\nhttps://github.com/ArcaAI/project-hope/issues/9 | https://github.com/ArcaAI/project-hope/issues/9',
  []
);
assert.strictEqual(JSON.stringify(mixedDelimiters.issues), JSON.stringify([
  { number: '8', url: hope8 },
  { number: '8', url: 'https://github.com/other/widget/issues/8' },
  { number: '9', url: hope9 }
]));
assert.strictEqual(mixedDelimiters.display, '8, 8, 9');

const mixedNote = Logic.planGithubIssueCell('see ' + pane + ' thanks', []);
assert.strictEqual(JSON.stringify(mixedNote.issues), JSON.stringify([{ number: '8', url: hope8 }]));
assert.strictEqual(mixedNote.rewrite, true);
assert.strictEqual(mixedNote.display, '8');

const appended = Logic.planGithubIssueCell(
  '8, https://github.com/ArcaAI/project-hope/issues/9',
  [hope8]
);
assert.strictEqual(appended.display, '8, 9');
assert.strictEqual(appended.rewrite, true);

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
assert.strictEqual(JSON.stringify(Logic.datesInRange('2026-10-05', '2026-10-11')), JSON.stringify([
  '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'
]));
assert.strictEqual(JSON.stringify(Logic.datesInRange('2026-10-11', '2026-10-05')), '[]');

console.log('logic.test.js passed');
