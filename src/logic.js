var Logic = {
  WEEKDAYS: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  MINUTES: [0, 15, 30, 45],
  DEFAULT_SPACE: 'PRJ_VOX',

  pad_: function (n) { return String(n).padStart(2, '0'); },

  formatYmd_: function (date) {
    return date.getFullYear() + '-' + Logic.pad_(date.getMonth() + 1) + '-' + Logic.pad_(date.getDate());
  },

  parseYmd_: function (ymd) {
    var parts = String(ymd).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  },

  shiftYmd_: function (ymd, deltaDays) {
    var date = Logic.parseYmd_(ymd);
    date.setDate(date.getDate() + deltaDays);
    return Logic.formatYmd_(date);
  },

  previousWeekRange: function (todayYmd) {
    var back = (Logic.parseYmd_(todayYmd).getDay() + 6) % 7;
    var thisMonday = Logic.shiftYmd_(todayYmd, -back);
    var prevMonday = Logic.shiftYmd_(thisMonday, -7);
    return { weekStartYMD: prevMonday, weekEndYMD: Logic.shiftYmd_(prevMonday, 6) };
  },

  parseDays: function (csv) {
    var allowed = {};
    Logic.WEEKDAYS.forEach(function (day) { allowed[day] = true; });
    var seen = {};
    var out = [];
    String(csv || '').split(',').forEach(function (part) {
      var day = part.trim();
      if (!day || seen[day] || !allowed[day]) return;
      seen[day] = true;
      out.push(day);
    });
    return out;
  },

  isScheduledDay: function (csv, jsDay) {
    var name = Logic.WEEKDAYS[jsDay];
    return Logic.parseDays(csv).indexOf(name) >= 0;
  },

  validateSchedule: function (csv, hour, minute) {
    var days = Logic.parseDays(csv);
    var rawDays = String(csv || '').split(',').map(function (part) { return part.trim(); }).filter(Boolean);
    if (!rawDays.length || days.length !== rawDays.length) {
      return { ok: false, error: 'Days must be a comma-separated list of Sun, Mon, Tue, Wed, Thu, Fri, Sat.' };
    }
    var h = Number(hour);
    var m = Number(minute);
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      return { ok: false, error: 'Hour must be a whole number from 0 to 23.' };
    }
    if (Logic.MINUTES.indexOf(m) < 0) {
      return { ok: false, error: 'Minute must be 0, 15, 30, or 45. Apps Script only schedules those minutes.' };
    }
    return { ok: true, days: days, hour: h, minute: m };
  },

  hasUpdateForSpace: function (rows, today, spaceName) {
    return rows.some(function (row) {
      return row.date === today && row.summary && row.space === spaceName;
    });
  },

  formatClockTime: function (hour, minute) {
    var h = Number(hour);
    var m = Number(minute);
    if (!isFinite(h) || h < 0 || h > 23) return '';
    if (!isFinite(m) || m < 0 || m > 59) m = 0;
    var hh = h < 10 ? '0' + h : String(h);
    var mm = m < 10 ? '0' + m : String(m);
    return hh + ':' + mm;
  },

  reminderText: function (spaceName, dateLabel, labels, sheetUrl, dailyPostTimeLabel) {
    var lines = [
      '*Gentle reminder — please add your daily progress for ' + dateLabel + '*',
      'Space: ' + spaceName
    ];
    var postAt = String(dailyPostTimeLabel || '').trim();
    if (postAt) {
      lines.push('Automated daily progress posts to this space around ' + postAt + '.');
    }
    lines.push('Workbook: ' + sheetUrl);
    lines.push('');
    labels.forEach(function (label) { lines.push('• ' + label); });
    lines.push('');
    return lines.join('\n');
  },

  reminderEmailHtml: function (name, spaces, sheetUrl, dailyPostTimeLabel) {
    var postAt = String(dailyPostTimeLabel || '').trim();
    var when = postAt
      ? ' Automated daily progress posts go out around <b>' + postAt + '</b>.'
      : '';
    return (
      'Hi ' + name + ',<br><br>' +
      'Please add today\'s progress for: <b>' + (spaces || []).join(', ') + '</b>.' + when + '<br><br>' +
      '<a href="' + sheetUrl + '">Open the workbook</a>'
    );
  },

  needsSpacePrompt: function (editedCols, spaceCol, dateYmd, todayYmd, spaceValue, validSpaces) {
    if (!dateYmd || dateYmd !== todayYmd) return false;
    var touchedOther = false;
    (editedCols || []).forEach(function (col) {
      if (col !== spaceCol) touchedOther = true;
    });
    if (!touchedOther) return false;
    var space = String(spaceValue || '').trim();
    if (!space) return true;
    return (validSpaces || []).indexOf(space) < 0;
  },

  formatSpaceList: function (names) {
    var seen = {};
    var out = [];
    (names || []).forEach(function (name) {
      var cleaned = String(name || '').trim();
      if (!cleaned || seen[cleaned]) return;
      seen[cleaned] = true;
      out.push(cleaned);
    });
    out.sort();
    return out.join(', ');
  },

  parseSpaceList: function (text) {
    var seen = {};
    var out = [];
    String(text || '').split(',').forEach(function (part) {
      var cleaned = part.trim();
      if (!cleaned || seen[cleaned]) return;
      seen[cleaned] = true;
      out.push(cleaned);
    });
    return out;
  },

  isNamedProjectSpace: function (spaceType, displayName) {
    var name = String(displayName || '').trim();
    if (!name || String(spaceType || '') !== 'SPACE') return false;
    return name.toLowerCase().indexOf('meeting') !== 0;
  },

  chatUserKey: function (mention) {
    var text = String(mention || '').trim();
    var wrapped = text.match(/^<users\/([^>]+)>$/i);
    if (wrapped) return 'users/' + wrapped[1];
    if (/^users\/\d+$/i.test(text)) return text;
    if (/^\d+$/.test(text)) return 'users/' + text;
    return '';
  },

  /**
   * Team column D from the email→id map. Map hit wins.
   * A valid existing mention is kept when the email is absent.
   * source is 'map', 'kept', or 'missing'.
   */
  resolveChatMention: function (email, idMap, existingChat) {
    var key = String(email || '').trim().toLowerCase();
    var mapped = String((idMap && key && idMap[key]) || '').trim();
    if (/^\d+$/.test(mapped)) {
      return { mention: '<users/' + mapped + '>', source: 'map' };
    }
    var userKey = Logic.chatUserKey(existingChat);
    var digits = userKey.replace(/^users\//i, '');
    if (/^\d+$/.test(digits)) {
      return { mention: '<users/' + digits + '>', source: 'kept' };
    }
    return { mention: '', source: 'missing' };
  },

  spacesForMember: function (userKey, spaceMembers) {
    if (!userKey) return [];
    var names = [];
    Object.keys(spaceMembers || {}).forEach(function (spaceName) {
      if (spaceMembers[spaceName] && spaceMembers[spaceName][userKey]) names.push(spaceName);
    });
    return Logic.parseSpaceList(Logic.formatSpaceList(names));
  },

  applyMembership: function (grid, spaceNames, accessByName, synced) {
    if (!synced) return grid;
    return grid.map(function (row) {
      var allowed = {};
      (accessByName[row[0]] || []).forEach(function (space) { allowed[space] = true; });
      return [row[0]].concat(spaceNames.map(function (space, i) {
        if (!allowed[space]) return '';
        return row[i + 1] === true;
      }));
    });
  },

  seedMatrix: function (memberNames, spaceNames, existing, legacyRemind) {
    var hasExisting = false;
    Object.keys(existing || {}).forEach(function (name) {
      if (Object.keys(existing[name] || {}).length) hasExisting = true;
    });
    var grid = memberNames.map(function (name) {
      return [name].concat(spaceNames.map(function (space) {
        if (existing && existing[name] && Object.prototype.hasOwnProperty.call(existing[name], space)) {
          return existing[name][space] === true;
        }
        if (!hasExisting && legacyRemind && legacyRemind[name] === true && space === Logic.DEFAULT_SPACE) return true;
        return false;
      }));
    });
    return { headers: ['Member'].concat(spaceNames), grid: grid };
  },

  // Per request. A larger week is split into batches so the last members are still sent.
  MAX_WEEKLY_SOURCE_CHARS: 12000,
  // Above the per-call token budget, so a finished reply is not sliced mid-bullet.
  MAX_WEEKLY_SUMMARY_CHARS: 5500,
  MAX_MEMBERS_PER_WEEKLY_CALL: 6,

  WEEKLY_SUMMARY_SYSTEM:
    'You write a weekly progress summary for one Google Chat space. ' +
    'Use only the provided text. Do not invent work, people, dates, hours, or blockers. ' +
    'Each update is tagged [YYYY-MM-DD]. The heading is the member name. ' +
    'Include every logged date. Include Saturday, Sunday, and holidays when the source has them. ' +
    'Do not skip a date. ' +
    'Write one bullet for each member. Do not omit a member. ' +
    'Start the bullet with "• " and the exact member name. ' +
    'On the following lines, write the outcomes in date order. The earliest date comes first. ' +
    'Write one short sentence for each distinct outcome. ' +
    'Use the simple past. Use the active voice. Make the member the subject of each sentence. ' +
    'Use 25 words or fewer in each sentence. ' +
    'Do not restate every daily line. Do not copy the source. ' +
    'Add one blocker sentence when the source states a blocker. ' +
    'Do not use a semicolon. ' +
    'Never output a <users/...> token or a numeric user id. ' +
    'Output plain text only. No markdown headings.\n' +
    'Example input: Ada / [2026-10-16] shipped login / [2026-10-17] fixed export / [2026-10-18] checked logs. Blockers: staging.\n' +
    'Example output:\n' +
    '• Ada\n' +
    'On 2026-10-16, Ada shipped the login.\n' +
    'On 2026-10-17, Ada fixed the export.\n' +
    'On 2026-10-18, Ada checked the logs.\n' +
    'Blocker: staging is down.',

  truncateText: function (text, maxChars) {
    var raw = String(text || '');
    var limit = Number(maxChars);
    if (!limit || raw.length <= limit) return raw;
    return raw.slice(0, Math.max(0, limit - 20)) + '\n…[truncated]';
  },

  /**
   * True when at least one member block has dated entries or non-empty text.
   * Used to skip OpenRouter calls for spaces with no previous-week content.
   */
  hasWeeklyMemberContent: function (memberBlocks) {
    var blocks = memberBlocks || [];
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      if (!block) continue;
      var entries = block.entries || [];
      for (var j = 0; j < entries.length; j++) {
        if (String((entries[j] && entries[j].line) || '').trim()) return true;
      }
      if (String(block.text || '').trim()) return true;
    }
    return false;
  },

  /**
   * Format one member's dated posts for the LLM. Prefers entries[{ymd,line}] sorted by ymd;
   * falls back to block.text when entries are absent.
   */
  stripChatMentions_: function (text) {
    return String(text || '').replace(/<users\/[^>]*>/gi, '');
  },

  weeklyPromptHeading_: function (block) {
    var member = Logic.stripChatMentions_(String((block && block.member) || '')).trim();
    if (member) return member;
    var label = String((block && block.label) || '').trim();
    if (/^<users\/[^>]+>$/i.test(label)) return 'Member';
    var plain = Logic.stripChatMentions_(label.replace(/^\*+|\*+$/g, '')).trim();
    return plain || 'Member';
  },

  formatMemberUpdatesForPrompt_: function (block) {
    var entries = (block && block.entries) || [];
    if (entries.length) {
      var sorted = entries.slice().sort(function (a, b) {
        return String((a && a.ymd) || '').localeCompare(String((b && b.ymd) || ''));
      });
      return sorted.map(function (entry) {
        var ymd = String((entry && entry.ymd) || '').trim();
        var line = Logic.stripChatMentions_(String((entry && entry.line) || '')).trim();
        if (!line) return '';
        return ymd ? ('[' + ymd + '] ' + line) : line;
      }).filter(Boolean).join('\n');
    }
    return Logic.stripChatMentions_(String((block && block.text) || ''));
  },

  weeklySummarySourceText: function (spaceName, weekStartYmd, weekEndYmd, memberBlocks) {
    var lines = [
      'Space: ' + String(spaceName || '').trim(),
      'Week: ' + String(weekStartYmd || '') + ' to ' + String(weekEndYmd || ''),
      '',
      'Member updates. Each line is tagged [YYYY-MM-DD]. ' +
        'The heading is the member name. The lines are in date order. ' +
        'Keep that order. Include Saturday, Sunday, and holidays when they are present. ' +
        'Write one short section per member for the whole week:',
      ''
    ];
    (memberBlocks || []).forEach(function (block) {
      lines.push(Logic.weeklyPromptHeading_(block));
      lines.push(Logic.formatMemberUpdatesForPrompt_(block));
      lines.push('');
    });
    return lines.join('\n').trim();
  },

  buildWeeklySummaryUserPrompt: function (spaceName, weekStartYmd, weekEndYmd, memberBlocks) {
    return Logic.weeklySummarySourceText(spaceName, weekStartYmd, weekEndYmd, memberBlocks);
  },

  ymdInInclusiveRange: function (ymd, startYmd, endYmd) {
    var day = String(ymd || '');
    var start = String(startYmd || '');
    var end = String(endYmd || '');
    if (!day || !start || !end) return false;
    return day >= start && day <= end;
  },

  /**
   * The stock weekday list is widened so a Saturday, Sunday, or holiday log is posted that day.
   * A custom day list is left as the operator saved it.
   */
  dailyPostDays: function (stored) {
    var text = String(stored || '').trim();
    if (text === 'Mon,Tue,Wed,Thu,Fri') return 'Mon,Tue,Wed,Thu,Fri,Sat,Sun';
    return text;
  },

  CHAT_MESSAGE_CHARS: 3500,

  chatMemberBlocks_: function (text) {
    var header = [];
    var blocks = [];
    var current = null;
    String(text || '').split('\n').forEach(function (line) {
      if (/^• /.test(line)) {
        if (current) blocks.push(current.join('\n').replace(/\s+$/, ''));
        current = [line];
        return;
      }
      if (current) current.push(line);
      else header.push(line);
    });
    if (current) blocks.push(current.join('\n').replace(/\s+$/, ''));
    return {
      header: header.join('\n').replace(/\s+$/, ''),
      blocks: blocks.filter(function (block) { return block.length; })
    };
  },

  fitMemberBlock: function (block, maxLen) {
    var text = String(block || '').trim();
    var limit = Number(maxLen);
    if (!limit || text.length <= limit) return text;
    var slice = text.slice(0, limit);
    var sentence = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
    if (sentence >= 8) return slice.slice(0, sentence + 1).trim();
    var lineBreak = slice.lastIndexOf('\n');
    if (lineBreak > 0) return slice.slice(0, lineBreak).trim();
    var space = slice.lastIndexOf(' ');
    if (space > 8) return slice.slice(0, space).trim();
    return slice.trim();
  },

  chunkPlainChatText_: function (text, maxLen) {
    var src = String(text || '');
    var limit = Number(maxLen);
    if (!src) return [''];
    if (!limit || src.length <= limit) return [src];
    var parts = [];
    var buf = '';
    src.split('\n').forEach(function (line) {
      var next = buf ? (buf + '\n' + line) : line;
      if (next.length > limit) {
        if (buf) parts.push(buf);
        buf = line.length > limit ? line.slice(0, limit) : line;
      } else {
        buf = next;
      }
    });
    if (buf) parts.push(buf);
    return parts.length ? parts : [src.slice(0, limit)];
  },

  continuationHeader_: function (header) {
    var line = String(header || '').split('\n')[0];
    if (!line || /^• /.test(line)) return '';
    if (line.charAt(0) === '*' && line.charAt(line.length - 1) === '*') {
      return line.slice(0, -1) + ' (continued)*';
    }
    return line + ' (continued)';
  },

  /**
   * Pack Chat text so one member section stays in one message.
   * A section starts with "• ". Later lines belong to that member.
   * If the next member does not fit, that member starts the next message.
   */
  chunkChatByMember: function (text, maxLen) {
    var limit = Number(maxLen) > 0 ? Number(maxLen) : Logic.CHAT_MESSAGE_CHARS;
    var src = String(text || '');
    if (!src) return [''];
    if (src.length <= limit) return [src];
    if (!/(^|\n)• /.test(src)) return Logic.chunkPlainChatText_(src, limit);
    var parsed = Logic.chatMemberBlocks_(src);
    var cont = Logic.continuationHeader_(parsed.header);
    var chunks = [];
    var buf = parsed.header;
    function pushBuf() {
      if (String(buf || '').trim()) chunks.push(String(buf).replace(/\n+$/, ''));
      buf = '';
    }
    parsed.blocks.forEach(function (block) {
      var candidate = buf ? (buf + '\n' + block) : block;
      if (candidate.length <= limit) {
        buf = candidate;
        return;
      }
      if (buf) pushBuf();
      var withCont = chunks.length && cont ? (cont + '\n' + block) : block;
      if (withCont.length <= limit) {
        buf = withCont;
        return;
      }
      if (block.length <= limit) {
        buf = block;
        return;
      }
      buf = Logic.fitMemberBlock(block, limit);
    });
    pushBuf();
    return chunks.length ? chunks : [Logic.fitMemberBlock(src, limit)];
  },

  /**
   * Groups members so each model call can finish. Every member stays in one batch.
   * A single long member is alone and is not split across calls.
   */
  planWeeklySummaryBatches: function (memberBlocks, spaceName, weekStartYmd, weekEndYmd) {
    var cap = Logic.MAX_WEEKLY_SOURCE_CHARS;
    var maxMembers = Logic.MAX_MEMBERS_PER_WEEKLY_CALL;
    var space = spaceName || 'S';
    var start = weekStartYmd || '2026-01-05';
    var end = weekEndYmd || '2026-01-11';
    var batches = [];
    var current = [];
    function sourceLen(group) {
      return Logic.weeklySummarySourceText(space, start, end, group).length;
    }
    (memberBlocks || []).forEach(function (block) {
      if (!current.length) {
        current = [block];
        return;
      }
      var next = current.concat([block]);
      if (next.length > maxMembers || sourceLen(next) > cap) {
        batches.push(current);
        current = [block];
        return;
      }
      current = next;
    });
    if (current.length) batches.push(current);
    return batches;
  },

  /**
   * Tokens for one short bullet per member in this call, with slack so the last bullet can finish.
   */
  weeklySummaryMaxTokens: function (memberCount) {
    var n = Number(memberCount);
    if (!n || n < 1) n = 1;
    var capped = Math.min(Math.floor(n), Logic.MAX_MEMBERS_PER_WEEKLY_CALL);
    return 100 + capped * 120;
  },

  extractOpenRouterText: function (payload) {
    if (!payload || !payload.choices || !payload.choices.length) return '';
    var choice = payload.choices[0] || {};
    var message = choice.message || {};
    var content = message.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
      return content.map(function (part) {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      }).join('').trim();
    }
    return '';
  },

  sanitizeWeeklySummary: function (text) {
    return Logic.stripChatMentions_(String(text || ''))
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n?…\[truncated\]/g, '')
      .trim();
  },

  weeklySummaryEndsClean_: function (text) {
    return /[.!?]["')\]]?\s*$/.test(String(text || '').trim());
  },

  trimIncompleteWeeklyBullet: function (text) {
    var cleaned = Logic.sanitizeWeeklySummary(text);
    if (!cleaned) return '';
    if (Logic.weeklySummaryEndsClean_(cleaned)) return cleaned;
    var idx = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf('!'), cleaned.lastIndexOf('?'));
    if (idx >= 8) return cleaned.slice(0, idx + 1).trim();
    var space = cleaned.lastIndexOf(' ');
    if (space > 8) return cleaned.slice(0, space).trim();
    return cleaned;
  },

  fitWeeklySummaryText: function (text) {
    var cleaned = Logic.sanitizeWeeklySummary(text);
    if (!cleaned) return { text: '', cut: false };
    if (cleaned.length <= Logic.MAX_WEEKLY_SUMMARY_CHARS) return { text: cleaned, cut: false };
    var slice = cleaned.slice(0, Logic.MAX_WEEKLY_SUMMARY_CHARS);
    var breakAt = slice.lastIndexOf('\n• ');
    if (breakAt > 0) return { text: slice.slice(0, breakAt).trim(), cut: true };
    return { text: Logic.trimIncompleteWeeklyBullet(slice), cut: true };
  },

  ensureSingleMemberName_: function (text, blocks) {
    if (!blocks || blocks.length !== 1) return text;
    var name = String((blocks[0] && blocks[0].member) || '').trim();
    if (!name) return text;
    if (String(text || '').toLowerCase().indexOf(name.toLowerCase()) >= 0) return text;
    var body = String(text || '').replace(/^•\s*/, '').trim();
    return body ? ('• ' + name + ' ' + body) : ('• ' + name);
  },

  readOpenRouterCompletion: function (payload) {
    var choice = (payload && payload.choices && payload.choices[0]) || {};
    var reason = String(choice.finish_reason || choice.native_finish_reason || '').toLowerCase();
    return {
      text: Logic.extractOpenRouterText(payload),
      truncated: reason === 'length'
    };
  },

  /**
   * accept: the reply can be posted.
   * split: the reply was cut or skipped a member. The caller summarizes smaller groups.
   */
  interpretWeeklySummaryAttempt: function (rawText, finishTruncated, memberBlocks) {
    var blocks = memberBlocks || [];
    var fitted = Logic.fitWeeklySummaryText(rawText);
    var single = blocks.length <= 1;
    var missing = Logic.membersOmittedFromSummary_(fitted.text, blocks);
    var cutOff = fitted.cut || (!!finishTruncated && !Logic.weeklySummaryEndsClean_(fitted.text));
    if (!fitted.text) return { action: single ? 'accept' : 'split', text: '' };
    if (!cutOff && !missing.length) {
      return { action: 'accept', text: Logic.ensureSingleMemberName_(fitted.text, blocks) };
    }
    if (single) {
      return {
        action: 'accept',
        text: Logic.ensureSingleMemberName_(Logic.trimIncompleteWeeklyBullet(fitted.text), blocks)
      };
    }
    return { action: 'split', text: '' };
  },

  joinWeeklySummaryBullets: function (parts) {
    return (parts || []).map(function (part) {
      return String(part || '').trim();
    }).filter(Boolean).join('\n');
  },

  weeklyStoredSummaryIsUsable: function (summary, memberBlocks) {
    var raw = String(summary || '');
    if (!raw.trim()) return false;
    if (raw.indexOf('…[truncated]') >= 0) return false;
    return Logic.membersOmittedFromSummary_(raw, memberBlocks).length === 0;
  },

  /**
   * Members whose name is absent from the summary text.
   * Blocks with no member name are ignored.
   */
  membersOmittedFromSummary_: function (summary, memberBlocks) {
    var text = String(summary || '').toLowerCase();
    var missing = [];
    (memberBlocks || []).forEach(function (block) {
      var name = String((block && block.member) || '').trim();
      if (!name) return;
      if (text.indexOf(name.toLowerCase()) < 0) missing.push(block);
    });
    return missing;
  },

  buildWeeklyChatMessage: function (spaceName, weekStartYmd, weekEndYmd, aiSummary, memberBlocks) {
    var lines = [
      '*Weekly roll-up — ' + spaceName + ' — ' + weekStartYmd + ' → ' + weekEndYmd + '*',
      ''
    ];
    var summary = Logic.sanitizeWeeklySummary(aiSummary);
    if (summary) {
      lines.push(summary);
      Logic.membersOmittedFromSummary_(summary, memberBlocks).forEach(function (block) {
        lines.push('');
        lines.push(Logic.weeklyPromptHeading_(block));
        lines.push(Logic.stripChatMentions_(String((block && block.text) || '')));
      });
      lines.push('');
      return lines.join('\n');
    }
    (memberBlocks || []).forEach(function (block) {
      lines.push(String((block && block.label) || (block && block.member) || 'Member'));
      lines.push(String((block && block.text) || ''));
      lines.push('');
    });
    return lines.join('\n');
  },

  parseOpenRouterModels: function (text, fallbackCsv) {
    var seen = {};
    var out = [];
    String(text || fallbackCsv || '').split(',').forEach(function (part) {
      var model = part.trim();
      if (!model || seen[model]) return;
      seen[model] = true;
      out.push(model);
    });
    return out;
  },

  /**
   * Keep only OpenRouter free-tier ids (suffix :free). If none remain, use fallbackCsv.
   */
  preferFreeOpenRouterModels: function (models, fallbackCsv) {
    var free = [];
    var seen = {};
    (models || []).forEach(function (model) {
      var id = String(model || '').trim();
      if (!id || seen[id] || !/:free$/i.test(id)) return;
      seen[id] = true;
      free.push(id);
    });
    if (free.length) return free;
    return Logic.parseOpenRouterModels(fallbackCsv, '');
  },

  /**
   * Ids that used to be free and now 404. A stored OPENROUTER_MODEL value
   * often still lists them; trying them burns the free-tier quota.
   */
  RETIRED_OPENROUTER_MODELS: {
    'meta-llama/llama-3.3-70b-instruct:free': true,
    'deepseek/deepseek-v4-flash:free': true,
    'qwen/qwen3.8-27b:free': true
  },

  /** Zero-price router. It does not end in ":free", but it does not bill. */
  FREE_ROUTER: 'openrouter/free',

  isFreeOpenRouterModel: function (id) {
    var model = String(id || '').trim();
    if (!model || Logic.RETIRED_OPENROUTER_MODELS[model]) return false;
    if (model === Logic.FREE_ROUTER) return true;
    return /:free$/i.test(model);
  },

  /**
   * Live free ids from the stored list, else from fallbackCsv.
   * Always ends with the free router so a later roster change still has a target.
   */
  resolveOpenRouterModels: function (storedCsv, fallbackCsv) {
    function take(list) {
      var seen = {};
      var out = [];
      (list || []).forEach(function (model) {
        var id = String(model || '').trim();
        if (!id || seen[id] || !Logic.isFreeOpenRouterModel(id)) return;
        seen[id] = true;
        out.push(id);
      });
      return out;
    }
    var live = take(Logic.parseOpenRouterModels(storedCsv, ''));
    if (!live.length) live = take(Logic.parseOpenRouterModels(fallbackCsv, ''));
    if (live.indexOf(Logic.FREE_ROUTER) < 0) live.push(Logic.FREE_ROUTER);
    return live;
  },

  /**
   * Summaries are one short bullet per member. effort "none" keeps the reply
   * in message.content instead of spending max_tokens on reasoning.
   * maxTokens is the budget for this batch, from weeklySummaryMaxTokens.
   */
  openRouterChatBody: function (model, systemPrompt, userPrompt, maxTokens) {
    var tokens = Number(maxTokens);
    if (!tokens || tokens < 1) tokens = Logic.weeklySummaryMaxTokens(1);
    return {
      model: model,
      temperature: 0.2,
      max_tokens: tokens,
      reasoning: { effort: 'none' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };
  },

  isSpreadsheetError: function (val) {
    return /^#(REF!|N\/A|ERROR!|VALUE!|DIV\/0!|NAME\?|NULL!|NUM!)$/.test(String(val == null ? '' : val).trim());
  },

  cellText: function (val) {
    if (val == null || Logic.isSpreadsheetError(val)) return '';
    return String(val).trim();
  },

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

  githubIssueLinkSpans: function (issues) {
    var spans = [];
    var cursor = 0;
    (issues || []).forEach(function (issue, index) {
      if (!issue) return;
      if (index > 0) cursor += 2;
      var label = String(issue.number);
      spans.push({ start: cursor, end: cursor + label.length, url: issue.url });
      cursor += label.length;
    });
    return spans;
  },

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

  /**
   * Runs fn on each item. A throw skips that item and leaves the others.
   */
  collectSafe: function (items, fn) {
    var values = [];
    var skipped = 0;
    (items || []).forEach(function (item, index) {
      try {
        var value = fn(item, index);
        if (value !== undefined && value !== null) values.push(value);
      } catch (e) {
        skipped++;
      }
    });
    return { values: values, skipped: skipped };
  }
};
