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
  { date: '2026-09-25', summary: 'Did the lab notes', space: 'TEAM_ALPHA' }
], '2026-09-25', 'TEAM_ALPHA'), true);
assert.strictEqual(Logic.hasUpdateForSpace([
  { date: '2026-09-25', summary: 'Did the lab notes', space: 'TEAM_ALPHA' }
], '2026-09-25', 'LAB_STATUS_NOTICE'), false);
assert.strictEqual(Logic.hasUpdateForSpace([
  { date: '2026-09-25', summary: '', space: 'TEAM_ALPHA' }
], '2026-09-25', 'TEAM_ALPHA'), false);
assert.strictEqual(Logic.hasUpdateForSpace([
  { date: '2026-09-24', summary: 'Yesterday', space: 'TEAM_ALPHA' }
], '2026-09-25', 'TEAM_ALPHA'), false);

const text = Logic.reminderText('TEAM_ALPHA', 'Fri, Sep 25, 2026', ['<users/1>', '*Ada*'], 'https://docs.google.com/spreadsheets/d/SHEET');
assert.ok(text.indexOf('Space: TEAM_ALPHA') >= 0);
assert.ok(text.indexOf('https://docs.google.com/spreadsheets/d/SHEET') >= 0);
assert.ok(text.indexOf('• <users/1>') >= 0);
assert.ok(text.indexOf('• *Ada*') >= 0);

const seeded = Logic.seedMatrix(
  ['Ada', 'Bea'],
  ['TEAM_ALPHA', 'TEAM_BETA'],
  {},
  { Ada: true, Bea: false }
);
assert.strictEqual(Array.from(seeded.headers).join('|'), 'Member|TEAM_ALPHA|TEAM_BETA');
assert.strictEqual(JSON.stringify(seeded.grid), JSON.stringify([
  ['Ada', true, false],
  ['Bea', false, false]
]));

const kept = Logic.seedMatrix(
  ['Ada'],
  ['TEAM_ALPHA', 'TEAM_BETA'],
  { Ada: { TEAM_BETA: true } },
  { Ada: true }
);
assert.strictEqual(JSON.stringify(kept.grid), JSON.stringify([['Ada', false, true]]));

const addedSpace = Logic.seedMatrix(
  ['Ada', 'Cy'],
  ['TEAM_ALPHA', 'TEAM_BETA'],
  { Ada: { TEAM_ALPHA: true } },
  { Cy: true }
);
assert.strictEqual(JSON.stringify(addedSpace.grid), JSON.stringify([
  ['Ada', true, false],
  ['Cy', false, false]
]));

const spaces = ['TEAM_ALPHA', 'TEAM_BETA'];
const spaceCol = 5;
assert.strictEqual(Logic.needsSpacePrompt([1], spaceCol, '2026-09-25', '2026-09-25', '', spaces), true);
assert.strictEqual(Logic.needsSpacePrompt([1], spaceCol, '2026-09-25', '2026-09-25', 'Not A Space', spaces), true);
assert.strictEqual(Logic.needsSpacePrompt([1], spaceCol, '2026-09-25', '2026-09-25', 'TEAM_ALPHA', spaces), false);
assert.strictEqual(Logic.needsSpacePrompt([5], spaceCol, '2026-09-25', '2026-09-25', '', spaces), false);
assert.strictEqual(Logic.needsSpacePrompt([1, 5], spaceCol, '2026-09-25', '2026-09-25', 'TEAM_BETA', spaces), false);
assert.strictEqual(Logic.needsSpacePrompt([1], spaceCol, '2026-09-24', '2026-09-25', '', spaces), false);
assert.strictEqual(Logic.needsSpacePrompt([1], spaceCol, '2026-09-26', '2026-09-25', '', spaces), false);
assert.strictEqual(Logic.needsSpacePrompt([1], spaceCol, '', '2026-09-25', '', spaces), false);

assert.strictEqual(Logic.formatSpaceList(['TEAM_BETA', 'TEAM_ALPHA', 'TEAM_ALPHA']), 'TEAM_ALPHA, TEAM_BETA');
assert.strictEqual(Logic.parseSpaceList('TEAM_ALPHA, TEAM_BETA').join('|'), 'TEAM_ALPHA|TEAM_BETA');
assert.strictEqual(Logic.isNamedProjectSpace('SPACE', 'TEAM_ALPHA'), true);
assert.strictEqual(Logic.isNamedProjectSpace('SPACE', 'Meeting started'), false);
assert.strictEqual(Logic.isNamedProjectSpace('GROUP_CHAT', 'TEAM_ALPHA'), false);
assert.strictEqual(Logic.chatUserKey('<users/105>'), 'users/105');
const access = Logic.spacesForMember('users/105', { TEAM_ALPHA: { 'users/105': true }, TEAM_BETA: {} });
assert.strictEqual(access.join('|'), 'TEAM_ALPHA');
const keptGrid = Logic.seedMatrix(['Ada'], ['TEAM_ALPHA', 'TEAM_BETA'], { Ada: { TEAM_ALPHA: true, TEAM_BETA: true } }, {}).grid;
const limited = Logic.applyMembership(keptGrid, ['TEAM_ALPHA', 'TEAM_BETA'], { Ada: ['TEAM_ALPHA'] }, true);
assert.strictEqual(JSON.stringify(limited), JSON.stringify([['Ada', true, '']]));
const untouched = Logic.applyMembership(keptGrid, ['TEAM_ALPHA', 'TEAM_BETA'], { Ada: [] }, false);
assert.strictEqual(JSON.stringify(untouched), JSON.stringify([['Ada', true, true]]));

assert.strictEqual(Logic.truncateText('abcdef', 10), 'abcdef');
assert.ok(Logic.truncateText('abcdefghijklmnop', 12).indexOf('…[truncated]') >= 0);
const prompt = Logic.buildWeeklySummaryUserPrompt('TEAM_ALPHA', '2026-09-14', '2026-09-20', [
  {
    label: '*Ada*',
    text: '• Wed, Sep 16: followed up\n• Mon, Sep 14: shipped login',
    entries: [
      { ymd: '2026-09-16', line: '• Wed, Sep 16: followed up' },
      { ymd: '2026-09-14', line: '• Mon, Sep 14: shipped login' }
    ]
  }
]);
assert.ok(prompt.indexOf('Space: TEAM_ALPHA') >= 0);
assert.ok(prompt.indexOf('shipped login') >= 0);
assert.ok(prompt.indexOf('[2026-09-14]') >= 0);
assert.ok(prompt.indexOf('[2026-09-16]') >= 0);
assert.ok(prompt.indexOf('chronologically') >= 0);
assert.ok(
  prompt.indexOf('[2026-09-14]') < prompt.indexOf('[2026-09-16]'),
  'dated entries should be sorted ascending for chronology'
);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('[YYYY-MM-DD]') >= 0);
assert.ok(Logic.WEEKLY_SUMMARY_SYSTEM.indexOf('chronological') >= 0);
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
const promptFallback = Logic.buildWeeklySummaryUserPrompt('TEAM_ALPHA', '2026-09-14', '2026-09-20', [
  { label: '*Ada*', text: '• Mon: shipped login' }
]);
assert.ok(promptFallback.indexOf('shipped login') >= 0);
assert.strictEqual(
  Logic.extractOpenRouterText({ choices: [{ message: { content: '  • Done\n• More  ' } }] }),
  '• Done\n• More'
);
assert.strictEqual(Logic.sanitizeWeeklySummary(''), '');
const chat = Logic.buildWeeklyChatMessage(
  'TEAM_ALPHA',
  '2026-09-14',
  '2026-09-20',
  '• Login shipped',
  [{ label: '*Ada*', text: '• Mon: shipped login' }]
);
assert.ok(chat.indexOf('• Login shipped') >= 0);
assert.ok(chat.indexOf('*By member*') < 0);
assert.ok(chat.indexOf('*Ada*') < 0);
const chatNoAi = Logic.buildWeeklyChatMessage(
  'TEAM_ALPHA',
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

console.log('logic.test.js passed');
