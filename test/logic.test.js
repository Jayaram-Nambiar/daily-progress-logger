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
assert.ok(chatNoAi.indexOf('• Ada') >= 0);
assert.ok(chatNoAi.indexOf('*Ada*') < 0);
assert.ok(chatNoAi.indexOf('• Mon:') < 0);
assert.ok(/shipped login/i.test(chatNoAi));
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
const body = Logic.openRouterChatBody(
  'google/gemma-4-31b-it:free',
  'system',
  'user',
  Logic.weeklySummaryMaxTokens(4)
);
assert.strictEqual(body.model, 'google/gemma-4-31b-it:free');
assert.strictEqual(body.reasoning.effort, 'none');
assert.strictEqual(body.max_tokens, Logic.weeklySummaryMaxTokens(4));
assert.ok(body.max_tokens < 1200);
assert.strictEqual(body.messages[1].content, 'user');

const chatWhitespace = Logic.buildWeeklyChatMessage(
  'PRJ_VOX',
  '2026-09-14',
  '2026-09-20',
  '   ',
  [{ label: '*Ada*', text: '• Mon: shipped login' }]
);
assert.ok(chatWhitespace.indexOf('• Ada') >= 0);
assert.ok(chatWhitespace.indexOf('*Ada*') < 0);
assert.ok(/shipped login/i.test(chatWhitespace));
const chatNull = Logic.buildWeeklyChatMessage(
  'PRJ_VOX',
  '2026-09-14',
  '2026-09-20',
  null,
  [{ label: '*Bea*', text: '• Tue: fixed export' }]
);
assert.ok(chatNull.indexOf('• Bea') >= 0);
assert.ok(chatNull.indexOf('*Bea*') < 0);
assert.ok(/fixed export/i.test(chatNull));
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
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('Do not copy the source line by line') >= 0);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('Do not omit a member') >= 0);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('two to five bullets') >= 0);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('Summarize the member\'s week') >= 0);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('chronological order') >= 0);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('Do not mention calendar dates') >= 0);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('Do not include links') >= 0);
assert.strictEqual(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('On 2026-10-16'), -1);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('Saturday') >= 0);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('Sunday') >= 0);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('simple past') >= 0);
assert.strictEqual(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('distinct outcome'), -1);
assert.strictEqual(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('25 words'), -1);
assert.strictEqual(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf(';'), -1);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('one bullet') >= 0);

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
assert.ok(/tested transcription/i.test(restoredMember));

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

const spaceSeparated = Logic.planGithubIssueCell(
  'https://github.com/orgs/ArcaAI/projects/10/views/7?pane=issue&itemId=273314858&issue=ArcaAI%7Csara%7C9 https://github.com/ArcaAI/sara/issues/10',
  []
);
assert.strictEqual(JSON.stringify(spaceSeparated.issues), JSON.stringify([
  { number: '9', url: 'https://github.com/arcaai/sara/issues/9' },
  { number: '10', url: 'https://github.com/arcaai/sara/issues/10' }
]));
assert.strictEqual(spaceSeparated.display, '9, 10');
assert.strictEqual(spaceSeparated.rewrite, true);
assert.strictEqual(JSON.stringify(Logic.githubIssueLinkSpans(spaceSeparated.issues)), JSON.stringify([
  { start: 0, end: 1, url: 'https://github.com/arcaai/sara/issues/9' },
  { start: 3, end: 5, url: 'https://github.com/arcaai/sara/issues/10' }
]));
assert.strictEqual(JSON.stringify(Logic.githubIssueLinkSpans([
  { number: '2', url: 'https://github.com/arcaai/sara/issues/2' },
  { number: '38', url: 'https://github.com/arcaai/sara/issues/38' }
])), JSON.stringify([
  { start: 0, end: 1, url: 'https://github.com/arcaai/sara/issues/2' },
  { start: 3, end: 5, url: 'https://github.com/arcaai/sara/issues/38' }
]));
assert.strictEqual(JSON.stringify(Logic.githubIssueLinkSpans([])), '[]');

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

assert.ok(Logic.weeklySummaryMaxTokens(1) >= 120);
assert.ok(Logic.weeklySummaryMaxTokens(1) <= 250);
assert.ok(Logic.weeklySummaryMaxTokens(6) > Logic.weeklySummaryMaxTokens(1));
assert.ok(Logic.weeklySummaryMaxTokens(6) <= 900);
assert.ok(Logic.weeklySummaryMaxTokens(20) <= 900);

const priorCap = '• Ada ' + 'worked on a distinct outcome. '.repeat(150);
assert.ok(priorCap.length > 4000);
assert.ok(priorCap.length < Logic.MAX_WEEKLY_SUMMARY_CHARS);
const keptSummary = Logic.sanitizeWeeklySummary(priorCap);
assert.strictEqual(keptSummary.indexOf('…[truncated]'), -1);
assert.ok(keptSummary.length > 4000);

const roster = [];
for (let i = 0; i < 7; i++) {
  roster.push({
    member: 'Member ' + i,
    entries: [{ ymd: '2026-10-12', line: 'shipped item ' + i }]
  });
}
const batches = Logic.planWeeklySummaryBatches(roster);
assert.ok(batches.length >= 2);
assert.strictEqual(
  batches.reduce(function (names, batch) {
    return names.concat(batch.map(function (block) { return block.member; }));
  }, []).join('|'),
  roster.map(function (block) { return block.member; }).join('|')
);
batches.forEach(function (batch) {
  assert.ok(batch.length <= Logic.MAX_MEMBERS_PER_WEEKLY_CALL);
  const batchPrompt = Logic.buildWeeklySummaryUserPrompt('PRJ_VOX', '2026-10-12', '2026-10-18', batch);
  assert.ok(batchPrompt.length <= Logic.MAX_WEEKLY_SOURCE_CHARS);
  assert.strictEqual(batchPrompt.indexOf('…[truncated]'), -1);
});

const hugeBlock = {
  member: 'Huge Member',
  entries: [{ ymd: '2026-10-12', line: 'x'.repeat(Logic.MAX_WEEKLY_SOURCE_CHARS) }]
};
const smallBlock = {
  member: 'Small Member',
  entries: [{ ymd: '2026-10-13', line: 'shipped the patch' }]
};
const sizedBatches = Logic.planWeeklySummaryBatches([hugeBlock, smallBlock]);
const smallOnly = sizedBatches.find(function (batch) {
  return batch.some(function (block) { return block.member === 'Small Member'; });
});
assert.ok(smallOnly);
assert.strictEqual(smallOnly.some(function (block) { return block.member === 'Huge Member'; }), false);
const smallPrompt = Logic.buildWeeklySummaryUserPrompt('PRJ_VOX', '2026-10-12', '2026-10-18', smallOnly);
assert.ok(smallPrompt.indexOf('shipped the patch') >= 0);
assert.strictEqual(smallPrompt.indexOf('…[truncated]'), -1);
const hugePrompt = Logic.buildWeeklySummaryUserPrompt('PRJ_VOX', '2026-10-12', '2026-10-18', [hugeBlock]);
assert.strictEqual(hugePrompt.indexOf('…[truncated]'), -1);
assert.strictEqual(hugePrompt.indexOf('source shortened'), -1);
assert.ok(hugePrompt.indexOf('x'.repeat(200)) >= 0);
assert.ok(hugePrompt.length > Logic.MAX_WEEKLY_SOURCE_CHARS);

const cutReply = Logic.readOpenRouterCompletion({
  choices: [{ finish_reason: 'length', message: { content: '• Ada shipped' } }]
});
assert.strictEqual(cutReply.truncated, true);
assert.strictEqual(cutReply.text, '• Ada shipped');
const fullReply = Logic.readOpenRouterCompletion({
  choices: [{ finish_reason: 'stop', message: { content: '• Ada shipped.' } }]
});
assert.strictEqual(fullReply.truncated, false);

const splitDecision = Logic.interpretWeeklySummaryAttempt(
  '• Ada shipped login.\n• Bea tested and then the sentence stops mid',
  true,
  [
    { member: 'Ada', text: 'shipped login' },
    { member: 'Bea', text: 'tested export' }
  ]
);
assert.strictEqual(splitDecision.action, 'split');

const accepted = Logic.interpretWeeklySummaryAttempt(
  '• Ada shipped login.\n• Bea tested export.',
  false,
  [
    { member: 'Ada', text: 'shipped login' },
    { member: 'Bea', text: 'tested export' }
  ]
);
assert.strictEqual(accepted.action, 'accept');
assert.ok(accepted.text.indexOf('• Bea tested export.') >= 0);
assert.strictEqual(accepted.text.indexOf('…[truncated]'), -1);

const oneMember = Logic.interpretWeeklySummaryAttempt(
  '• Ada shipped login. And then the sentence stops mid',
  true,
  [{ member: 'Ada', text: 'raw diary' }]
);
assert.strictEqual(oneMember.action, 'accept');
assert.ok(oneMember.text.indexOf('Ada') >= 0);
assert.ok(oneMember.text.indexOf('shipped login.') >= 0);
assert.strictEqual(oneMember.text.indexOf('stops mid'), -1);
assert.strictEqual(oneMember.text.indexOf('raw diary'), -1);

const namedAnyway = Logic.interpretWeeklySummaryAttempt(
  'Shipped the parser.',
  false,
  [{ member: 'Ada Lovelace', text: 'raw diary' }]
);
assert.strictEqual(namedAnyway.action, 'accept');
assert.ok(namedAnyway.text.indexOf('Ada Lovelace') >= 0);

const overCap = '• Ada ' + 'done. '.repeat(500) + '\n• Bea ' + 'done. '.repeat(500);
assert.ok(overCap.length > Logic.MAX_WEEKLY_SUMMARY_CHARS);
const overDecision = Logic.interpretWeeklySummaryAttempt(overCap, false, [
  { member: 'Ada', text: 'done' },
  { member: 'Bea', text: 'done' }
]);
assert.strictEqual(overDecision.action, 'split');

assert.strictEqual(
  Logic.joinWeeklySummaryBullets(['• Ada shipped.', '', '• Bea tested.']),
  '• Ada shipped.\n• Bea tested.'
);

assert.strictEqual(
  Logic.weeklyStoredSummaryIsUsable('• Ada shipped.\n…[truncated]', [{ member: 'Ada', text: 'x' }]),
  false
);
assert.strictEqual(
  Logic.weeklyStoredSummaryIsUsable('• Ada shipped.', [
    { member: 'Ada', text: 'x' },
    { member: 'Bea', text: 'y' }
  ]),
  false
);
assert.strictEqual(
  Logic.weeklyStoredSummaryIsUsable('• Ada shipped.\n• Bea tested.', [
    { member: 'Ada', text: 'x' },
    { member: 'Bea', text: 'y' }
  ]),
  true
);

const week = Logic.previousWeekRange('2026-10-21');
assert.strictEqual(week.weekStartYMD, '2026-10-12');
assert.strictEqual(week.weekEndYMD, '2026-10-18');
assert.strictEqual(Logic.ymdInInclusiveRange('2026-10-17', week.weekStartYMD, week.weekEndYMD), true);
assert.strictEqual(Logic.ymdInInclusiveRange('2026-10-18', week.weekStartYMD, week.weekEndYMD), true);
assert.strictEqual(Logic.ymdInInclusiveRange('2026-10-11', week.weekStartYMD, week.weekEndYMD), false);
assert.strictEqual(Logic.ymdInInclusiveRange('2026-10-14', week.weekStartYMD, week.weekEndYMD), true);

const weekendPrompt = Logic.buildWeeklySummaryUserPrompt('PRJ_VOX', '2026-10-12', '2026-10-18', [
  {
    member: 'Ada',
    entries: [
      { ymd: '2026-10-18', line: 'checked the Sunday logs' },
      { ymd: '2026-10-16', line: 'shipped the Friday build' },
      { ymd: '2026-10-17', line: 'fixed the Saturday export' }
    ]
  }
]);
assert.ok(weekendPrompt.indexOf('[2026-10-16]') < weekendPrompt.indexOf('[2026-10-17]'));
assert.ok(weekendPrompt.indexOf('[2026-10-17]') < weekendPrompt.indexOf('[2026-10-18]'));
assert.ok(weekendPrompt.indexOf('Saturday') >= 0);
assert.ok(weekendPrompt.indexOf('Sunday') >= 0);
assert.ok(weekendPrompt.indexOf('date order') >= 0);

assert.strictEqual(Logic.dailyPostDays('Mon,Tue,Wed,Thu,Fri'), 'Mon,Tue,Wed,Thu,Fri,Sat,Sun');
assert.strictEqual(Logic.dailyPostDays('Mon,Wed,Fri'), 'Mon,Wed,Fri');
assert.strictEqual(Logic.dailyPostDays('Mon,Tue,Wed,Thu,Fri,Sat,Sun'), 'Mon,Tue,Wed,Thu,Fri,Sat,Sun');

const rollupHeader = '*Weekly roll-up — PRJ_VOX — 2026-10-12 → 2026-10-18*';
const adaBlock = '• Ada\nOn 2026-10-17, Ada fixed the Saturday export.\nOn 2026-10-18, Ada checked the Sunday logs.';
const beaBlock = '• Bea\nOn 2026-10-12, Bea tested the API.';
const rollupText = rollupHeader + '\n\n' + adaBlock + '\n' + beaBlock;
const packLimit = (rollupHeader + '\n\n' + adaBlock).length;
const packed = Logic.chunkChatByMember(rollupText, packLimit);
const adaMessages = packed.filter(function (part) {
  return part.indexOf('• Ada') >= 0 || part.indexOf('Saturday export') >= 0 || part.indexOf('Sunday logs') >= 0;
});
assert.strictEqual(adaMessages.length, 1);
assert.ok(adaMessages[0].indexOf('• Ada') >= 0);
assert.ok(adaMessages[0].indexOf('Saturday export') >= 0);
assert.ok(adaMessages[0].indexOf('Sunday logs') >= 0);
assert.ok(packed.some(function (part) {
  return part.indexOf('• Bea') >= 0 && part.indexOf('Saturday export') < 0;
}));
packed.forEach(function (part) {
  assert.ok(part.length <= packLimit);
});
assert.strictEqual(packed.join('\n').indexOf('…[truncated]'), -1);

const voxBlocks = [
  {
    member: 'Neena A Panicker',
    label: '<users/1>',
    entries: [
      {
        ymd: '2026-11-04',
        summary: 'Did DSP and mic configuration in 3 departments',
        blockers: '',
        line: '• Wed, Nov 4: Did DSP and mic configuration in 3 departments (4h)'
      },
      {
        ymd: '2026-11-05',
        summary: 'Sanity Test after New Deployment',
        blockers: 'Network error Error blocked me from continuing validation.',
        line: '• Thu, Nov 5: Sanity Test after New Deployment (1.5h) — Blockers: Network error Error blocked me from continuing validation.'
      }
    ]
  },
  {
    member: 'Dr. Jayaram Nambiar',
    label: '<users/2>',
    entries: [
      {
        ymd: '2026-11-04',
        summary: 'Generated 18 mock consult codemixed transcripts',
        line: '• Wed, Nov 4: Generated 18 mock consult codemixed transcripts (2h)'
      },
      {
        ymd: '2026-11-05',
        summary: 'Updated pre-summary and pre-consult summary prompts. Then, discarded that and made shibus rendition of the same clear guardrails',
        line: '• Thu, Nov 5: Updated pre-summary and pre-consult summary prompts. Then, discarded that and made shibus rendition of the same clear guardrails (1h)'
      }
    ]
  }
];
voxBlocks.forEach(function (block) {
  block.text = block.entries.map(function (entry) { return entry.line; }).join('\n');
});
const pastedRollup = Logic.buildWeeklyChatMessage('PRJ_VOX', '2026-11-02', '2026-11-08', '', voxBlocks);
assert.strictEqual(pastedRollup.indexOf('(4h)'), -1);
assert.strictEqual(pastedRollup.indexOf('• Wed, Nov 4:'), -1);
assert.strictEqual(pastedRollup.indexOf('<users/'), -1);
assert.ok(pastedRollup.indexOf('• Neena A Panicker') >= 0);
assert.ok(pastedRollup.indexOf('DSP and mic configuration') >= 0);
assert.ok(pastedRollup.indexOf('Blocker: Network error Error blocked me from continuing validation.') >= 0);
assert.ok(pastedRollup.indexOf('• Dr. Jayaram Nambiar') >= 0);
assert.ok(pastedRollup.indexOf('shibus rendition') >= 0);
assert.strictEqual(pastedRollup.indexOf('On 2026-11-04'), -1);
assert.ok(pastedRollup.indexOf('DSP and mic configuration') < pastedRollup.indexOf('Sanity Test'));
assert.ok(pastedRollup.indexOf('mock consult codemixed transcripts') < pastedRollup.indexOf('shibus rendition'));
const neenaSection = pastedRollup.slice(
  pastedRollup.indexOf('• Neena A Panicker'),
  pastedRollup.indexOf('• Dr. Jayaram Nambiar')
).trim();
assert.ok(neenaSection.indexOf('\n- ') >= 0);
assert.ok(neenaSection.split('\n').length >= 3);
assert.strictEqual(neenaSection.indexOf('2026-11-'), -1);
assert.strictEqual((neenaSection.match(/Neena A Panicker/g) || []).length, 1);
const sameDay = Logic.condenseWeeklyMember_({
  member: 'Sumankumar Singh',
  entries: [
    { ymd: '2026-11-10', summary: 'Studied Guard concepts and the CanActivate interface' },
    { ymd: '2026-11-10', summary: 'Studied Exception Filters and Pipes' },
    { ymd: '2026-11-11', summary: 'Audited the API Gateway request-handling architecture' }
  ]
});
assert.ok(sameDay.indexOf('\n- ') >= 0);
assert.strictEqual(sameDay.split('\n').length, 4);
assert.strictEqual(sameDay.indexOf('2026-11-'), -1);
assert.ok(sameDay.indexOf('CanActivate') < sameDay.indexOf('Exception Filters'));
assert.ok(sameDay.indexOf('Exception Filters') < sameDay.indexOf('API Gateway'));
assert.strictEqual((sameDay.match(/Sumankumar Singh/g) || []).length, 1);
const linked = Logic.condenseWeeklyMember_({
  member: 'Neena A Panicker',
  entries: [{
    ymd: '2026-11-12',
    summary: 'Generated summaries for 12 audios https://docs.google.com/document/d/abc/edit?usp=sharing'
  }]
});
assert.strictEqual(linked.indexOf('http'), -1);
assert.ok(linked.indexOf('12 audios') >= 0);
const linkedPrompt = Logic.buildWeeklySummaryUserPrompt('PRJ_VOX', '2026-11-09', '2026-11-15', [{
  member: 'Neena A Panicker',
  entries: [{
    ymd: '2026-11-12',
    line: 'Generated summaries for 12 audios https://docs.google.com/document/d/abc/edit'
  }]
}]);
assert.strictEqual(linkedPrompt.indexOf('http'), -1);
assert.ok(linkedPrompt.indexOf('12 audios') >= 0);
assert.ok(linkedPrompt.indexOf('bulleted summary') >= 0);
const jayChunks = Logic.chunkChatByMember(pastedRollup, 3500).filter(function (part) {
  return part.indexOf('Dr. Jayaram Nambiar') >= 0 || part.indexOf('shibus rendition') >= 0;
});
assert.strictEqual(jayChunks.length, 1);
assert.ok(jayChunks[0].indexOf('mock consult codemixed transcripts') >= 0);
assert.ok(jayChunks[0].indexOf('shibus rendition') >= 0);

const storedPaste = 'Neena A Panicker\n• Wed, Nov 4: Did DSP and mic configuration in 3 departments (4h)';
assert.strictEqual(
  Logic.weeklyStoredSummaryIsUsable(storedPaste, [{ member: 'Neena A Panicker', text: 'x' }]),
  false
);
const fromStoredPaste = Logic.buildWeeklyChatMessage(
  'PRJ_VOX',
  '2026-11-02',
  '2026-11-08',
  storedPaste,
  [voxBlocks[0]]
);
assert.strictEqual(fromStoredPaste.indexOf('• Wed, Nov 4:'), -1);
assert.strictEqual(fromStoredPaste.indexOf('(4h)'), -1);
assert.ok(fromStoredPaste.indexOf('DSP and mic configuration') >= 0);

const diaryBlocks = [
  {
    member: 'Neena A Panicker',
    entries: [
      { ymd: '2026-11-16', summary: 'regenerated summary for gastroenterology new visits through admin console' },
      { ymd: '2026-11-16', summary: 'coordinated with Jose and Godly to troubleshoot and resolve the CORS and authentication issues' }
    ]
  },
  {
    member: 'Dr. Jayaram Nambiar',
    entries: [
      { ymd: '2026-11-17', summary: 'vibe coded an audio to transcript aligner and cutter' },
      {
        ymd: '2026-11-21',
        summary: 'performed a clinical quality audit on new visit summaries',
        blockers: 'Revisit template based ai summaries to be generated for re-visits'
      }
    ]
  }
];
const diaryReply = [
  '• Neena A Panicker',
  'On 2026-11-16, Neena A Panicker regenerated summary for gastroenterology new visits through admin console.',
  'On 2026-11-16, Neena A Panicker coordinated with Jose and Godly to troubleshoot and resolve the CORS and authentication issues.',
  '• Dr. Jayaram Nambiar',
  'On 2026-11-17, Dr. Jayaram Nambiar vibe coded an audio to transcript aligner and cutter.',
  'On 2026-11-21, Dr. Jayaram Nambiar performed a clinical quality audit on new visit summaries.',
  'Blocker: Revisit template based ai summaries to be generated for re-visits.'
].join('\n');
const cleanBullets = [
  '• Neena A Panicker',
  '- Regenerated the gastroenterology summaries and resolved the CORS and authentication issues with Jose and Godly.',
  '• Dr. Jayaram Nambiar',
  '- Built an audio to transcript aligner and cutter, then audited new-visit summaries.',
  '- Blocker: Revisit template based ai summaries to be generated for re-visits.'
].join('\n');
const cleanDecision = Logic.interpretWeeklySummaryAttempt(cleanBullets, false, diaryBlocks);
assert.strictEqual(cleanDecision.action, 'accept');
assert.strictEqual(cleanDecision.text.indexOf('On 2026-11-16'), -1);
const diaryDecision = Logic.interpretWeeklySummaryAttempt(diaryReply, false, diaryBlocks);
assert.strictEqual(diaryDecision.action, 'reject');
assert.strictEqual(Logic.weeklyStoredSummaryIsUsable(diaryReply, diaryBlocks), false);
assert.strictEqual(Logic.weeklyStoredSummaryIsUsable(cleanBullets, diaryBlocks), true);
const repaired = Logic.buildWeeklyChatMessage(
  'PRJ_VOX',
  '2026-11-16',
  '2026-11-22',
  diaryReply,
  diaryBlocks
);
assert.strictEqual(repaired.indexOf('On 2026-11-16'), -1);
assert.strictEqual(repaired.indexOf('On 2026-11-17'), -1);
const neenaRepaired = repaired.slice(
  repaired.indexOf('• Neena A Panicker'),
  repaired.indexOf('• Dr. Jayaram Nambiar')
);
assert.strictEqual((neenaRepaired.match(/Neena A Panicker/g) || []).length, 1);
assert.ok(neenaRepaired.indexOf('\n- ') >= 0);
assert.ok(neenaRepaired.indexOf('CORS') >= 0);
assert.strictEqual(neenaRepaired.indexOf('2026-11-'), -1);
const jayRepaired = repaired.slice(repaired.indexOf('• Dr. Jayaram Nambiar'));
assert.strictEqual((jayRepaired.match(/Dr\. Jayaram Nambiar/g) || []).length, 1);
assert.ok(jayRepaired.indexOf('\n- ') >= 0);
assert.ok(jayRepaired.indexOf('Blocker: Revisit template based ai summaries to be generated for re-visits.') >= 0);
assert.strictEqual(jayRepaired.indexOf('2026-11-'), -1);
const chain = Logic.selectWeeklyFallbackReply([
  { model: 'google/gemma-4-31b-it:free', text: diaryReply, truncated: false },
  { model: 'google/gemma-4-26b-a4b-it:free', text: cleanBullets, truncated: false }
], diaryBlocks);
assert.strictEqual(chain.status, 'accepted');
assert.strictEqual(chain.model, 'google/gemma-4-26b-a4b-it:free');
assert.strictEqual(chain.text.indexOf('On 2026-11-'), -1);
const exhaustedChain = Logic.selectWeeklyFallbackReply([
  { model: 'google/gemma-4-31b-it:free', text: diaryReply, truncated: false },
  { model: 'openrouter/free', text: '', truncated: false }
], diaryBlocks);
assert.strictEqual(exhaustedChain.status, 'exhausted');

console.log('logic.test.js passed');
