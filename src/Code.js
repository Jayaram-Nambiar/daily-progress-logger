/*******************************************************
 * Daily Progress → Google Chat (incoming webhook)
 * Slack code remains, but SLACK_ENABLED is false.
 * -----------------------------------------------------------
 * Team: Name | Slack | Email | Chat | Spaces
 * Reminder Matrix: Member | one checkbox column per Chat space
 * Chat Spaces: Space | Space id | Webhook property | Configured
 * Per-member tabs: Date | Summary | Hours | Blockers | Tomorrow Plan | Space
 * Weekly Rollup: Week Start | Week End | Space | Member | Weekly Summary
 * Weekly Space Summaries: Week Start | Week End | Space | LLM Summary
 * Schedules: Reminder | Daily post | Weekly roll-up | Space access
 *
 * Chat column: <users/USER_ID> to ping that person. Blank shows *Name*.
 * Spaces column: multi-select chip dropdown from Chat Spaces!A2:A.
 * Menu "Apply Team spaces to reminder matrix" applies column E to the matrix.
 * Monday weekly posts may send an OpenRouter summary-only message per
 * configured webhook space when OPENROUTER_API_KEY is set. Failures fall
 * back to the member detail text. Default models:
 * google/gemma-4-31b-it:free then qwen/qwen3.8-27b:free, then openrouter/free.
 * Final fallback: post the space's member week text unchanged.
 * The script never calls the Google Chat API and stays on the default GCP project.
 * Webhook URLs and API keys are Script Properties, not source.
 * EXAMPLE_ROSTER, EXAMPLE_SPACE_ROWS, and EXAMPLE_CHAT_USER_IDS are fictional.
 * Replace them with your own team before you rely on provision.
 * Design notes: docs/architecture.md and docs/decisions/001-incoming-webhooks.md.
 *******************************************************/

const TZ = 'Asia/Kolkata';
const SLACK_ENABLED = false;
const SHEETS = {
  TEAM: 'Team',
  WEEKLY: 'Weekly Rollup',
  WEEKLY_AI: 'Weekly Space Summaries',
  SPACES: 'Chat Spaces',
  MATRIX: 'Reminder Matrix',
  SCHEDULES: 'Schedules'
};
const PROP_KEYS = {
  WEBHOOK: 'SLACK_WEBHOOK_URL',
  CHAT_WEBHOOK: 'GOOGLE_CHAT_WEBHOOK_URL',
  OPENROUTER_KEY: 'OPENROUTER_API_KEY',
  OPENROUTER_MODEL: 'OPENROUTER_MODEL',
  OPENROUTER_ENABLED: 'OPENROUTER_ENABLED'
};
const DEFAULT_OPENROUTER_MODELS =
  'google/gemma-4-31b-it:free,qwen/qwen3.8-27b:free';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TEAM_HEADERS = ['Name', 'Slack', 'Email', 'Chat'];
const SCHEDULE_HEADERS = ['Job', 'Enabled', 'Days', 'Hour', 'Minute'];
const SCHEDULE_DEFAULTS = [
  ['Reminder', true, 'Mon,Tue,Wed,Thu,Fri', 18, 0],
  ['Daily post', true, 'Mon,Tue,Wed,Thu,Fri', 19, 0],
  ['Weekly roll-up', true, 'Mon', 9, 0],
  ['Space access', true, 'Mon,Tue,Wed,Thu,Fri', 8, 0]
];
const SCHEDULE_HANDLERS = {
  'Reminder': 'sendReminder_trigger',
  'Daily post': 'postDailyUpdatesToChat_trigger',
  'Weekly roll-up': 'weeklyRollup_trigger',
  'Space access': 'refreshSpaceAccess_trigger'
};

const MEMBER_HEADERS = ['Date', 'Summary', 'Hours', 'Blockers', 'Tomorrow Plan', 'Space'];
const SPACE_HEADERS = ['Space', 'Space id', 'Webhook property', 'Configured'];
const WEEKLY_HEADERS = ['Week Start', 'Week End', 'Space', 'Member', 'Weekly Summary'];
const WEEKLY_AI_HEADERS = ['Week Start', 'Week End', 'Space', 'LLM Summary'];

const HEADER_NOTES = {
  'Date':
    'Ideal: yyyy-mm-dd (IST). Double-click to open date picker.\n' +
    'Common formats are also parsed.',
  'Summary':
    'Crisp bullets or short lines. Links/PRs ok.',
  'Hours':
    'Accepted formats (case-insensitive):\n' +
    '• Decimal: 2, 1.5\n' +
    '• H:MM: 1:30, 0:45\n' +
    '• Hours: 8h, 8 hr, 8hrs, 8 hour, 8 hours, 8H\n' +
    '• Minutes: 15m, 15 min, 15 mins, 15 minute, 15 minutes, 15M\n' +
    '• Mixed: 1h 30m, 1 hr 30 mins, 1HR 30MIN, 1h30, 30min 1hr, 1 hr, 05\n' +
    'Tip: Spaces and commas are fine (e.g., "1 hr, 30 mins").',
  'Blockers':
    'Short phrases; @mention people or add links if needed.',
  'Tomorrow Plan':
    'Planned focus next day. Keep concise.',
  'Space':
    'Project space that should receive this row. Pick from the list. ' +
    'A blank Space is not posted to any Google Chat space.'
};

/* -------------------- Menus -------------------- */

function onOpen() {
  const menu = SpreadsheetApp.getUi().createMenu('Daily Progress')
    .addItem('Add or update member', 'addOrUpdateMember')
    .addItem('Sync member sheets', 'syncMemberSheets')
    .addItem('Bootstrap roster, spaces & sheets', 'provisionRosterFromMenu')
    .addSeparator()
    .addItem('Set Chat webhook…', 'setGoogleChatWebhookForSpace')
    .addItem('Test Chat webhooks', 'testAllGoogleChatWebhooks')
    .addItem('Post today’s updates now', 'postDailyUpdatesToChat')
    .addItem('Send reminders now', 'sendReminderNow')
    .addItem('Run weekly roll-up now', 'runWeeklyRollupNow')
    .addSeparator()
    .addItem('Sync reminder matrix', 'syncReminderMatrixFromMenu')
    .addItem('Apply Team spaces to reminder matrix', 'refreshSpaceAccess')
    .addSeparator()
    .addItem('Apply schedules from sheet', 'applySchedulesFromMenu')
    .addItem('Set OpenRouter API key', 'setOpenRouterApiKey');
  if (SLACK_ENABLED) {
    menu.addSeparator()
      .addItem('Set Slack webhook URL', 'setSlackWebhookUrl')
      .addItem('Test Slack webhook', 'testSlackWebhook')
      .addItem('Install daily 8:30 PM IST Slack post', 'installDailyTrigger_2030IST')
      .addItem('Post today’s Slack summary now', 'postTodaysSummary')
      .addItem('Remove daily Slack post trigger', 'removeDailyTriggers');
  }
  menu.addToUi();
}

/* -------------------- Setup -------------------- */

/** Ensures Team / Schedules / Reminder Matrix exist. Prefer Bootstrap from the menu. */
function setupBaseSheets() {
  const team = ensureTeamSheet_();
  const existing = readTeamRows_(team);
  if (!existing.length) {
    team.getRange(2, 1, 1, TEAM_HEADERS.length).setValues([[
      'Jane Doe',
      '<@U123ABCDEF>',
      'jane@example.com',
      '<users/123456789>'
    ]]);
  }
  autoResize_(team);
  ensureSchedulesSheet_();
  syncReminderMatrix_();
  SpreadsheetApp.getUi().alert(existing.length
    ? 'Team headers, Schedules, and Reminder Matrix are in place. Existing members were kept.'
    : 'Base sheets created with one example Team row. Use Add or update member, or Bootstrap roster, spaces & sheets.');
}

function addOrUpdateMember() {
  const ui = SpreadsheetApp.getUi();
  const nameResp = ui.prompt('Member name', 'Full name. This becomes the personal sheet tab. Matching names are updated.', ui.ButtonSet.OK_CANCEL);
  if (nameResp.getSelectedButton() !== ui.Button.OK) return;
  const name = (nameResp.getResponseText() || '').trim();
  if (!name) { ui.alert('Name is required.'); return; }

  const chatResp = ui.prompt('Google Chat user id', 'Optional. Paste <users/ID> or the numeric id to ping them in the space. Cancel aborts.', ui.ButtonSet.OK_CANCEL);
  if (chatResp.getSelectedButton() !== ui.Button.OK) return;
  const emailResp = ui.prompt('Email', 'Optional. Used only for the reminder email. Cancel aborts.', ui.ButtonSet.OK_CANCEL);
  if (emailResp.getSelectedButton() !== ui.Button.OK) return;

  const chat = normalizeChatMention_(chatResp.getResponseText());
  const email = (emailResp.getResponseText() || '').trim();
  const team = ensureTeamSheet_();
  const existing = readTeamRows_(team).find(m => m.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    renameMatrixMember_(existing.name, name);
    team.getRange(existing.row, 1).setValue(name);
    team.getRange(existing.row, 3).setValue(email);
    team.getRange(existing.row, 4).setValue(chat);
  } else {
    team.appendRow([name, '', email, chat]);
  }
  applyTeamSpacesDropdown_(team);
  syncReminderMatrix_();
  syncOneMember_(name);
  autoResize_(team);
  ui.alert(existing ? `Updated ${name}. Slack id was left unchanged.` : `Added ${name} and created their sheet.`);
}

function syncMemberSheets() {
  const team = ensureTeamSheet_();
  const names = readTeamRows_(team).map(m => m.name);

  names.forEach(name => syncOneMember_(name));
  SpreadsheetApp.getUi().alert(`Synced ${names.length} member sheet(s). (No data cleared)`);
}

function syncOneMember_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tab = sanitizeSheetName_(name);
  let sh = ss.getSheetByName(tab);
  if (!sh) {
    sh = ss.insertSheet(tab);
    sh.getRange(1, 1, 1, MEMBER_HEADERS.length).setValues([MEMBER_HEADERS]).setFontWeight('bold');
  } else {
    const want = MEMBER_HEADERS;
    const have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), want.length)).getValues()[0];
    want.forEach((h, i) => {
      if ((have[i] || '').toString().trim() !== h) {
        sh.getRange(1, i + 1).setValue(h);
      }
    });
  }

  sh.setFrozenRows(1);
  setDatePickerValidation_(sh, 'A2:A');
  applyTableLook_(sh, MEMBER_HEADERS.length);
  safeSetNumberFormat_(sh, 'A2:A', 'yyyy-mm-dd');
  sh.getRange('B2:B').setWrap(true);
  MEMBER_HEADERS.forEach((h, i) => sh.getRange(1, i + 1).setNote(HEADER_NOTES[h] || ''));
  applySpaceDropdown_(sh);
  autoResize_(sh);
}

const EXAMPLE_ROSTER = [
  ['Alex Rivera', 'alex.rivera@example.com'],
  ['Sam Chen', 'sam.chen@example.com'],
  ['Jordan Patel', 'jordan.patel@example.com']
];

const EXAMPLE_SPACE_ROWS = [
  ['TEAM_ALPHA', 'EXAMPLESPACEALPHA', 'GOOGLE_CHAT_WEBHOOK_URL', false],
  ['TEAM_BETA', 'EXAMPLESPACEBETA1', 'GOOGLE_CHAT_WEBHOOK_TEAM_BETA', false],
  ['TEAM_GAMMA', 'EXAMPLESPACEGAMMA', 'GOOGLE_CHAT_WEBHOOK_TEAM_GAMMA', false]
];

function provisionRosterFromMenu() {
  provisionRosterSpacesAndSheets();
  const n = readTeamRows_(ensureTeamSheet_()).length;
  const spaces = SpreadsheetApp.getActive().getSheetByName(SHEETS.SPACES);
  const spaceCount = spaces ? Math.max(0, spaces.getLastRow() - 1) : 0;
  SpreadsheetApp.getUi().alert(
    'Bootstrap finished: ' + n + ' Team member(s), ' + spaceCount + ' Chat space(s). ' +
    'Existing rows were kept. Fill Team column E, then run Apply Team spaces to reminder matrix.'
  );
}

function provisionRosterSpacesAndSheets() {
  const ss = SpreadsheetApp.getActive();
  const team = ensureTeamSheet_();
  const byEmail = {};
  readTeamRows_(team).forEach(m => {
    if (m.email) byEmail[m.email.toLowerCase()] = m;
  });

  EXAMPLE_ROSTER.forEach(pair => {
    const name = pair[0];
    const email = pair[1].toLowerCase();
    const existing = byEmail[email];
    if (!existing) {
      team.appendRow([name, '', email, '']);
      return;
    }
    const oldTab = sanitizeSheetName_(existing.name);
    const newTab = sanitizeSheetName_(name);
    if (oldTab !== newTab) {
      const oldSheet = ss.getSheetByName(oldTab);
      const newSheet = ss.getSheetByName(newTab);
      if (oldSheet && !newSheet) oldSheet.setName(newTab);
    }
    renameMatrixMember_(existing.name, name);
    team.getRange(existing.row, 1).setValue(name);
    team.getRange(existing.row, 3).setValue(email);
  });

  ensureChatSpacesSheet_(EXAMPLE_SPACE_ROWS);
  fillChatMentions_();
  syncReminderMatrix_();
  ensureSchedulesSheet_();
  readTeamRows_(team).forEach(m => syncOneMember_(m.name));
}

// Fictional Chat user ids for the example roster. Replace with your own.
const EXAMPLE_CHAT_USER_IDS = {
  'alex.rivera@example.com': '900000000000000000001',
  'sam.chen@example.com': '900000000000000000002',
  'jordan.patel@example.com': '900000000000000000003'
};

function fillChatMentions_() {
  const team = ensureTeamSheet_();
  readTeamRows_(team).forEach(m => {
    const id = EXAMPLE_CHAT_USER_IDS[(m.email || '').toLowerCase()];
    if (!id) return;
    if (/^<users\/\d+>$/i.test(normalizeChatMention_(m.chat))) return;
    team.getRange(m.row, 4).setValue(`<users/${id}>`);
  });
}

function ensureChatSpacesSheet_(rows) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEETS.SPACES);
  if (!sh) sh = ss.insertSheet(SHEETS.SPACES);
  SPACE_HEADERS.forEach((h, i) => {
    sh.getRange(1, i + 1).setValue(h).setFontWeight('bold');
  });
  sh.setFrozenRows(1);
  sh.getRange(1, 3).setNote('Script Property name that holds this space webhook. The URL is not stored on this sheet.');
  const known = {};
  const last = sh.getLastRow();
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach((r, i) => {
      const name = (r[0] || '').toString().trim();
      if (name) known[name] = i + 2;
    });
  }
  rows.forEach(row => {
    const at = known[row[0]];
    if (at) {
      if (!sh.getRange(at, 2).getValue() && row[1]) sh.getRange(at, 2).setValue(row[1]);
      if (!sh.getRange(at, 3).getValue()) sh.getRange(at, 3).setValue(row[2]);
      return;
    }
    sh.appendRow(row);
  });
  const bodyRows = Math.max(sh.getLastRow() - 1, 1);
  sh.getRange(2, 4, bodyRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build()
  );
  autoResize_(sh);
  return sh;
}

function syncReminderMatrixFromMenu() {
  const result = syncReminderMatrix_();
  SpreadsheetApp.getUi().alert(`Reminder matrix has ${result.members} member(s) and ${result.spaces} space(s). Existing checks were kept.`);
}

function renameMatrixMember_(oldName, newName) {
  if (!oldName || oldName === newName) return;
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.MATRIX);
  if (!sh || sh.getLastRow() < 2) return;
  const names = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  names.forEach((row, i) => {
    if (String(row[0] || '').trim() === oldName) sh.getRange(i + 2, 1).setValue(newName);
  });
}

function syncReminderMatrix_() {
  const ss = SpreadsheetApp.getActive();
  const team = ensureTeamSheet_();
  const legacy = legacyRemindByName_(team);
  ensureChatSpacesSheet_(EXAMPLE_SPACE_ROWS);
  const spaces = ss.getSheetByName(SHEETS.SPACES);
  const spaceNames = spaces && spaces.getLastRow() >= 2
    ? spaces.getRange(2, 1, spaces.getLastRow() - 1, 1).getValues().map(r => String(r[0] || '').trim()).filter(Boolean)
    : [];
  const members = readTeamRows_(team).map(m => m.name);
  let sh = ss.getSheetByName(SHEETS.MATRIX);
  if (!sh) sh = ss.insertSheet(SHEETS.MATRIX);
  const existing = {};
  if (sh.getLastRow() >= 1 && sh.getLastColumn() >= 1) {
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
    if (sh.getLastRow() >= 2) {
      sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(row => {
        const name = String(row[0] || '').trim();
        if (!name) return;
        existing[name] = {};
        headers.slice(1).forEach((space, i) => {
          if (space) existing[name][space] = row[i + 1] === true;
        });
      });
    }
  }
  const seeded = Logic.applyMembership(
    Logic.seedMatrix(members, spaceNames, existing, legacy).grid,
    spaceNames,
    readMemberSpaceLists_(team),
    spaceAccessSynced_()
  );
  sh.clear();
  sh.getRange(1, 1, 1, spaceNames.length + 1).setValues([['Member'].concat(spaceNames)]).setFontWeight('bold');
  if (seeded.length) sh.getRange(2, 1, seeded.length, spaceNames.length + 1).setValues(seeded);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  if (seeded.length && spaceNames.length) {
    const checkbox = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    const rules = seeded.map(row => spaceNames.map((_, index) => row[index + 1] === '' ? null : checkbox));
    sh.getRange(2, 2, seeded.length, spaceNames.length).setDataValidations(rules);
  }
  sh.getRange(1, 1).setNote('A checkbox is shown only when this member belongs to that space. Checked: remind them there if they have no summary for that space today.');
  autoResize_(sh);
  if (legacy) {
    const headers = team.getRange(1, 1, 1, team.getLastColumn()).getValues()[0];
    const col = headers.findIndex(h => String(h || '').trim() === 'Remind');
    if (col >= 0) team.deleteColumn(col + 1);
  }
  return { members: members.length, spaces: spaceNames.length };
}

function legacyRemindByName_(team) {
  const width = team.getLastColumn();
  if (width < 1) return null;
  const headers = team.getRange(1, 1, 1, width).getValues()[0];
  const col = headers.findIndex(h => String(h || '').trim() === 'Remind');
  if (col < 0 || team.getLastRow() < 2) return col < 0 ? null : {};
  const map = {};
  team.getRange(2, 1, team.getLastRow() - 1, col + 1).getValues().forEach(row => {
    const name = String(row[0] || '').trim();
    if (name) map[name] = row[col] === true;
  });
  return map;
}

function readReminderMatrix_(ss) {
  const sh = ss.getSheetByName(SHEETS.MATRIX);
  const out = {};
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 2) return out;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(row => {
    const name = String(row[0] || '').trim();
    if (!name) return;
    out[name] = {};
    headers.slice(1).forEach((space, i) => {
      if (space) out[name][space] = row[i + 1] === true;
    });
  });
  return out;
}

function ensureSchedulesSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEETS.SCHEDULES);
  if (!sh) sh = ss.insertSheet(SHEETS.SCHEDULES);
  SCHEDULE_HEADERS.forEach((h, i) => sh.getRange(1, i + 1).setValue(h).setFontWeight('bold'));
  sh.setFrozenRows(1);
  const known = {};
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach((row, i) => {
      const job = String(row[0] || '').trim();
      if (job) known[job] = i + 2;
    });
  }
  SCHEDULE_DEFAULTS.forEach(row => {
    if (!known[row[0]]) sh.appendRow(row);
  });
  const body = Math.max(sh.getLastRow() - 1, 1);
  sh.getRange(2, 2, body, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sh.getRange(1, 3).setNote('Comma-separated: Mon,Tue,Wed,Thu,Fri,Sat,Sun');
  sh.getRange(1, 5).setNote('Apps Script only accepts 0, 15, 30, or 45. The trigger can run up to about 15 minutes from that minute.');
  autoResize_(sh);
  return sh;
}

function readSchedules_(ss) {
  const sh = ss.getSheetByName(SHEETS.SCHEDULES) || ensureSchedulesSheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().map(row => ({
    job: String(row[0] || '').trim(),
    enabled: row[1] === true,
    days: String(row[2] || '').trim(),
    hour: Number(row[3]),
    minute: Number(row[4])
  })).filter(row => SCHEDULE_HANDLERS[row.job]);
}

function scheduleAllows_(jobName) {
  const row = readSchedules_(SpreadsheetApp.getActive()).find(item => item.job === jobName);
  if (!row || !row.enabled) return false;
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  return Logic.isScheduledDay(row.days, ymdToDate_(today).getDay());
}

function installSchedulesFromSheet_() {
  const ss = SpreadsheetApp.getActive();
  ensureSchedulesSheet_();
  const handlers = Object.values(SCHEDULE_HANDLERS).concat(['postTodaysSummary_trigger']);
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlers.indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger);
  });
  const weekdays = {
    Sun: ScriptApp.WeekDay.SUNDAY,
    Mon: ScriptApp.WeekDay.MONDAY,
    Tue: ScriptApp.WeekDay.TUESDAY,
    Wed: ScriptApp.WeekDay.WEDNESDAY,
    Thu: ScriptApp.WeekDay.THURSDAY,
    Fri: ScriptApp.WeekDay.FRIDAY,
    Sat: ScriptApp.WeekDay.SATURDAY
  };
  readSchedules_(ss).forEach(row => {
    const check = Logic.validateSchedule(row.days, row.hour, row.minute);
    if (!row.enabled || !check.ok) return;
    const handler = SCHEDULE_HANDLERS[row.job];
    if (row.job === 'Weekly roll-up') {
      check.days.forEach(day => {
        ScriptApp.newTrigger(handler).timeBased().onWeekDay(weekdays[day]).atHour(check.hour).nearMinute(check.minute).create();
      });
      return;
    }
    ScriptApp.newTrigger(handler).timeBased().atHour(check.hour).nearMinute(check.minute).everyDays(1).create();
  });
}

function installOperationalTriggers_() {
  installSchedulesFromSheet_();
}

function applySchedulesFromMenu() {
  installSchedulesFromSheet_();
  const lines = readSchedules_(SpreadsheetApp.getActive()).map(row => {
    if (!row.enabled) return row.job + ': disabled (edit the Schedules sheet to enable)';
    const check = Logic.validateSchedule(row.days, row.hour, row.minute);
    if (!check.ok) return row.job + ': not installed. ' + check.error;
    return row.job + ': ' + row.days + ' at ' +
      Logic.formatClockTime(row.hour, row.minute) + ' IST';
  });
  SpreadsheetApp.getUi().alert(
    'Triggers reinstalled from the Schedules sheet.\n' +
    'Edit that sheet (days / hour / minute / Enabled), then run this again.\n\n' +
    lines.join('\n')
  );
}

function promptSchedule_(jobName) {
  const ui = SpreadsheetApp.getUi();
  const daysResp = ui.prompt(jobName + ' days', 'Comma-separated weekdays, such as Mon,Tue,Wed,Thu,Fri. Cancel aborts.', ui.ButtonSet.OK_CANCEL);
  if (daysResp.getSelectedButton() !== ui.Button.OK) return;
  const hourResp = ui.prompt(jobName + ' hour', 'Whole hour from 0 to 23, Asia/Kolkata. Cancel aborts.', ui.ButtonSet.OK_CANCEL);
  if (hourResp.getSelectedButton() !== ui.Button.OK) return;
  const minuteResp = ui.prompt(jobName + ' minute', 'Use 0, 15, 30, or 45. Cancel aborts.', ui.ButtonSet.OK_CANCEL);
  if (minuteResp.getSelectedButton() !== ui.Button.OK) return;
  const check = Logic.validateSchedule(daysResp.getResponseText(), Number(hourResp.getResponseText()), Number(minuteResp.getResponseText()));
  if (!check.ok) { ui.alert(check.error); return; }
  const sh = ensureSchedulesSheet_();
  const values = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  let at = values.findIndex(row => String(row[0] || '').trim() === jobName);
  const stored = [jobName, true, check.days.join(','), check.hour, check.minute];
  if (at < 0) sh.appendRow(stored);
  else sh.getRange(at + 2, 1, 1, 5).setValues([stored]);
  installSchedulesFromSheet_();
  ui.alert(jobName + ' will run on ' + check.days.join(',') + ' at ' + check.hour + ':' + String(check.minute).padStart(2, '0') + ' IST. Apps Script may start it up to about 15 minutes from that minute.');
}

function setReminderSchedule() { promptSchedule_('Reminder'); }
function setDailyPostSchedule() { promptSchedule_('Daily post'); }
function setWeeklyRollupSchedule() { promptSchedule_('Weekly roll-up'); }
function setSpaceAccessSchedule() { promptSchedule_('Space access'); }

function refreshSpaceAccess() {
  const result = refreshSpaceAccess_();
  const ui = SpreadsheetApp.getUi();
  if (result.empty) {
    ui.alert('The Spaces column is empty. Pick Chat spaces from the multi-select dropdown on Team column E (sourced from Chat Spaces), then run this again.');
    return;
  }
  ui.alert('Reminder matrix updated from the Spaces column for ' + result.members + ' member(s).');
}

function refreshSpaceAccess_trigger() {
  if (!scheduleAllows_('Space access')) return;
  refreshSpaceAccess_();
}

function refreshSpaceAccess_() {
  const team = ensureTeamSheet_();
  const lists = readMemberSpaceLists_(team);
  const filled = Object.keys(lists).some(name => lists[name].length);
  if (!filled) return { members: 0, empty: true };
  PropertiesService.getScriptProperties().setProperty('SPACE_ACCESS_SYNCED', '1');
  const matrix = syncReminderMatrix_();
  return { members: matrix.members, empty: false };
}

function writeMemberSpaceColumn_(spaceMembers) {
  const team = ensureTeamSheet_();
  const members = readTeamRows_(team);
  if (!members.length) return;
  members.forEach(member => {
    team.getRange(member.row, 5).setValue(
      Logic.formatSpaceList(Logic.spacesForMember(Logic.chatUserKey(member.chat), spaceMembers))
    );
  });
}

function spaceAccessSynced_() {
  return PropertiesService.getScriptProperties().getProperty('SPACE_ACCESS_SYNCED') === '1';
}

function readMemberSpaceLists_(team) {
  const width = team.getLastColumn();
  const headers = width >= 1 ? team.getRange(1, 1, 1, width).getValues()[0] : [];
  const col = headers.findIndex(header => String(header || '').trim() === 'Spaces');
  const map = {};
  if (col < 0 || team.getLastRow() < 2) return map;
  team.getRange(2, 1, team.getLastRow() - 1, col + 1).getValues().forEach(row => {
    const name = String(row[0] || '').trim();
    if (name) map[name] = Logic.parseSpaceList(row[col]);
  });
  return map;
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getLastColumn() < MEMBER_HEADERS.length) return;
  const headers = sheet.getRange(1, 1, 1, MEMBER_HEADERS.length).getValues()[0]
    .map(cell => String(cell || '').trim());
  if (MEMBER_HEADERS.some((header, i) => headers[i] !== header)) return;

  const spaceCol = MEMBER_HEADERS.indexOf('Space');
  const startRow = e.range.getRow();
  const numRows = e.range.getNumRows();
  const startCol = e.range.getColumn() - 1;
  const editedCols = [];
  for (let c = 0; c < e.range.getNumColumns(); c++) editedCols.push(startCol + c);

  const firstData = Math.max(startRow, 2);
  const lastData = startRow + numRows - 1;
  if (lastData < 2) return;

  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const spacesSheet = e.source.getSheetByName(SHEETS.SPACES);
  const valid = spacesSheet && spacesSheet.getLastRow() >= 2
    ? spacesSheet.getRange(2, 1, spacesSheet.getLastRow() - 1, 1).getValues()
      .map(row => String(row[0] || '').trim()).filter(Boolean)
    : [];
  const values = sheet.getRange(firstData, 1, lastData - firstData + 1, MEMBER_HEADERS.length).getValues();
  const prompt = values.some(row => Logic.needsSpacePrompt(
    editedCols, spaceCol, normalizeDateOnly_(row[0]), today, row[spaceCol], valid
  ));
  if (!prompt) return;
  e.source.toast(
    'Space chooses which Google Chat space receives this row in the daily post. Pick a name from the dropdown. A blank or invalid Space is not posted.',
    'Choose a Space for today',
    8
  );
}

function applySpaceDropdown_(sheet) {
  const spaces = sheet.getParent().getSheetByName(SHEETS.SPACES);
  if (!spaces) return;
  const col = MEMBER_HEADERS.indexOf('Space') + 1;
  const height = Math.max(sheet.getMaxRows() - 1, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(spaces.getRange('A2:A'), true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, col, height, 1).setDataValidation(rule);
}

/**
 * Copy the Team Spaces multi-select chip rule down column E.
 * Apps Script and the Sheets API cannot create "Allow multiple selections".
 * That flag is set once in the sheet UI (Dropdown from Chat Spaces!A2:A).
 * Calling setDataValidation here would replace chips with a single-select
 * arrow list, so this only PASTE_DATA_VALIDATION from E2.
 */
function applyTeamSpacesDropdown_(team) {
  if (!team || team.getMaxRows() < 2) return;
  const template = team.getRange(2, 5);
  if (!template.getDataValidation()) return;
  const height = Math.max(team.getMaxRows() - 1, 1);
  template.copyTo(
    team.getRange(2, 5, height, 1),
    SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,
    false
  );
}

function postDailyUpdatesToChat() {
  postDailyUpdatesToChat_({ silent: false });
}

function postDailyUpdatesToChat_trigger() {
  if (!scheduleAllows_('Daily post')) return;
  postDailyUpdatesToChat_({ silent: true });
}

function postDailyUpdatesToChat_(opts) {
  const silent = !!(opts && opts.silent);
  const ss = SpreadsheetApp.getActive();
  const spaces = ss.getSheetByName(SHEETS.SPACES);
  const team = ss.getSheetByName(SHEETS.TEAM);
  if (!spaces || !team) {
    if (!silent) SpreadsheetApp.getUi().alert('Team or Chat Spaces sheet is missing.');
    return;
  }
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const members = readTeamRows_(team);
  const configured = readConfiguredSpaces_(ss);
  if (!configured.length) {
    if (!silent) SpreadsheetApp.getUi().alert('No Chat space has both Configured checked and a webhook property set.');
    return;
  }
  const spaceCol = MEMBER_HEADERS.indexOf('Space');
  const blocksBySpace = {};
  // One read per member. Reading the sheet again for every space makes
  // SpreadsheetApp fail with "a server error occurred" and posts nothing.
  members.forEach(m => {
    const sh = ss.getSheetByName(sanitizeSheetName_(m.name));
    if (!sh || sh.getLastRow() < 2) return;
    const n = sh.getLastRow() - 1;
    let rows;
    try {
      rows = sh.getRange(2, 1, n, MEMBER_HEADERS.length).getValues();
    } catch (e) {
      console.error('Daily post could not read ' + m.name + ': ' + ((e && e.message) ? e.message : e));
      return;
    }
    const linesBySpace = {};
    rows.forEach(row => {
      const rowDate = normalizeDateOnly_(row[0]);
      const summary = Logic.truncateText((row[1] || '').toString().trim(), 800);
      const spaceName = (row[spaceCol] || '').toString().trim();
      if (rowDate !== today || !summary || !spaceName) return;
      const hoursNum = parseHoursToNumber_(row[2]);
      const blockers = Logic.truncateText((row[3] || '').toString().trim(), 400);
      const plan = Logic.truncateText((row[4] || '').toString().trim(), 400);
      if (!linesBySpace[spaceName]) linesBySpace[spaceName] = [];
      let line = '– ' + summary;
      if (hoursNum) line += ` (${round1_(hoursNum)}h)`;
      if (blockers) line += ` • Blockers: ${blockers}`;
      linesBySpace[spaceName].push(line);
      if (plan) linesBySpace[spaceName].push('   → Tomorrow: ' + plan);
    });
    Object.keys(linesBySpace).forEach(spaceName => {
      if (!blocksBySpace[spaceName]) blocksBySpace[spaceName] = [];
      blocksBySpace[spaceName].push('• ' + chatLabel_(m));
      linesBySpace[spaceName].forEach(line => blocksBySpace[spaceName].push('   ' + line));
      blocksBySpace[spaceName].push('');
    });
  });

  let posted = 0;
  const failures = [];
  configured.forEach(space => {
    const blocks = blocksBySpace[space.name];
    if (!blocks || !blocks.length) return;
    const text = [`*Daily Progress — ${space.name} — ${today}*`, ''].concat(blocks).join('\n');
    try {
      sendToChat_(space.webhook, text);
      posted++;
    } catch (e) {
      const message = (e && e.message) ? e.message : String(e);
      failures.push({ name: space.name, error: message });
      console.error('Daily post failed for ' + space.name + ': ' + message);
      if (!silent) throw e;
    }
  });
  noteWebhookFailures_('Daily post', failures);

  if (!silent) {
    SpreadsheetApp.getUi().alert(posted
      ? `Posted today's updates to ${posted} configured space(s).`
      : 'No configured space had a matching update for today. Nothing was posted.');
  }
}

/* -------------------- Slack config & send -------------------- */

function setSlackWebhookUrl() {
  const ui = SpreadsheetApp.getUi();
  if (!SLACK_ENABLED) { ui.alert('Slack is disabled. Use Set Google Chat webhook URL.'); return; }
  const resp = ui.prompt('Slack Incoming Webhook URL', 'Paste the https://hooks.slack.com/services/... URL:', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const url = (resp.getResponseText() || '').trim();
  if (!/^https:\/\/hooks\.slack\.com\/services\//i.test(url)) {
    ui.alert('That does not look like a valid Incoming Webhook URL.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.WEBHOOK, url);
  ui.alert('Saved in Script Properties as SLACK_WEBHOOK_URL.');
}

function testSlackWebhook() {
  if (!SLACK_ENABLED) { SpreadsheetApp.getUi().alert('Slack is disabled.'); return; }
  const webhook = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.WEBHOOK);
  if (!webhook) { SpreadsheetApp.getUi().alert('Set Slack webhook URL first.'); return; }
  const now = new Date();
  const text = [
    '*Test from Google Sheets*',
    `Time: ${Utilities.formatDate(now, TZ, 'yyyy-MM-dd HH:mm z')}`,
    'This should render *bold*, _italics_, and mentions like <@U123ABC>.'
  ].join('\n');
  sendToSlack_(webhook, text);
  SpreadsheetApp.getUi().alert('Test sent. Check Slack.');
}

function sendToSlack_(webhook, text) {
  if (!SLACK_ENABLED || !webhook) return;
  const payload = {
    text, // fallback
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }]
  };
  UrlFetchApp.fetch(webhook, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

/* -------------------- Google Chat webhook -------------------- */

/** @deprecated Use setGoogleChatWebhookForSpace from the menu. Kept for older triggers/docs. */
function setGoogleChatWebhookUrl() {
  setGoogleChatWebhookForSpace();
}

function setGoogleChatWebhookForSpace() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  ensureChatSpacesSheet_(EXAMPLE_SPACE_ROWS);
  const spaces = ss.getSheetByName(SHEETS.SPACES);
  if (!spaces || spaces.getLastRow() < 2) {
    ui.alert('Chat Spaces sheet is missing.');
    return;
  }
  const rows = spaces.getRange(2, 1, spaces.getLastRow() - 1, 3).getValues()
    .map(r => ({
      name: String(r[0] || '').trim(),
      spaceId: String(r[1] || '').trim(),
      prop: String(r[2] || '').trim()
    }))
    .filter(r => r.name && r.prop);
  if (!rows.length) {
    ui.alert('No Chat Spaces rows with a webhook property name.');
    return;
  }
  const nameResp = ui.prompt(
    'Chat space name',
    'Exact name from Chat Spaces column A. Examples: ' + rows.slice(0, 3).map(r => r.name).join(', '),
    ui.ButtonSet.OK_CANCEL
  );
  if (nameResp.getSelectedButton() !== ui.Button.OK) return;
  const spaceName = String(nameResp.getResponseText() || '').trim();
  const row = rows.find(r => r.name === spaceName);
  if (!row) {
    ui.alert('No Chat Spaces row named "' + spaceName + '". Use the exact column A value.');
    return;
  }
  const urlResp = ui.prompt(
    'Webhook URL for ' + spaceName,
    'Open that space → Apps & integrations → Incoming webhooks → copy the URL for property ' + row.prop + '.',
    ui.ButtonSet.OK_CANCEL
  );
  if (urlResp.getSelectedButton() !== ui.Button.OK) return;
  const url = normalizeChatWebhookUrl_(urlResp.getResponseText());
  if (!isChatWebhookUrl_(url)) {
    ui.alert('That is not a Google Chat incoming webhook URL.');
    return;
  }
  const match = url.match(/\/spaces\/([^/]+)\/messages/i);
  if (row.spaceId && match && match[1] !== row.spaceId) {
    ui.alert(
      'That webhook is for space id ' + match[1] + ', but Chat Spaces lists ' + row.spaceId +
      ' for ' + spaceName + '. Recreate the webhook in the correct space.'
    );
    return;
  }
  PropertiesService.getScriptProperties().setProperty(row.prop, url);
  readConfiguredSpaces_(ss);
  ui.alert('Saved webhook for ' + spaceName + ' as Script Property ' + row.prop + '.');
}

/** @deprecated Use testAllGoogleChatWebhooks from the menu. */
function testGoogleChatWebhook() {
  testAllGoogleChatWebhooks();
}

function testAllGoogleChatWebhooks() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  ensureChatSpacesSheet_(EXAMPLE_SPACE_ROWS);
  const spaces = ss.getSheetByName(SHEETS.SPACES);
  if (!spaces || spaces.getLastRow() < 2) {
    ui.alert('Chat Spaces sheet is missing.');
    return;
  }
  const props = PropertiesService.getScriptProperties();
  const rows = spaces.getRange(2, 1, spaces.getLastRow() - 1, 3).getValues();
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm z');
  const ok = [];
  const bad = [];
  rows.forEach(r => {
    const name = String(r[0] || '').trim();
    const prop = String(r[2] || '').trim();
    if (!name || !prop) return;
    const webhook = props.getProperty(prop);
    if (!webhook) {
      bad.push(name + ' (missing property ' + prop + ')');
      return;
    }
    try {
      sendToChat_(webhook, '*Daily Progress webhook test*\nSpace: ' + name + '\nTime: ' + now);
      ok.push(name);
    } catch (e) {
      const message = (e && e.message) ? e.message : String(e);
      bad.push(name + ' — ' + message);
      console.error('Webhook test failed for ' + name + ': ' + message);
    }
  });
  readConfiguredSpaces_(ss);
  ui.alert(
    (ok.length ? ('OK (' + ok.length + '): ' + ok.join(', ') + '\n\n') : '') +
    (bad.length ? ('Failed (' + bad.length + '): ' + bad.join('\n')) : 'All listed webhooks responded.')
  );
}

function sendToChat_(webhook, text) {
  const url = normalizeChatWebhookUrl_(webhook);
  if (!url) throw new Error('Google Chat webhook URL is not set.');
  if (!isChatWebhookUrl_(url)) {
    throw new Error(
      'Google Chat webhook URL is invalid (missing key/token, or HTML-escaped &amp;). ' +
      'Re-save the Script Property with a normal & between query params.'
    );
  }
  const chunks = chunkChatText_(text, 3500);
  chunks.forEach(part => {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      payload: JSON.stringify({ text: part }),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      const body = String(res.getContentText() || '').slice(0, 180);
      throw new Error(
        'Google Chat webhook failed (HTTP ' + code + '). ' +
        'Re-copy the incoming webhook URL into the Script Property for this space. ' +
        body
      );
    }
  });
}

function dailyPostTimeLabel_() {
  const row = readSchedules_(SpreadsheetApp.getActive()).find(item => item.job === 'Daily post');
  if (!row || !row.enabled) return '';
  const clock = Logic.formatClockTime(row.hour, row.minute);
  return clock ? (clock + ' IST') : '';
}

function noteWebhookFailures_(jobLabel, failures) {
  if (!failures || !failures.length) return;
  const detail = failures.map(f => f.name + ': ' + f.error).join(' | ');
  console.error(jobLabel + ' webhook failures: ' + detail);
}

function isChatWebhookUrl_(url) {
  return /^https:\/\/chat\.googleapis\.com\/v1\/spaces\/[^/]+\/messages\?(?:[^#]*&)?key=[^&]+&token=[^&\s]+/i.test(url)
    || /^https:\/\/chat\.googleapis\.com\/v1\/spaces\/[^/]+\/messages\?(?:[^#]*&)?token=[^&]+&key=[^&\s]+/i.test(url);
}

function chunkChatText_(text, maxLen) {
  const src = (text || '').toString();
  if (src.length <= maxLen) return [src];
  const parts = [];
  let buf = '';
  src.split('\n').forEach(line => {
    const next = buf ? `${buf}\n${line}` : line;
    if (next.length > maxLen) {
      if (buf) parts.push(buf);
      buf = line.length > maxLen ? line.slice(0, maxLen) : line;
    } else {
      buf = next;
    }
  });
  if (buf) parts.push(buf);
  return parts.length ? parts : [src.slice(0, maxLen)];
}

/* -------------------- Daily POST (8:30 PM IST, weekdays) -------------------- */

function installDailyTrigger_2030IST() {
  const fn = 'postTodaysSummary_trigger';
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === fn).forEach(ScriptApp.deleteTrigger);
  ScriptApp.newTrigger(fn).timeBased().atHour(20).nearMinute(30).everyDays(1).create();
  SpreadsheetApp.getUi().alert('Installed daily post ~8:30 PM IST (skips weekends automatically).');
}

function removeDailyTriggers() {
  const fn = 'postTodaysSummary_trigger';
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === fn) { ScriptApp.deleteTrigger(t); n++; } });
  SpreadsheetApp.getUi().alert(`Removed ${n} daily post trigger(s).`);
}

function postTodaysSummary() { return postTodaysSummary_({ silent: false, respectWeekend: false }); }
function postTodaysSummary_trigger() { return postTodaysSummary_({ silent: true, respectWeekend: true }); }

function postTodaysSummary_(opts) {
  const silent = !!opts?.silent;
  const respectWeekend = opts?.respectWeekend !== false;
  if (!SLACK_ENABLED) {
    if (!silent) SpreadsheetApp.getUi().alert('Slack posting is disabled. The 6:00 PM reminder and the Monday roll-up go to Google Chat.');
    return;
  }
  if (respectWeekend && isWeekendIST_()) return; // skip weekends

  const webhook = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.WEBHOOK);
  if (!webhook) { if (!silent) SpreadsheetApp.getUi().alert('Slack webhook URL not set.'); return; }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const team = ss.getSheetByName(SHEETS.TEAM);
  if (!team) { if (!silent) SpreadsheetApp.getUi().alert('Team sheet not found.'); return; }

  const members = readTeamRows_(team);

  const mentionByName = {};
  members.forEach(m => mentionByName[m.name] = (m.slack || '').trim());

  const todayStr = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const summaryByName = {};
  const hoursByName = {};
  const plansByName = {};

  members.forEach(m => {
    const sh = ss.getSheetByName(sanitizeSheetName_(m.name));
    if (!sh) return;
    const numRows = Math.max(0, sh.getLastRow() - 1);
    if (numRows <= 0) return;

    const rng = sh.getRange(2, 1, numRows, Math.max(sh.getLastColumn(), MEMBER_HEADERS.length)).getValues();
    const entries = [];
    const plans = [];

    rng.forEach(row => {
      const rowDate = normalizeDateOnly_(row[0]);
      const summary = (row[1] || '').toString().trim();
      const hoursVal = row[2];
      const blockers = (row[3] || '').toString().trim();
      const plan = (row[4] || '').toString().trim();
      if (rowDate !== todayStr) return;

      const hoursNum = parseHoursToNumber_(hoursVal);
      if (summary) entries.push({ summary, hoursNum, blockers });
      if (plan) plans.push(plan);
    });

    if (entries.length) {
      summaryByName[m.name] = entries;
      hoursByName[m.name] = entries.reduce((a, e) => a + (e.hoursNum || 0), 0);
    }
    if (plans.length) plansByName[m.name] = plans;
  });

  const names = Array.from(new Set(Object.keys(summaryByName).concat(Object.keys(plansByName))))
    .sort((a, b) => a.localeCompare(b));
  if (!names.length) { if (!silent) SpreadsheetApp.getUi().alert('No updates for today.'); return; }

  const now = new Date();
  const lines = [
    `*Daily Progress — ${Utilities.formatDate(now, TZ, 'EEE, MMM d, yyyy')}*`,
    ''
  ];

  names.forEach(name => {
    const totalH = hoursByName[name] || 0;
    const who = mentionByName[name] ? mentionByName[name] : `*${name}*`; // mention if present
    lines.push(`• ${who} ${totalH ? `(${round1_(totalH)}h total)` : ''}`);

    (summaryByName[name] || []).forEach(e => {
      const parts = ['– ' + e.summary];
      if (e.hoursNum) parts.push(`(${round1_(e.hoursNum)}h)`);
      if (e.blockers) parts.push(`• Blockers: ${e.blockers}`);
      lines.push('   ' + parts.join(' '));
    });

    (plansByName[name] || []).forEach(p => lines.push('   → Tomorrow: ' + p));
    lines.push('');
  });

  const text = lines.join('\n');
  sendToSlack_(webhook, text);
  if (!silent) SpreadsheetApp.getUi().alert('Posted today’s summary to Slack.');
}

/* -------------------- Reminders -------------------- */

function sendReminderNow() { return sendReminder_({ silent: false }); }

function sendReminder_trigger() {
  if (!scheduleAllows_('Reminder')) return;
  return sendReminder_({ silent: true });
}

function memberUpdateRows_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  const spaceCol = MEMBER_HEADERS.indexOf('Space');
  return sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), MEMBER_HEADERS.length)).getValues().map(row => ({
    date: normalizeDateOnly_(row[0]),
    summary: String(row[1] || '').trim(),
    space: String(row[spaceCol] || '').trim()
  }));
}

function sendReminder_(opts) {
  const silent = !!(opts && opts.silent);
  const ss = SpreadsheetApp.getActive();
  const team = ss.getSheetByName(SHEETS.TEAM);
  if (!team) { if (!silent) SpreadsheetApp.getUi().alert('Team sheet not found.'); return; }
  const matrix = readReminderMatrix_(ss);
  if (!Object.keys(matrix).length) {
    if (!silent) SpreadsheetApp.getUi().alert('The reminder matrix is empty. Use Sync reminder matrix first.');
    return;
  }

  const todayStr = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const dateLabel = Utilities.formatDate(new Date(), TZ, 'EEE, MMM d, yyyy');
  const sheetUrl = ss.getUrl();
  const dailyPostTime = dailyPostTimeLabel_();
  const members = readTeamRows_(team);
  const spaces = readConfiguredSpaces_(ss);
  const missingBySpace = {};
  const missingByMember = {};

  members.forEach(member => {
    const checks = matrix[member.name] || {};
    const rows = memberUpdateRows_(ss.getSheetByName(sanitizeSheetName_(member.name)));
    spaces.forEach(space => {
      if (checks[space.name] !== true) return;
      if (Logic.hasUpdateForSpace(rows, todayStr, space.name)) return;
      if (!missingBySpace[space.name]) missingBySpace[space.name] = { webhook: space.webhook, labels: [] };
      missingBySpace[space.name].labels.push(chatLabel_(member));
      if (!missingByMember[member.name]) missingByMember[member.name] = { name: member.name, email: member.email, spaces: [] };
      missingByMember[member.name].spaces.push(space.name);
    });
  });

  const posted = [];
  const failures = [];
  Object.keys(missingBySpace).forEach(spaceName => {
    const item = missingBySpace[spaceName];
    try {
      sendToChat_(item.webhook, Logic.reminderText(spaceName, dateLabel, item.labels, sheetUrl, dailyPostTime));
      posted.push(spaceName);
    } catch (err) {
      const message = (err && err.message) ? err.message : String(err);
      failures.push({ name: spaceName, error: message });
      if (!silent) SpreadsheetApp.getUi().alert(spaceName + ': ' + message);
      else console.error(spaceName, err);
    }
  });
  noteWebhookFailures_('Reminder', failures);

  Object.keys(missingByMember).forEach(name => {
    const person = missingByMember[name];
    if (!person.email) return;
    try {
      MailApp.sendEmail({
        to: person.email,
        subject: 'Reminder: Update daily progress — ' + todayStr,
        htmlBody: Logic.reminderEmailHtml(person.name, person.spaces, sheetUrl, dailyPostTime)
      });
    } catch (err) {
      console.error(err);
    }
  });

  if (!silent) {
    SpreadsheetApp.getUi().alert(posted.length
      ? 'Reminder posted to: ' + posted.join(', ')
      : 'No configured space had a missing member. Nothing was posted.');
  }
}

/* -------------------- Weekly roll-up -------------------- */

function runWeeklyRollupNow() {
  weeklyCollatePreviousWeek_({ silent: false });
}

function weeklyRollup_trigger() {
  if (!scheduleAllows_('Weekly roll-up')) return;
  weeklyCollatePreviousWeek_({ silent: true });
}

/**
 * Previous week (Mon–Sun) before the run, in Asia/Kolkata.
 * One Weekly Rollup row per space + member, and one Chat post per configured space.
 */
function weeklyCollatePreviousWeek_(opts) {
  const silent = !!opts?.silent;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const team = ss.getSheetByName(SHEETS.TEAM);
  if (!team) { if (!silent) SpreadsheetApp.getUi().alert('Team sheet not found.'); return; }

  const { weekStartYMD, weekEndYMD } = getPreviousWeekRangeIST_();
  const members = readTeamRows_(team);
  const spaceCol = MEMBER_HEADERS.indexOf('Space');
  const bySpace = {};

  members.forEach(member => {
    const sh = ss.getSheetByName(sanitizeSheetName_(member.name));
    if (!sh || sh.getLastRow() < 2) return;
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), MEMBER_HEADERS.length)).getValues();
    const buckets = {};
    data.forEach(row => {
      const rowYMD = normalizeDateOnly_(row[0]);
      if (!rowYMD || rowYMD < weekStartYMD || rowYMD > weekEndYMD) return;
      const summary = (row[1] || '').toString().trim();
      const spaceName = (row[spaceCol] || '').toString().trim();
      if (!summary || !spaceName) return;
      const hoursNum = parseHoursToNumber_(row[2]);
      const blockers = (row[3] || '').toString().trim();
      const prettyDate = Utilities.formatDate(ymdToDate_(rowYMD), TZ, 'EEE, MMM d');
      const parts = [`• ${prettyDate}: ${summary}`];
      if (hoursNum) parts.push(`(${round1_(hoursNum)}h)`);
      if (blockers) parts.push(`— Blockers: ${blockers}`);
      if (!buckets[spaceName]) buckets[spaceName] = [];
      buckets[spaceName].push({ ymd: rowYMD, line: parts.join(' ') });
    });
    Object.keys(buckets).forEach(spaceName => {
      const entries = buckets[spaceName].slice().sort((a, b) =>
        String(a.ymd || '').localeCompare(String(b.ymd || ''))
      );
      if (!bySpace[spaceName]) bySpace[spaceName] = [];
      bySpace[spaceName].push({
        member: member.name,
        label: chatLabel_(member),
        entries: entries,
        text: entries.map(e => e.line).join('\n')
      });
    });
  });

  const spaceNames = Object.keys(bySpace);
  if (!spaceNames.length) {
    console.log('WEEKLY none ' + weekStartYMD + ' -> ' + weekEndYMD);
    if (!silent) SpreadsheetApp.getUi().alert(`No space-tagged summaries for ${weekStartYMD} → ${weekEndYMD}.`);
    return;
  }

  const wk = ensureWeeklySheet_(ss);
  const existingMap = {};
  if (wk.getLastRow() > 1) {
    wk.getRange(2, 1, wk.getLastRow() - 1, 4).getValues().forEach((r, i) => {
      const startKey = normalizeDateOnly_(r[0]) || (r[0] || '').toString().trim();
      const key = `${startKey}|${(r[2] || '').toString().trim()}|${(r[3] || '').toString().trim()}`;
      if (startKey) existingMap[key] = i + 2;
    });
  }

  spaceNames.forEach(spaceName => {
    bySpace[spaceName].forEach(col => {
      const key = `${weekStartYMD}|${spaceName}|${col.member}`;
      const rowNum = existingMap[key];
      if (rowNum) {
        wk.getRange(rowNum, 2).setValue(weekEndYMD);
        wk.getRange(rowNum, 5).setValue(col.text).setWrap(true);
      } else {
        wk.appendRow([weekStartYMD, weekEndYMD, spaceName, col.member, col.text]);
        wk.getRange(wk.getLastRow(), 5).setWrap(true);
      }
    });
  });
  autoResize_(wk);

  const summariesSheet = ensureWeeklySpaceSummariesSheet_(ss);
  const summaryMap = readWeeklySpaceSummaries_(summariesSheet);
  const configured = {};
  readConfiguredSpaces_(ss).forEach(space => { configured[space.name] = space.webhook; });
  const dryRun = !!(opts && opts.dryRun);
  const forceSummary = !!(opts && opts.forceSummary);
  const llmReady = openRouterSummaryEnabled_();
  let posted = 0;
  let summarized = 0;
  const skipped = [];
  const failures = [];
  spaceNames.forEach((spaceName, spaceIndex) => {
    const webhook = configured[spaceName];
    if (!webhook) { skipped.push(spaceName); return; }
    const blocks = bySpace[spaceName];
    // bySpace only includes spaces with at least one previous-week update; guard anyway.
    if (!Logic.hasWeeklyMemberContent(blocks)) return;
    const summaryKey = `${weekStartYMD}|${spaceName}`;
    let aiSummary = forceSummary ? '' : (summaryMap[summaryKey] || '');
    if (!aiSummary && llmReady && !dryRun) {
      if (spaceIndex > 0) Utilities.sleep(1500);
      aiSummary = summarizeWeeklySpaceWithOpenRouter_(spaceName, weekStartYMD, weekEndYMD, blocks);
      if (aiSummary) {
        writeWeeklySpaceSummary_(summariesSheet, weekStartYMD, weekEndYMD, spaceName, aiSummary);
        summaryMap[summaryKey] = aiSummary;
        summarized++;
      }
    }
    if (dryRun) {
      console.log('DRY ' + spaceName + ' members=' + blocks.length + ' llm=' + (aiSummary ? 'yes' : 'no'));
      posted++;
      return;
    }
    const message = Logic.buildWeeklyChatMessage(spaceName, weekStartYMD, weekEndYMD, aiSummary, blocks);
    try {
      sendToChat_(webhook, message);
      posted++;
    } catch (e) {
      const errMsg = (e && e.message) ? e.message : String(e);
      skipped.push(spaceName);
      failures.push({ name: spaceName, error: errMsg });
      console.error('Weekly post failed for ' + spaceName + ': ' + errMsg);
    }
  });
  noteWebhookFailures_('Weekly roll-up', failures);

  if (!silent) {
    const skipNote = skipped.length ? ` Not posted (no webhook / failed): ${skipped.join(', ')}.` : '';
    const llmNote = llmReady ? ` LLM summaries written: ${summarized}.` : '';
    SpreadsheetApp.getUi().alert(
      `Weekly roll-up saved for ${weekStartYMD} → ${weekEndYMD}. Posted to ${posted} space(s).${llmNote}${skipNote}`
    );
  } else if (skipped.length) {
    console.log('Weekly roll-up skipped spaces without a webhook: ' + skipped.join(', '));
  }
}

function ensureWeeklySheet_(ss) {
  let wk = ss.getSheetByName(SHEETS.WEEKLY);
  if (!wk) wk = ss.insertSheet(SHEETS.WEEKLY);
  const headerC = (wk.getRange(1, 3).getValue() || '').toString().trim();
  if (headerC === 'Member') wk.insertColumnBefore(3);
  WEEKLY_HEADERS.forEach((h, i) => {
    if ((wk.getRange(1, i + 1).getValue() || '').toString().trim() !== h) {
      wk.getRange(1, i + 1).setValue(h).setFontWeight('bold');
    }
  });
  wk.setFrozenRows(1);
  wk.getRange('E:E').setWrap(true);
  return wk;
}

function ensureWeeklySpaceSummariesSheet_(ss) {
  let sh = ss.getSheetByName(SHEETS.WEEKLY_AI);
  if (!sh) sh = ss.insertSheet(SHEETS.WEEKLY_AI);
  WEEKLY_AI_HEADERS.forEach((h, i) => {
    if ((sh.getRange(1, i + 1).getValue() || '').toString().trim() !== h) {
      sh.getRange(1, i + 1).setValue(h).setFontWeight('bold');
    }
  });
  sh.getRange(1, 4).setNote(
    'OpenRouter summary for this space and week. Reused on re-runs unless forceSummary is set. Not a secret.'
  );
  sh.setFrozenRows(1);
  sh.getRange('D:D').setWrap(true);
  return sh;
}

function readWeeklySpaceSummaries_(sheet) {
  const map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach(row => {
    const start = normalizeDateOnly_(row[0]) || String(row[0] || '').trim();
    const space = String(row[2] || '').trim();
    const summary = String(row[3] || '').trim();
    if (start && space && summary) map[`${start}|${space}`] = summary;
  });
  return map;
}

function writeWeeklySpaceSummary_(sheet, weekStartYMD, weekEndYMD, spaceName, summary) {
  const text = Logic.sanitizeWeeklySummary(summary);
  if (!sheet || !text) return;
  const key = `${weekStartYMD}|${spaceName}`;
  if (sheet.getLastRow() >= 2) {
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    for (let i = 0; i < values.length; i++) {
      const start = normalizeDateOnly_(values[i][0]) || String(values[i][0] || '').trim();
      const space = String(values[i][2] || '').trim();
      if (`${start}|${space}` === key) {
        sheet.getRange(i + 2, 2).setValue(weekEndYMD);
        sheet.getRange(i + 2, 4).setValue(text).setWrap(true);
        return;
      }
    }
  }
  sheet.appendRow([weekStartYMD, weekEndYMD, spaceName, text]);
  sheet.getRange(sheet.getLastRow(), 4).setWrap(true);
}

function openRouterSummaryEnabled_() {
  const props = PropertiesService.getScriptProperties();
  const flag = String(props.getProperty(PROP_KEYS.OPENROUTER_ENABLED) || '1').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off' || flag === 'no') return false;
  return !!String(props.getProperty(PROP_KEYS.OPENROUTER_KEY) || '').trim();
}

function setOpenRouterApiKey() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    'OpenRouter API key',
    'Paste the key from openrouter.ai. Stored as OPENROUTER_API_KEY. Leave blank to clear. ' +
      'Optional Script Property OPENROUTER_MODEL: comma-separated model ids (default ' +
      DEFAULT_OPENROUTER_MODELS + '). Set OPENROUTER_ENABLED=0 to disable without deleting the key.',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const key = (resp.getResponseText() || '').trim();
  const props = PropertiesService.getScriptProperties();
  if (!key) {
    props.deleteProperty(PROP_KEYS.OPENROUTER_KEY);
    ui.alert('OPENROUTER_API_KEY cleared. Weekly posts will skip LLM summaries.');
    return;
  }
  props.setProperty(PROP_KEYS.OPENROUTER_KEY, key);
  props.setProperty(PROP_KEYS.OPENROUTER_MODEL, DEFAULT_OPENROUTER_MODELS);
  if (!props.getProperty(PROP_KEYS.OPENROUTER_ENABLED)) {
    props.setProperty(PROP_KEYS.OPENROUTER_ENABLED, '1');
  }
  ui.alert(
    'Saved OPENROUTER_API_KEY and free-tier models (' + DEFAULT_OPENROUTER_MODELS +
      '). Monday weekly posts send a summary-only message per configured space; member detail is the final fallback.'
  );
}

/**
 * Live free-tier ids. Retired :free ids in OPENROUTER_MODEL are dropped.
 * openrouter/free is always last so a stale property still reaches a live model.
 */
function openRouterModelList_() {
  const props = PropertiesService.getScriptProperties();
  return Logic.resolveOpenRouterModels(
    props.getProperty(PROP_KEYS.OPENROUTER_MODEL),
    DEFAULT_OPENROUTER_MODELS
  );
}

/**
 * Returns sanitized summary text, or '' on any failure (caller posts member detail alone).
 * Tries free-tier OPENROUTER_MODEL ids in order.
 * Skips the API when the space has no previous-week member content (no tokens used).
 */
function summarizeWeeklySpaceWithOpenRouter_(spaceName, weekStartYMD, weekEndYMD, memberBlocks) {
  if (!Logic.hasWeeklyMemberContent(memberBlocks)) return '';
  const props = PropertiesService.getScriptProperties();
  const apiKey = String(props.getProperty(PROP_KEYS.OPENROUTER_KEY) || '').trim();
  if (!apiKey) return '';
  const models = openRouterModelList_();
  if (!models.length) return '';
  const userPrompt = Logic.buildWeeklySummaryUserPrompt(spaceName, weekStartYMD, weekEndYMD, memberBlocks);
  if (!String(userPrompt || '').trim()) return '';

  const headers = {
    Authorization: 'Bearer ' + apiKey,
    'HTTP-Referer': SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    'X-Title': 'Daily Progress Logger weekly roll-up'
  };

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const body = Logic.openRouterChatBody(model, Logic.WEEKLY_SUMMARY_SYSTEM, userPrompt);
    try {
      let res = UrlFetchApp.fetch(OPENROUTER_URL, {
        method: 'post',
        contentType: 'application/json; charset=UTF-8',
        headers: headers,
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      });
      let code = res.getResponseCode();
      if (code === 429 || code >= 500) {
        Utilities.sleep(2500);
        res = UrlFetchApp.fetch(OPENROUTER_URL, {
          method: 'post',
          contentType: 'application/json; charset=UTF-8',
          headers: headers,
          payload: JSON.stringify(body),
          muteHttpExceptions: true
        });
        code = res.getResponseCode();
      }
      if (code < 200 || code >= 300) {
        console.error(
          'OpenRouter HTTP ' + code + ' model=' + model + ' space=' + spaceName + ': ' +
            String(res.getContentText() || '').slice(0, 300)
        );
        continue;
      }
      const payload = JSON.parse(res.getContentText() || '{}');
      const text = Logic.sanitizeWeeklySummary(Logic.extractOpenRouterText(payload));
      if (text) return text;
      console.error('OpenRouter empty content model=' + model + ' space=' + spaceName);
    } catch (e) {
      console.error(
        'OpenRouter failed model=' + model + ' space=' + spaceName + ': ' +
          ((e && e.message) ? e.message : e)
      );
    }
  }
  return '';
}

function readConfiguredSpaces_(ss) {
  const sh = ss.getSheetByName(SHEETS.SPACES);
  if (!sh || sh.getLastRow() < 2) return [];
  const props = PropertiesService.getScriptProperties();
  const n = sh.getLastRow() - 1;
  const rows = sh.getRange(2, 1, n, 4).getValues();
  const flags = [];
  const out = [];
  rows.forEach(r => {
    const name = (r[0] || '').toString().trim();
    const prop = (r[2] || '').toString().trim();
    const webhook = prop ? normalizeChatWebhookUrl_(props.getProperty(prop)) : '';
    const on = !!(name && prop && webhook && isChatWebhookUrl_(webhook));
    flags.push([on]);
    if (on) out.push({ name, prop, webhook });
  });
  sh.getRange(2, 4, n, 1).setValues(flags);
  return out;
}

function normalizeChatWebhookUrl_(url) {
  return String(url || '').trim().replace(/&amp;/gi, '&');
}

/* -------------------- Weekly date helpers -------------------- */

function getPreviousWeekRangeIST_() {
  const todayYMD = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  return Logic.previousWeekRange(todayYMD);
}

function ymdToDate_(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0);
}

/* -------------------- Helpers -------------------- */

function isWeekendIST_() {
  const now = new Date();
  const d = Utilities.formatDate(now, TZ, 'E'); // Mon..Sun
  return d === 'Sat' || d === 'Sun';
}

function ensureTeamSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let team = ss.getSheetByName(SHEETS.TEAM);
  if (!team) team = ss.insertSheet(SHEETS.TEAM);
  const width = Math.max(team.getLastColumn(), TEAM_HEADERS.length, 1);
  const have = team.getRange(1, 1, 1, width).getValues()[0];
  TEAM_HEADERS.forEach((h, i) => {
    if ((have[i] || '').toString().trim() !== h) team.getRange(1, i + 1).setValue(h).setFontWeight('bold');
  });
  team.getRange(1, 1).setNote('Member full name. Becomes the personal tab name.');
  team.getRange(1, 2).setNote('Slack id. Unused while Slack is disabled.');
  team.getRange(1, 3).setNote('Optional. Reminder email.');
  team.getRange(1, 4).setNote('Google Chat mention: <users/USER_ID> or a numeric user id. Blank posts the name without a ping.');
  if (String(have[4] || '').trim() !== 'Spaces') team.getRange(1, 5).setValue('Spaces').setFontWeight('bold');
  team.getRange(1, 5).setNote(
    'Multi-select dropdown of Chat Spaces names (Chat Spaces!A2:A). ' +
    'Existing selections stay as chips. Menu 16 applies this column to the reminder matrix. ' +
    'The script does not call the Chat API and must not recreate this rule with setDataValidation ' +
    '(that drops Allow multiple selections).'
  );
  applyTeamSpacesDropdown_(team);
  team.setFrozenRows(1);
  return team;
}

function readTeamRows_(team) {
  const last = team.getLastRow();
  if (last < 2) return [];
  return team.getRange(2, 1, last - 1, TEAM_HEADERS.length).getValues().reduce((out, r, i) => {
    const name = (r[0] || '').toString().trim();
    if (!name) return out;
    out.push({
      row: i + 2,
      name,
      slack: (r[1] || '').toString().trim(),
      email: (r[2] || '').toString().trim(),
      chat: (r[3] || '').toString().trim()
    });
    return out;
  }, []);
}

function normalizeChatMention_(raw) {
  const s = (raw || '').toString().trim();
  if (!s) return '';
  const wrapped = s.match(/^<users\/([^>]+)>$/i);
  if (wrapped) return `<users/${wrapped[1]}>`;
  if (/^users\/\d+$/i.test(s)) return `<${s}>`;
  if (/^\d+$/.test(s)) return `<users/${s}>`;
  return s;
}

function chatLabel_(member) {
  const c = normalizeChatMention_(member.chat);
  if (/^<users\/[^>]+>$/i.test(c)) return c;
  return `*${member.name}*`;
}

function sanitizeSheetName_(name) {
  // Remove forbidden chars : \ / ? * [ ] and trim
  const cleaned = name.replace(/[:\\\/\?\*\[\]]/g, ' ').trim();
  return cleaned.substring(0, 99) || 'Member';
}

function normalizeDateOnly_(val) {
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val)) {
    return Utilities.formatDate(val, TZ, 'yyyy-MM-dd');
  }
  const s = (val || '').toString().trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d) ? '' : Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}

// Robust, case-insensitive duration parser
function parseHoursToNumber_(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return val;

  const s = String(val).trim();
  if (!s) return 0;
  if (s.length > 48) return 0;

  // H:MM (e.g., 1:30)
  let m = s.match(/^\s*(\d+)\s*:\s*([0-5]?\d)\s*$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    return h + (mm / 60);
  }

  const HR = '(?:h|hr|hrs|hour|hours)';
  const MIN = '(?:m|min|mins|minute|minutes)';

  // Hours then optional minutes
  m = s.match(new RegExp(
    '^\\s*(\\d+(?:\\.\\d+)?)\\s*' + HR +
    '(?:\\s*(?:,|and)?\\s*(\\d+(?:\\.\\d+)?)\\s*' + MIN + ')?\\s*$',
    'i'
  ));
  if (m) {
    const h = parseFloat(m[1]);
    const mm = m[2] ? parseFloat(m[2]) : 0;
    return h + (mm / 60);
  }

  // Minutes then hours
  m = s.match(new RegExp(
    '^\\s*(\\d+(?:\\.\\d+)?)\\s*' + MIN +
    '\\s*(?:,|and)?\\s*(\\d+(?:\\.\\d+)?)\\s*' + HR + '\\s*$',
    'i'
  ));
  if (m) {
    const mm = parseFloat(m[1]);
    const h = parseFloat(m[2]);
    return h + (mm / 60);
  }

  // '1h30' or '1 hr 05'
  m = s.match(new RegExp(
    '^\\s*(\\d+(?:\\.\\d+)?)\\s*' + HR + '\\s*(\\d{1,2})\\s*$',
    'i'
  ));
  if (m) {
    const h = parseFloat(m[1]);
    const mm = parseInt(m[2], 10);
    return h + (mm / 60);
  }

  // Minutes only
  m = s.match(new RegExp('^\\s*(\\d+(?:\\.\\d+)?)\\s*' + MIN + '\\s*$', 'i'));
  if (m) return parseFloat(m[1]) / 60;

  // Hours only (with unit)
  m = s.match(new RegExp('^\\s*(\\d+(?:\\.\\d+)?)\\s*' + HR + '\\s*$', 'i'));
  if (m) return parseFloat(m[1]);

  // Fallback: plain number is hours (accept comma decimal)
  const f = parseFloat(s.replace(',', '.'));
  return isNaN(f) ? 0 : f;
}

function round1_(n) { return Math.round(n * 10) / 10; }

function autoResize_(sheet) {
  const lastCol = sheet.getLastColumn();
  for (let c = 1; c <= lastCol; c++) sheet.autoResizeColumn(c);
}

// Avoid typed-column error while formatting
function safeSetNumberFormat_(sheet, a1, pattern) {
  try {
    sheet.getRange(a1).setNumberFormat(pattern);
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    if (msg.indexOf('typed column') === -1) throw e; // ignore only typed-column case
  }
}

// Date validation → native date picker; table look (banding + filter)
function setDatePickerValidation_(sheet, a1Range) {
  const dv = SpreadsheetApp.newDataValidation()
    .requireDate()
    .setAllowInvalid(false)
    .build();
  sheet.getRange(a1Range).setDataValidation(dv);
}

function applyTableLook_(sheet, numCols) {
  // Use the whole used range (header included)
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const range = sheet.getRange(1, 1, lastRow, numCols);

  // Ensure there's a filter on that range
  const existing = sheet.getFilter();
  if (!existing) {
    range.createFilter();
  } else {
    // Recreate if it doesn't cover our target range
    const fr = existing.getRange();
    const covers =
      fr.getRow() === 1 &&
      fr.getColumn() === 1 &&
      fr.getNumRows() === lastRow &&
      fr.getNumColumns() === numCols;
    if (!covers) {
      existing.remove();
      range.createFilter();
    }
  }

  // Refresh alternating banding on the same range
  sheet.getBandings().forEach(b => b.remove());

  const band = range.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);

  // Set colors WITHOUT chaining (some runtimes return void)
  try { band.setHeaderRowColor('#eef2f7'); } catch (_) {}
  try { band.setFirstBandColor('#ffffff'); } catch (_) {}
  try { band.setSecondBandColor('#f7f9fc'); } catch (_) {}
}

