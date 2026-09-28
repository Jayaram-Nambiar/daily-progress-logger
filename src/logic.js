var Logic = {
  WEEKDAYS: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  MINUTES: [0, 15, 30, 45],
  DEFAULT_SPACE: 'TEAM_ALPHA',

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

  reminderText: function (spaceName, dateLabel, labels, sheetUrl) {
    var lines = [
      '*Gentle reminder — please add your daily progress for ' + dateLabel + '*',
      'Space: ' + spaceName,
      'Workbook: ' + sheetUrl,
      ''
    ];
    labels.forEach(function (label) { lines.push('• ' + label); });
    lines.push('');
    return lines.join('\n');
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

  MAX_WEEKLY_SOURCE_CHARS: 12000,
  MAX_WEEKLY_SUMMARY_CHARS: 1500,

  WEEKLY_SUMMARY_SYSTEM:
    'You summarize team daily-progress updates for a Google Chat space. ' +
    'Use only the provided text. Do not invent work, people, PRs, dates, or metrics. ' +
    'Each post is tagged with its calendar date ([YYYY-MM-DD]). Use those dates to build a ' +
    'chronological picture of what members did over the week (order bullets by date when possible; ' +
    'mention timing only when the source dates support it). ' +
    'If the week is sparse, say so briefly. ' +
    'Output plain text only: 4 to 8 short bullets starting with "• ". No markdown headings.',

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
  formatMemberUpdatesForPrompt_: function (block) {
    var entries = (block && block.entries) || [];
    if (entries.length) {
      var sorted = entries.slice().sort(function (a, b) {
        return String((a && a.ymd) || '').localeCompare(String((b && b.ymd) || ''));
      });
      return sorted.map(function (entry) {
        var ymd = String((entry && entry.ymd) || '').trim();
        var line = String((entry && entry.line) || '').trim();
        if (!line) return '';
        return ymd ? ('[' + ymd + '] ' + line) : line;
      }).filter(Boolean).join('\n');
    }
    return String((block && block.text) || '');
  },

  buildWeeklySummaryUserPrompt: function (spaceName, weekStartYmd, weekEndYmd, memberBlocks) {
    var lines = [
      'Space: ' + String(spaceName || '').trim(),
      'Week: ' + String(weekStartYmd || '') + ' to ' + String(weekEndYmd || ''),
      '',
      'Member updates (each line tagged [YYYY-MM-DD] with the post date). ' +
        'Summarize chronologically across the week using those dates:',
      ''
    ];
    (memberBlocks || []).forEach(function (block) {
      lines.push(String((block && block.label) || (block && block.member) || 'Member'));
      lines.push(Logic.formatMemberUpdatesForPrompt_(block));
      lines.push('');
    });
    return Logic.truncateText(lines.join('\n').trim(), Logic.MAX_WEEKLY_SOURCE_CHARS);
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
    var cleaned = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!cleaned) return '';
    return Logic.truncateText(cleaned, Logic.MAX_WEEKLY_SUMMARY_CHARS);
  },

  buildWeeklyChatMessage: function (spaceName, weekStartYmd, weekEndYmd, aiSummary, memberBlocks) {
    var lines = [
      '*Weekly roll-up — ' + spaceName + ' — ' + weekStartYmd + ' → ' + weekEndYmd + '*',
      ''
    ];
    var summary = Logic.sanitizeWeeklySummary(aiSummary);
    if (summary) {
      lines.push(summary);
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
    'deepseek/deepseek-v4-flash:free': true
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
   * Summaries are short. effort "none" keeps the reply in message.content
   * instead of spending max_tokens on reasoning and returning empty content.
   */
  openRouterChatBody: function (model, systemPrompt, userPrompt) {
    return {
      model: model,
      temperature: 0.2,
      max_tokens: 700,
      reasoning: { effort: 'none' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };
  }
};
