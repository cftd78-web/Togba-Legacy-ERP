/**
 * TOGBA LEGACY ERP v24
 * Phase 2 - Secure Internal Messaging
 * Features:
 * - Atomic OTP generation with LockService
 * - Secure session tokens
 * - Spreadsheet schema safety and header validation
 * - Finance aggregation
 * - Admin registry management
 * - Secure channel messaging
 */

const SS_ID = "104VsCf8xhIFymyai9fG84RMbM6iirVcQxgTfqO4LkH4"; // Replace if needed
const SESSION_TTL = 21600; // 6 hours
const CHANNEL_TYPES = ['private', 'family broadcast', 'project'];

let _SS_CACHE = null;

/* =====================================================
   WEB APP ENTRY
===================================================== */

function doGet() {
  try {
    return HtmlService
      .createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Togba Legacy Portal')
      .addMetaTag(
        'viewport',
        'width=device-width, initial-scale=1, maximum-scale=1'
      )
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (e) {
    throw new Error(_errMsg('doGet', e));
  }
}

/* =====================================================
   ATOMIC OTP GENERATION
===================================================== */

function loginStepOne(email) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000);

    const normalizedEmail = _norm(email);
    if (!normalizedEmail) {
      throw new Error('Email is required.');
    }

    const access = _readSheet('Access', {
      EmailOptional: ['EmailOptional', 'Email'],
      OneTimeCode: ['OneTimeCode', 'OTP', 'OneTimePasscode']
    });

    const rowIndex = access.rows.findIndex(r => _norm(r[access.idx.EmailOptional]) === normalizedEmail);

    if (rowIndex === -1) {
      throw new Error('Email not found.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    access.sheet.getRange(rowIndex + 2, access.idx.OneTimeCode + 1).setValue(otp);

    SpreadsheetApp.flush();

    return {
      success: true,
      deliveredByEmail: false
    };
  } catch (e) {
    throw new Error(_errMsg('loginStepOne', e));
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

/* =====================================================
   OTP VERIFICATION
===================================================== */

function verifyStepTwo(email, code) {
  try {
    const normalizedEmail = _norm(email);
    const normalizedCode = String(code || '').trim();

    if (!normalizedEmail || !normalizedCode) {
      throw new Error('Email and code are required.');
    }

    const access = _readSheet('Access', {
      EmailOptional: ['EmailOptional', 'Email'],
      OneTimeCode: ['OneTimeCode', 'OTP', 'OneTimePasscode'],
      Role: ['Role', 'RoleName'],
      FullName: ['FullName', 'Name']
    });

    const rowIndex = access.rows.findIndex(r => {
      return _norm(r[access.idx.EmailOptional]) === normalizedEmail &&
        String(r[access.idx.OneTimeCode] || '').trim() === normalizedCode;
    });

    if (rowIndex === -1) {
      throw new Error('Invalid code.');
    }

    const role = String(access.rows[rowIndex][access.idx.Role] || '').trim();
    const name = String(access.rows[rowIndex][access.idx.FullName] || '').trim();

    access.sheet.getRange(rowIndex + 2, access.idx.OneTimeCode + 1).setValue('');

    const token = Utilities.getUuid();
    CacheService
      .getScriptCache()
      .put(
        token,
        JSON.stringify({
          email: normalizedEmail,
          role: role,
          name: name
        }),
        SESSION_TTL
      );

    return { token: token };
  } catch (e) {
    throw new Error(_errMsg('verifyStepTwo', e));
  }
}

/* =====================================================
   DASHBOARD DATA
===================================================== */

function getDashboardData(token) {
  try {
    const session = _auth(token);
    const access = _readSheet('Access', {
      EmailOptional: ['EmailOptional', 'Email'],
      FullName: ['FullName', 'Name'],
      Role: ['Role', 'RoleName']
    });

    const row = access.rows.find(r => _norm(r[access.idx.EmailOptional]) === _norm(session.email));
    if (!row) {
      throw new Error('User profile not found.');
    }

    return {
      profile: {
        name: row[access.idx.FullName],
        role: row[access.idx.Role]
      }
    };
  } catch (e) {
    throw new Error(_errMsg('getDashboardData', e));
  }
}

/* =====================================================
   FINANCE AGGREGATION
===================================================== */

function getFinanceData(token) {
  try {
    _auth(token);

    const conts = _readSheet('Contributions', {
      AmountUSD: ['AmountUSD'],
      ContributionType: ['ContributionType', 'Type']
    });

    const locks = _readSheet('FounderLocks', {
      AmountUSD: ['AmountUSD']
    });

    const categories = {};

    conts.rows.forEach(r => {
      const type = String(r[conts.idx.ContributionType] || 'Other').trim() || 'Other';
      const amount = Number(r[conts.idx.AmountUSD]) || 0;

      if (!categories[type]) categories[type] = 0;
      categories[type] += amount;
    });

    const totalLocked = locks.rows.reduce((sum, r) => {
      return sum + (Number(r[locks.idx.AmountUSD]) || 0);
    }, 0);

    return {
      labels: Object.keys(categories),
      values: Object.values(categories),
      totalLocked: totalLocked
    };
  } catch (e) {
    throw new Error(_errMsg('getFinanceData', e));
  }
}

function getInvestmentAllocation(token) {
  try {
    _auth(token);

    const contributions = _readSheet('Contributions', {
      AmountUSD: ['AmountUSD']
    });

    const settings = _readSheet('InstitutionSettings', {
      SettingKey: ['SettingKey', 'Key'],
      SettingValue: ['SettingValue', 'Value']
    });

    const totalContributions = contributions.rows.reduce((sum, row) => {
      return sum + (Number(row[contributions.idx.AmountUSD]) || 0);
    }, 0);

    const settingsMap = settings.rows.reduce((acc, row) => {
      const key = String(row[settings.idx.SettingKey] || '').trim();
      if (!key) {
        return acc;
      }
      acc[key.toLowerCase()] = row[settings.idx.SettingValue];
      return acc;
    }, {});

    const projectionRate = _numSetting(settingsMap, ['ProjectionRate'], 0);
    const equityPercent = _numSetting(settingsMap, ['EquityPercent'], 0);
    const fixedIncomePercent = _numSetting(settingsMap, ['FixedIncomePercent'], 0);
    const cashPercent = _numSetting(settingsMap, ['CashPercent'], 0);
    const alternativePercent = _numSetting(settingsMap, ['AlternativePercent'], 0);

    const breakdown = [
      { key: 'EquityPercent', label: 'Equity', percent: equityPercent },
      { key: 'FixedIncomePercent', label: 'Fixed Income', percent: fixedIncomePercent },
      { key: 'CashPercent', label: 'Cash', percent: cashPercent },
      { key: 'AlternativePercent', label: 'Alternative', percent: alternativePercent }
    ].map(item => {
      const projectedAmount = totalContributions * (item.percent / 100) * (1 + projectionRate / 100);
      return {
        key: item.key,
        label: item.label,
        percent: item.percent,
        projectedAmount: projectedAmount
      };
    });

    const totalPercent = breakdown.reduce((sum, item) => sum + (Number(item.percent) || 0), 0);
    const isValid = Math.abs(totalPercent - 100) < 0.0001;

    return {
      success: true,
      totalContributions: totalContributions,
      projectionRate: projectionRate,
      totalPercent: totalPercent,
      isValid: isValid,
      message: isValid ? '' : 'Allocation percentages in InstitutionSettings must total 100.',
      breakdown: breakdown,
      projectedTotal: breakdown.reduce((sum, item) => sum + item.projectedAmount, 0)
    };
  } catch (e) {
    throw new Error(_errMsg('getInvestmentAllocation', e));
  }
}

function getFounderLocksSummary(token) {
  try {
    _auth(token);

    const locks = _readSheet('FounderLocks', {
      AmountUSD: ['AmountUSD'],
      ExpiryDate: ['ExpiryDate'],
      LockYears: ['LockYears'],
      Released: ['Released']
    });

    const now = new Date();

    const normalizedLocks = locks.rows.map(row => {
      const amount = Number(row[locks.idx.AmountUSD]) || 0;
      const expiryRaw = row[locks.idx.ExpiryDate];
      const expiryDate = _safeIsoDate(expiryRaw);
      const lockYears = Number(row[locks.idx.LockYears]) || 0;
      const released = _toBoolean(row[locks.idx.Released]);
      const progressPercent = _computeFounderLockProgress(expiryRaw, lockYears, now);

      return {
        AmountUSD: amount,
        ExpiryDate: expiryDate,
        LockYears: lockYears,
        Released: released,
        progressPercent: progressPercent
      };
    });

    const totals = normalizedLocks.reduce((acc, item) => {
      acc.totalLocked += item.AmountUSD;
      if (item.Released) {
        acc.totalReleased += item.AmountUSD;
      } else {
        acc.activeLocked += item.AmountUSD;
      }
      return acc;
    }, {
      totalLocked: 0,
      activeLocked: 0,
      totalReleased: 0
    });

    return {
      success: true,
      totalLocked: totals.totalLocked,
      activeLocked: totals.activeLocked,
      totalReleased: totals.totalReleased,
      totalRecords: normalizedLocks.length,
      locks: normalizedLocks
    };
  } catch (e) {
    throw new Error(_errMsg('getFounderLocksSummary', e));
  }
}

function getFinanceDashboardData(token) {
  try {
    _auth(token);

    const contributions = _readSheet('Contributions', {
      AmountUSD: ['AmountUSD'],
      ContributionType: ['ContributionType', 'Type']
    });

    const locks = _readSheet('FounderLocks', {
      AmountUSD: ['AmountUSD'],
      ExpiryDate: ['ExpiryDate'],
      LockYears: ['LockYears'],
      Released: ['Released']
    });

    const settings = _readSheet('InstitutionSettings', {
      SettingKey: ['SettingKey', 'Key'],
      SettingValue: ['SettingValue', 'Value']
    });

    const settingsMap = settings.rows.reduce((acc, row) => {
      const key = String(row[settings.idx.SettingKey] || '').trim();
      if (key) {
        acc[key.toLowerCase()] = row[settings.idx.SettingValue];
      }
      return acc;
    }, {});

    const totalContributions = contributions.rows.reduce((sum, row) => {
      return sum + (Number(row[contributions.idx.AmountUSD]) || 0);
    }, 0);

    const projectionRate = _numSetting(settingsMap, ['ProjectionRate'], 0);
    const allocationBreakdown = [
      { key: 'EquityPercent', label: 'Equity', percent: _numSetting(settingsMap, ['EquityPercent'], 0) },
      { key: 'FixedIncomePercent', label: 'Fixed Income', percent: _numSetting(settingsMap, ['FixedIncomePercent'], 0) },
      { key: 'CashPercent', label: 'Cash', percent: _numSetting(settingsMap, ['CashPercent'], 0) },
      { key: 'AlternativePercent', label: 'Alternative', percent: _numSetting(settingsMap, ['AlternativePercent'], 0) }
    ].map(item => ({
      key: item.key,
      label: item.label,
      percent: item.percent,
      projectedAmount: totalContributions * (item.percent / 100) * (1 + projectionRate / 100)
    }));

    const allocationTotalPercent = allocationBreakdown.reduce((sum, item) => sum + (Number(item.percent) || 0), 0);
    const allocationIsValid = Math.abs(allocationTotalPercent - 100) < 0.0001;

    const now = new Date();
    const founderLocks = locks.rows.map(row => {
      const amount = Number(row[locks.idx.AmountUSD]) || 0;
      const expiryRaw = row[locks.idx.ExpiryDate];
      const lockYears = Number(row[locks.idx.LockYears]) || 0;
      const released = _toBoolean(row[locks.idx.Released]);
      return {
        AmountUSD: amount,
        ExpiryDate: _safeIsoDate(expiryRaw),
        LockYears: lockYears,
        Released: released,
        progressPercent: _computeFounderLockProgress(expiryRaw, lockYears, now)
      };
    });

    const founderLockTotals = founderLocks.reduce((acc, item) => {
      acc.totalLocked += item.AmountUSD;
      if (item.Released) {
        acc.totalReleased += item.AmountUSD;
      } else {
        acc.activeLocked += item.AmountUSD;
      }
      return acc;
    }, {
      totalLocked: 0,
      totalReleased: 0,
      activeLocked: 0
    });

    const categoryTotals = contributions.rows.reduce((acc, row) => {
      const type = String(row[contributions.idx.ContributionType] || 'Other').trim() || 'Other';
      acc[type] = (acc[type] || 0) + (Number(row[contributions.idx.AmountUSD]) || 0);
      return acc;
    }, {});

    return {
      success: true,
      totals: {
        totalContributions: totalContributions,
        contributionCategories: categoryTotals
      },
      founderLocks: {
        totalLocked: founderLockTotals.totalLocked,
        totalReleased: founderLockTotals.totalReleased,
        activeLocked: founderLockTotals.activeLocked,
        totalRecords: founderLocks.length,
        locks: founderLocks
      },
      allocation: {
        projectionRate: projectionRate,
        totalPercent: allocationTotalPercent,
        isValid: allocationIsValid,
        message: allocationIsValid ? '' : 'Allocation percentages in InstitutionSettings must total 100.',
        breakdown: allocationBreakdown
      },
      projection: {
        totalProjected: allocationBreakdown.reduce((sum, item) => sum + item.projectedAmount, 0)
      }
    };
  } catch (e) {
    throw new Error(_errMsg('getFinanceDashboardData', e));
  }
}

/* =====================================================
   TIMELINE (HISTORY + EVENTS)
===================================================== */

function getHistoryEvents(token) {
  try {
    _auth(token);

    const history = _readSheet('History', {
      Title: ['Title'],
      EventDate: ['EventDate', 'Date'],
      EventType: ['EventType', 'Type'],
      Description: ['Description', 'Details']
    });

    const timelineEvents = _readSheet('Events', {
      EventID: ['EventID', 'ID'],
      Title: ['Title'],
      EventDate: ['EventDate', 'Date'],
      Recurrence: ['Recurrence', 'Repeat']
    });

    const now = new Date();

    const historyRows = history.rows
      .map(row => _mapHistoryRow(history, row))
      .filter(item => item.EventDate)
      .sort((a, b) => new Date(b.EventDate).getTime() - new Date(a.EventDate).getTime());

    const pastEventRows = timelineEvents.rows
      .map(row => _mapEventRow(timelineEvents, row))
      .filter(item => {
        if (!item.EventDate) {
          return false;
        }
        const date = new Date(item.EventDate);
        return !isNaN(date.getTime()) && date.getTime() < now.getTime() && !item.IsRecurring;
      })
      .map(item => ({
        Title: item.Title,
        EventDate: item.EventDate,
        EventType: 'Event',
        Description: item.Recurrence ? 'Recurrence: ' + item.Recurrence : ''
      }));

    return historyRows
      .concat(pastEventRows)
      .sort((a, b) => new Date(b.EventDate).getTime() - new Date(a.EventDate).getTime());
  } catch (e) {
    throw new Error(_errMsg('getHistoryEvents', e));
  }
}

function getUpcomingEvents(token) {
  try {
    _auth(token);

    const events = _readSheet('Events', {
      EventID: ['EventID', 'ID'],
      Title: ['Title'],
      EventDate: ['EventDate', 'Date'],
      Recurrence: ['Recurrence', 'Repeat']
    });

    const today = _startOfDay(new Date());

    return events.rows
      .map(row => _mapEventRow(events, row))
      .map(item => {
        const normalizedRecurrence = _normalizeRecurrence(item.Recurrence);
        const nextOccurrence = _computeNextOccurrence(item.EventDate, normalizedRecurrence, today);
        return {
          EventID: item.EventID,
          Title: item.Title,
          EventDate: item.EventDate,
          Recurrence: item.Recurrence,
          RecurrenceNormalized: normalizedRecurrence,
          NextOccurrence: nextOccurrence ? nextOccurrence.toISOString() : ''
        };
      })
      .filter(item => item.NextOccurrence)
      .sort((a, b) => new Date(a.NextOccurrence).getTime() - new Date(b.NextOccurrence).getTime());
  } catch (e) {
    throw new Error(_errMsg('getUpcomingEvents', e));
  }
}

function getTimelineData(token) {
  try {
    _auth(token);

    const historySheet = _readSheet('History', {
      Title: ['Title'],
      EventDate: ['EventDate', 'Date'],
      EventType: ['EventType', 'Type'],
      Description: ['Description', 'Details']
    });

    const eventSheet = _readSheet('Events', {
      EventID: ['EventID', 'ID'],
      Title: ['Title'],
      EventDate: ['EventDate', 'Date'],
      Recurrence: ['Recurrence', 'Repeat']
    });

    const now = new Date();
    const today = _startOfDay(new Date());

    const history = historySheet.rows
      .map(row => _mapHistoryRow(historySheet, row))
      .filter(item => item.EventDate)
      .sort((a, b) => new Date(b.EventDate).getTime() - new Date(a.EventDate).getTime());

    const eventRows = eventSheet.rows.map(row => _mapEventRow(eventSheet, row));

    const historyWithPastEvents = history
      .concat(eventRows
        .filter(item => {
          if (!item.EventDate) {
            return false;
          }
          const date = new Date(item.EventDate);
          return !isNaN(date.getTime()) && date.getTime() < now.getTime() && !item.IsRecurring;
        })
        .map(item => ({
          Title: item.Title,
          EventDate: item.EventDate,
          EventType: 'Event',
          Description: item.Recurrence ? 'Recurrence: ' + item.Recurrence : ''
        })))
      .sort((a, b) => new Date(b.EventDate).getTime() - new Date(a.EventDate).getTime());

    const upcoming = eventRows
      .map(item => {
        const normalizedRecurrence = _normalizeRecurrence(item.Recurrence);
        const nextOccurrence = _computeNextOccurrence(item.EventDate, normalizedRecurrence, today);
        return {
          EventID: item.EventID,
          Title: item.Title,
          EventDate: item.EventDate,
          Recurrence: item.Recurrence,
          RecurrenceNormalized: normalizedRecurrence,
          NextOccurrence: nextOccurrence ? nextOccurrence.toISOString() : ''
        };
      })
      .filter(item => item.NextOccurrence)
      .sort((a, b) => new Date(a.NextOccurrence).getTime() - new Date(b.NextOccurrence).getTime());

    const list = historyWithPastEvents
      .map(item => ({
        category: 'historical',
        date: item.EventDate,
        title: item.Title,
        eventType: item.EventType,
        recurrence: '',
        description: item.Description || ''
      }))
      .concat(upcoming.map(item => ({
        category: 'upcoming',
        date: item.NextOccurrence,
        title: item.Title,
        eventType: 'Event',
        recurrence: item.Recurrence,
        description: ''
      })))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      historical: historyWithPastEvents,
      upcoming: upcoming,
      timeline: list
    };
  } catch (e) {
    throw new Error(_errMsg('getTimelineData', e));
  }
}

/* =====================================================
   MESSAGING
===================================================== */

function getUserChannels(token) {
  try {
    const session = _auth(token);
    const messageCtx = _getMessagingSheets();
    const email = _norm(session.email);

    const memberChannelIds = messageCtx.channelMembers.rows.reduce((acc, row) => {
      if (_norm(row[messageCtx.channelMembers.idx.Email]) === email) {
        const channelId = String(row[messageCtx.channelMembers.idx.ChannelID] || '').trim();
        if (channelId) {
          acc[channelId] = true;
        }
      }
      return acc;
    }, {});

    return messageCtx.channels.rows
      .filter(row => {
        const channelId = String(row[messageCtx.channels.idx.ChannelID] || '').trim();
        const isActiveRaw = String(row[messageCtx.channels.idx.IsActive] || '').toLowerCase().trim();
        const type = String(row[messageCtx.channels.idx.Type] || '').toLowerCase().trim();
        const isActive = isActiveRaw !== 'false' && isActiveRaw !== '0' && isActiveRaw !== 'no';
        return !!memberChannelIds[channelId] && isActive && CHANNEL_TYPES.indexOf(type) !== -1;
      })
      .map(row => ({
        ChannelID: String(row[messageCtx.channels.idx.ChannelID] || '').trim(),
        Name: String(row[messageCtx.channels.idx.Name] || '').trim(),
        Type: String(row[messageCtx.channels.idx.Type] || '').trim(),
        IsActive: row[messageCtx.channels.idx.IsActive]
      }));
  } catch (e) {
    throw new Error(_errMsg('getUserChannels', e));
  }
}

function getMessages(token, channelID) {
  try {
    const session = _auth(token);
    const messageCtx = _getMessagingSheets();
    const channel = _resolveAuthorizedChannel(messageCtx, session.email, channelID);

    return messageCtx.messages.rows
      .filter(row => String(row[messageCtx.messages.idx.ChannelID] || '').trim() === channel.ChannelID)
      .map(row => ({
        ChannelID: String(row[messageCtx.messages.idx.ChannelID] || '').trim(),
        SenderEmail: String(row[messageCtx.messages.idx.SenderEmail] || '').trim(),
        Body: String(row[messageCtx.messages.idx.Body] || ''),
        SentAt: row[messageCtx.messages.idx.SentAt]
      }))
      .sort((a, b) => new Date(a.SentAt).getTime() - new Date(b.SentAt).getTime());
  } catch (e) {
    throw new Error(_errMsg('getMessages', e));
  }
}

function sendMessage(token, channelID, body) {
  try {
    const session = _auth(token);
    const messageCtx = _getMessagingSheets();
    const channel = _resolveAuthorizedChannel(messageCtx, session.email, channelID);
    const messageBody = String(body || '').trim();

    if (!messageBody) {
      throw new Error('Message body is required.');
    }

    const row = new Array(messageCtx.messages.headers.length).fill('');
    row[messageCtx.messages.idx.ChannelID] = channel.ChannelID;
    row[messageCtx.messages.idx.SenderEmail] = _norm(session.email);
    row[messageCtx.messages.idx.Body] = messageBody;
    row[messageCtx.messages.idx.SentAt] = new Date().toISOString();

    messageCtx.messages.sheet.appendRow(row);

    return {
      success: true,
      message: {
        ChannelID: row[messageCtx.messages.idx.ChannelID],
        SenderEmail: row[messageCtx.messages.idx.SenderEmail],
        Body: row[messageCtx.messages.idx.Body],
        SentAt: row[messageCtx.messages.idx.SentAt]
      }
    };
  } catch (e) {
    throw new Error(_errMsg('sendMessage', e));
  }
}


/* =====================================================
   PROJECT MANAGEMENT
===================================================== */

function createProject(token, title, goalUSD, status) {
  try {
    const session = _auth(token);
    const projectsCtx = _getProjectSheets();
    _assertProjectEditor(session, projectsCtx);

    const normalizedTitle = String(title || '').trim();
    if (!normalizedTitle) {
      throw new Error('Project title is required.');
    }

    const numericGoal = Number(goalUSD);
    if (isNaN(numericGoal) || numericGoal < 0) {
      throw new Error('GoalUSD must be a valid non-negative number.');
    }

    const projectID = 'PRJ-' + Utilities.getUuid().split('-')[0].toUpperCase();
    const row = new Array(projectsCtx.projects.headers.length).fill('');
    row[projectsCtx.projects.idx.ProjectID] = projectID;
    row[projectsCtx.projects.idx.Title] = normalizedTitle;
    row[projectsCtx.projects.idx.GoalUSD] = numericGoal;
    row[projectsCtx.projects.idx.Status] = _normalizeProjectStatus(status);

    projectsCtx.projects.sheet.appendRow(row);

    return {
      success: true,
      project: {
        ProjectID: projectID,
        Title: normalizedTitle,
        GoalUSD: numericGoal,
        Status: row[projectsCtx.projects.idx.Status]
      }
    };
  } catch (e) {
    throw new Error(_errMsg('createProject', e));
  }
}

function getProjects(token) {
  try {
    const session = _auth(token);
    const projectsCtx = _getProjectSheets();

    const tasksByProject = projectsCtx.tasks.rows.reduce((acc, row, i) => {
      const rowIndex = i + 2;
      const projectID = String(row[projectsCtx.tasks.idx.ProjectID] || '').trim();
      if (!projectID) {
        return acc;
      }

      const task = {
        TaskID: _deriveProjectTaskID(projectsCtx.tasks, row, rowIndex),
        ProjectID: projectID,
        PercentComplete: _clampPercent(row[projectsCtx.tasks.idx.PercentComplete]),
        Status: _normalizeTaskStatus(row[projectsCtx.tasks.idx.Status]),
        Priority: _normalizeTaskPriority(row[projectsCtx.tasks.idx.Priority]),
        SortOrder: rowIndex,
        Gantt: {
          id: _deriveProjectTaskID(projectsCtx.tasks, row, rowIndex),
          parent: projectID,
          progress: _clampPercent(row[projectsCtx.tasks.idx.PercentComplete]),
          status: _normalizeTaskStatus(row[projectsCtx.tasks.idx.Status]),
          priority: _normalizeTaskPriority(row[projectsCtx.tasks.idx.Priority]),
          sortOrder: rowIndex
        }
      };

      if (!acc[projectID]) {
        acc[projectID] = [];
      }

      acc[projectID].push(task);
      return acc;
    }, {});

    const projects = projectsCtx.projects.rows.map(row => {
      const projectID = String(row[projectsCtx.projects.idx.ProjectID] || '').trim();
      const projectTasks = tasksByProject[projectID] || [];
      const avgProgress = projectTasks.length
        ? (projectTasks.reduce((sum, task) => sum + task.PercentComplete, 0) / projectTasks.length)
        : 0;

      return {
        ProjectID: projectID,
        Title: String(row[projectsCtx.projects.idx.Title] || '').trim(),
        GoalUSD: Number(row[projectsCtx.projects.idx.GoalUSD]) || 0,
        Status: _normalizeProjectStatus(row[projectsCtx.projects.idx.Status]),
        ProgressPercent: Number(avgProgress.toFixed(2)),
        TaskCount: projectTasks.length,
        TasksCompleted: projectTasks.filter(task => task.PercentComplete >= 100 || _norm(task.Status) === 'done').length,
        Gantt: {
          id: projectID,
          progress: Number(avgProgress.toFixed(2)),
          children: projectTasks.map(task => task.Gantt)
        }
      };
    });

    return {
      success: true,
      permissions: _getProjectPermissions(session, projectsCtx),
      projects: projects
    };
  } catch (e) {
    throw new Error(_errMsg('getProjects', e));
  }
}

function createProjectTask(token, projectID, status, priority, percentComplete) {
  try {
    const session = _auth(token);
    const projectsCtx = _getProjectSheets();
    _assertProjectEditor(session, projectsCtx);

    const normalizedProjectID = String(projectID || '').trim();
    if (!normalizedProjectID) {
      throw new Error('ProjectID is required.');
    }

    const projectExists = projectsCtx.projects.rows.some(row => String(row[projectsCtx.projects.idx.ProjectID] || '').trim() === normalizedProjectID);
    if (!projectExists) {
      throw new Error('Project not found.');
    }

    const row = new Array(projectsCtx.tasks.headers.length).fill('');
    row[projectsCtx.tasks.idx.ProjectID] = normalizedProjectID;
    row[projectsCtx.tasks.idx.PercentComplete] = _clampPercent(percentComplete);
    row[projectsCtx.tasks.idx.Status] = _normalizeTaskStatus(status);
    row[projectsCtx.tasks.idx.Priority] = _normalizeTaskPriority(priority);

    const taskIDHeaderIndex = projectsCtx.tasks.headers.indexOf('TaskID');
    const generatedTaskID = 'TASK-' + Utilities.getUuid().split('-')[0].toUpperCase();
    if (taskIDHeaderIndex !== -1) {
      row[taskIDHeaderIndex] = generatedTaskID;
    }

    projectsCtx.tasks.sheet.appendRow(row);
    const appendedRowIndex = projectsCtx.tasks.rows.length + 2;
    const taskID = taskIDHeaderIndex !== -1 ? generatedTaskID : ('TASK-' + appendedRowIndex);

    return {
      success: true,
      task: {
        TaskID: taskID,
        ProjectID: normalizedProjectID,
        PercentComplete: row[projectsCtx.tasks.idx.PercentComplete],
        Status: row[projectsCtx.tasks.idx.Status],
        Priority: row[projectsCtx.tasks.idx.Priority]
      }
    };
  } catch (e) {
    throw new Error(_errMsg('createProjectTask', e));
  }
}

function updateProjectTask(token, taskID, percentComplete, status, priority) {
  try {
    const session = _auth(token);
    const projectsCtx = _getProjectSheets();
    _assertProjectEditor(session, projectsCtx);

    const normalizedTaskID = String(taskID || '').trim();
    if (!normalizedTaskID) {
      throw new Error('TaskID is required.');
    }

    const target = _findProjectTaskRow(projectsCtx.tasks, normalizedTaskID);
    if (!target) {
      throw new Error('Task not found.');
    }

    const percentValue = _clampPercent(percentComplete);
    const statusValue = _normalizeTaskStatus(status);
    const priorityValue = _normalizeTaskPriority(priority);

    projectsCtx.tasks.sheet.getRange(target.rowIndex, projectsCtx.tasks.idx.PercentComplete + 1).setValue(percentValue);
    projectsCtx.tasks.sheet.getRange(target.rowIndex, projectsCtx.tasks.idx.Status + 1).setValue(statusValue);
    projectsCtx.tasks.sheet.getRange(target.rowIndex, projectsCtx.tasks.idx.Priority + 1).setValue(priorityValue);

    return {
      success: true,
      task: {
        TaskID: normalizedTaskID,
        ProjectID: target.row[target.ctx.idx.ProjectID],
        PercentComplete: percentValue,
        Status: statusValue,
        Priority: priorityValue
      }
    };
  } catch (e) {
    throw new Error(_errMsg('updateProjectTask', e));
  }
}

function getProjectTasks(token, projectID) {
  try {
    _auth(token);
    const projectsCtx = _getProjectSheets();
    const normalizedProjectID = String(projectID || '').trim();

    if (!normalizedProjectID) {
      throw new Error('ProjectID is required.');
    }

    const tasks = projectsCtx.tasks.rows
      .map((row, i) => ({ row: row, rowIndex: i + 2 }))
      .filter(item => String(item.row[projectsCtx.tasks.idx.ProjectID] || '').trim() === normalizedProjectID)
      .map(item => ({
        TaskID: _deriveProjectTaskID(projectsCtx.tasks, item.row, item.rowIndex),
        ProjectID: normalizedProjectID,
        PercentComplete: _clampPercent(item.row[projectsCtx.tasks.idx.PercentComplete]),
        Status: _normalizeTaskStatus(item.row[projectsCtx.tasks.idx.Status]),
        Priority: _normalizeTaskPriority(item.row[projectsCtx.tasks.idx.Priority]),
        Gantt: {
          id: _deriveProjectTaskID(projectsCtx.tasks, item.row, item.rowIndex),
          parent: normalizedProjectID,
          progress: _clampPercent(item.row[projectsCtx.tasks.idx.PercentComplete]),
          status: _normalizeTaskStatus(item.row[projectsCtx.tasks.idx.Status]),
          priority: _normalizeTaskPriority(item.row[projectsCtx.tasks.idx.Priority]),
          sortOrder: item.rowIndex
        }
      }));

    return {
      success: true,
      tasks: tasks
    };
  } catch (e) {
    throw new Error(_errMsg('getProjectTasks', e));
  }
}

function addProjectUpdate(token, projectID, taskID, updateText) {
  try {
    const session = _auth(token);
    const projectsCtx = _getProjectSheets();
    _assertProjectEditor(session, projectsCtx);

    const normalizedProjectID = String(projectID || '').trim();
    const normalizedTaskID = String(taskID || '').trim();
    const normalizedUpdateText = String(updateText || '').trim();

    if (!normalizedProjectID) {
      throw new Error('ProjectID is required.');
    }

    if (!normalizedUpdateText) {
      throw new Error('UpdateText is required.');
    }

    const projectExists = projectsCtx.projects.rows.some(row => String(row[projectsCtx.projects.idx.ProjectID] || '').trim() === normalizedProjectID);
    if (!projectExists) {
      throw new Error('Project not found.');
    }

    if (normalizedTaskID) {
      const task = _findProjectTaskRow(projectsCtx.tasks, normalizedTaskID);
      if (!task || String(task.row[task.ctx.idx.ProjectID] || '').trim() !== normalizedProjectID) {
        throw new Error('Task does not belong to this project.');
      }
    }

    const generatedUpdateID = 'UPD-' + Utilities.getUuid().split('-')[0].toUpperCase();
    const row = new Array(projectsCtx.updates.headers.length).fill('');
    row[projectsCtx.updates.idx.UpdateID] = generatedUpdateID;
    row[projectsCtx.updates.idx.ProjectID] = normalizedProjectID;
    row[projectsCtx.updates.idx.TaskID] = normalizedTaskID;
    row[projectsCtx.updates.idx.UpdateText] = normalizedUpdateText;

    projectsCtx.updates.sheet.appendRow(row);

    return {
      success: true,
      update: {
        UpdateID: generatedUpdateID,
        ProjectID: normalizedProjectID,
        TaskID: normalizedTaskID,
        UpdateText: normalizedUpdateText
      }
    };
  } catch (e) {
    throw new Error(_errMsg('addProjectUpdate', e));
  }
}

function getProjectUpdates(token, projectID) {
  try {
    _auth(token);
    const projectsCtx = _getProjectSheets();
    const normalizedProjectID = String(projectID || '').trim();

    if (!normalizedProjectID) {
      throw new Error('ProjectID is required.');
    }

    const updates = projectsCtx.updates.rows
      .filter(row => String(row[projectsCtx.updates.idx.ProjectID] || '').trim() === normalizedProjectID)
      .map((row, i) => ({
        UpdateID: String(row[projectsCtx.updates.idx.UpdateID] || '').trim() || ('UPD-' + (i + 2)),
        ProjectID: normalizedProjectID,
        TaskID: String(row[projectsCtx.updates.idx.TaskID] || '').trim(),
        UpdateText: String(row[projectsCtx.updates.idx.UpdateText] || '').trim()
      }));

    return {
      success: true,
      updates: updates
    };
  } catch (e) {
    throw new Error(_errMsg('getProjectUpdates', e));
  }
}


/* =====================================================
   ADMIN USER REGISTRY
===================================================== */

function adminGetAllUsers(token) {
  try {
    const session = _auth(token);

    if (session.role !== 'Admin') {
      throw new Error('Unauthorized');
    }

    const access = _readSheet('Access', {
      EmailOptional: ['EmailOptional', 'Email'],
      FullName: ['FullName', 'Name'],
      OneTimeCode: ['OneTimeCode', 'OTP']
    });

    return access.rows.map(row => {
      const obj = {};

      access.headers.forEach((h, i) => {
        obj[h] = row[i];
      });

      return obj;
    });
  } catch (e) {
    throw new Error(_errMsg('adminGetAllUsers', e));
  }
}

/* =====================================================
   SOS ALERT
===================================================== */

function triggerSOS(token, lat, lng) {
  try {
    const session = _auth(token);
    const sos = _getSOSSheets();
    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      throw new Error('Valid latitude is required.');
    }

    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      throw new Error('Valid longitude is required.');
    }

    const row = new Array(sos.alerts.headers.length).fill('');
    row[sos.alerts.idx.ReporterEmail] = _norm(session.email);
    row[sos.alerts.idx.Lat] = latNum;
    row[sos.alerts.idx.Lng] = lngNum;
    row[sos.alerts.idx.Status] = 'Open';
    row[sos.alerts.idx.WhatsAppLink] = _buildSOSWhatsAppLink(sos.settings, session.email, latNum, lngNum);

    sos.alerts.sheet.appendRow(row);

    const alertRowIndex = sos.alerts.rows.length + 2;

    return {
      success: true,
      alert: {
        SOSID: _deriveSOSID(sos.alerts, row, alertRowIndex),
        ReporterEmail: _norm(session.email),
        Lat: latNum,
        Lng: lngNum,
        Status: 'Open',
        WhatsAppLink: row[sos.alerts.idx.WhatsAppLink]
      }
    };
  } catch (e) {
    throw new Error(_errMsg('triggerSOS', e));
  }
}

function getSOSAlerts(token) {
  try {
    const session = _auth(token);
    const sos = _getSOSSheets();
    const permissions = _getSOSPermissions(session, sos);
    const email = _norm(session.email);

    const alerts = sos.alerts.rows
      .map((row, i) => {
        const rowIndex = i + 2;
        return {
          SOSID: _deriveSOSID(sos.alerts, row, rowIndex),
          ReporterEmail: _norm(row[sos.alerts.idx.ReporterEmail]),
          Lat: Number(row[sos.alerts.idx.Lat]) || 0,
          Lng: Number(row[sos.alerts.idx.Lng]) || 0,
          Status: String(row[sos.alerts.idx.Status] || '').trim() || 'Open',
          WhatsAppLink: String(row[sos.alerts.idx.WhatsAppLink] || '').trim()
        };
      })
      .filter(alert => {
        if (permissions.canViewAllAlerts) {
          return true;
        }
        return alert.ReporterEmail === email;
      })
      .sort((a, b) => String(b.SOSID).localeCompare(String(a.SOSID)));

    return {
      success: true,
      canViewAllAlerts: permissions.canViewAllAlerts,
      canViewSOSMedia: permissions.canViewSOSMedia,
      alerts: alerts
    };
  } catch (e) {
    throw new Error(_errMsg('getSOSAlerts', e));
  }
}

function getSOSMedia(token, sosID) {
  try {
    const session = _auth(token);
    const normalizedSOSID = String(sosID || '').trim();

    if (!normalizedSOSID) {
      throw new Error('SOSID is required.');
    }

    const sos = _getSOSSheets();
    const permissions = _getSOSPermissions(session, sos);
    const alert = _findSOSAlertByID(sos, normalizedSOSID);

    if (!alert) {
      throw new Error('SOS alert not found.');
    }

    const isOwner = _norm(alert.ReporterEmail) === _norm(session.email);
    if (!permissions.canViewAllAlerts && !isOwner) {
      throw new Error('Unauthorized to access this SOS alert.');
    }

    if (!permissions.canViewSOSMedia && !isOwner) {
      throw new Error('Unauthorized to view SOS media for this alert.');
    }

    const media = sos.media.rows
      .map(row => ({
        SOSID: String(row[sos.media.idx.SOSID] || '').trim(),
        MediaType: _normalizeSOSMediaType(row[sos.media.idx.MediaType]),
        FileURL: String(row[sos.media.idx.FileURL] || '').trim()
      }))
      .filter(item => item.SOSID === normalizedSOSID && item.FileURL);

    return {
      success: true,
      media: media
    };
  } catch (e) {
    throw new Error(_errMsg('getSOSMedia', e));
  }
}

function saveSOSMedia(token, sosID, mediaType, fileURL) {
  try {
    const session = _auth(token);
    const normalizedSOSID = String(sosID || '').trim();
    const normalizedFileURL = String(fileURL || '').trim();
    const normalizedMediaType = _normalizeSOSMediaType(mediaType);

    if (!normalizedSOSID) {
      throw new Error('SOSID is required.');
    }

    if (!normalizedFileURL) {
      throw new Error('FileURL is required.');
    }

    const sos = _getSOSSheets();
    const permissions = _getSOSPermissions(session, sos);
    const alert = _findSOSAlertByID(sos, normalizedSOSID);

    if (!alert) {
      throw new Error('SOS alert not found.');
    }

    const isOwner = _norm(alert.ReporterEmail) === _norm(session.email);
    if (!permissions.canViewAllAlerts && !isOwner) {
      throw new Error('Unauthorized to attach media to this SOS alert.');
    }

    const row = new Array(sos.media.headers.length).fill('');
    row[sos.media.idx.SOSID] = normalizedSOSID;
    row[sos.media.idx.MediaType] = normalizedMediaType;
    row[sos.media.idx.FileURL] = normalizedFileURL;

    sos.media.sheet.appendRow(row);

    return {
      success: true,
      media: {
        SOSID: normalizedSOSID,
        MediaType: normalizedMediaType,
        FileURL: normalizedFileURL
      }
    };
  } catch (e) {
    throw new Error(_errMsg('saveSOSMedia', e));
  }
}

/* =====================================================
   GOVERNANCE VOTING
===================================================== */

function createVote(token, title, thresholdType, status) {
  try {
    const session = _auth(token);
    const governance = _getGovernanceSheets();
    const normalizedTitle = String(title || '').trim();
    const normalizedThresholdType = _normalizeThresholdType(thresholdType);
    const normalizedStatus = String(status || '').trim() || 'Open';

    if (!normalizedTitle) {
      throw new Error('Vote title is required.');
    }

    _assertVoteCreatorAuthorized(session, governance);

    const voteID = 'VOTE-' + Utilities.getUuid().split('-')[0].toUpperCase();
    const row = new Array(governance.votes.headers.length).fill('');
    row[governance.votes.idx.VoteID] = voteID;
    row[governance.votes.idx.Title] = normalizedTitle;
    row[governance.votes.idx.ThresholdType] = normalizedThresholdType;
    row[governance.votes.idx.Status] = normalizedStatus;

    governance.votes.sheet.appendRow(row);

    return {
      success: true,
      vote: {
        VoteID: voteID,
        Title: normalizedTitle,
        ThresholdType: normalizedThresholdType,
        Status: normalizedStatus
      }
    };
  } catch (e) {
    throw new Error(_errMsg('createVote', e));
  }
}

function castVote(token, voteID, voteChoice) {
  try {
    const session = _auth(token);
    const governance = _getGovernanceSheets();
    const normalizedVoteID = String(voteID || '').trim();
    const normalizedChoice = _normalizeVoteChoice(voteChoice);

    if (!normalizedVoteID) {
      throw new Error('VoteID is required.');
    }

    const vote = governance.votes.rows
      .map(row => ({
        VoteID: String(row[governance.votes.idx.VoteID] || '').trim(),
        Title: String(row[governance.votes.idx.Title] || '').trim(),
        ThresholdType: _safeThresholdType(row[governance.votes.idx.ThresholdType]),
        Status: String(row[governance.votes.idx.Status] || '').trim()
      }))
      .find(item => item.VoteID === normalizedVoteID);

    if (!vote) {
      throw new Error('Vote not found.');
    }

    if (_norm(vote.Status) !== 'open') {
      throw new Error('Voting is closed for this proposal.');
    }

    _assertVoterEligible(session, governance);

    const existingBallot = governance.voteBallots.rows.some(row => {
      return String(row[governance.voteBallots.idx.VoteID] || '').trim() === normalizedVoteID &&
        _norm(row[governance.voteBallots.idx.VoterEmail]) === _norm(session.email);
    });

    if (existingBallot) {
      throw new Error('A ballot has already been cast for this vote.');
    }

    const row = new Array(governance.voteBallots.headers.length).fill('');
    row[governance.voteBallots.idx.VoteID] = normalizedVoteID;
    row[governance.voteBallots.idx.VoterEmail] = _norm(session.email);
    row[governance.voteBallots.idx.VoteChoice] = normalizedChoice;

    governance.voteBallots.sheet.appendRow(row);

    return {
      success: true,
      voteID: normalizedVoteID,
      voteChoice: normalizedChoice
    };
  } catch (e) {
    throw new Error(_errMsg('castVote', e));
  }
}

function tallyVotes(token, voteID) {
  try {
    _auth(token);
    const governance = _getGovernanceSheets();
    const normalizedVoteID = String(voteID || '').trim();

    if (!normalizedVoteID) {
      throw new Error('VoteID is required.');
    }

    const vote = governance.votes.rows
      .map(row => ({
        VoteID: String(row[governance.votes.idx.VoteID] || '').trim(),
        Title: String(row[governance.votes.idx.Title] || '').trim(),
        ThresholdType: _safeThresholdType(row[governance.votes.idx.ThresholdType]),
        Status: String(row[governance.votes.idx.Status] || '').trim()
      }))
      .find(item => item.VoteID === normalizedVoteID);

    if (!vote) {
      throw new Error('Vote not found.');
    }

    const ballotRows = governance.voteBallots.rows
      .filter(row => String(row[governance.voteBallots.idx.VoteID] || '').trim() === normalizedVoteID);

    const counts = ballotRows.reduce((acc, row) => {
      const choice = _safeVoteChoice(row[governance.voteBallots.idx.VoteChoice]);
      if (choice === 'Yes') acc.yes += 1;
      else if (choice === 'No') acc.no += 1;
      else if (choice === 'Abstain') acc.abstain += 1;
      return acc;
    }, { yes: 0, no: 0, abstain: 0 });

    const totalBallots = counts.yes + counts.no + counts.abstain;
    const passed = _evaluateVoteThreshold(vote.ThresholdType, counts.yes, totalBallots);

    return {
      success: true,
      VoteID: vote.VoteID,
      Title: vote.Title,
      ThresholdType: vote.ThresholdType,
      Status: vote.Status,
      totalBallots: totalBallots,
      yesCount: counts.yes,
      noCount: counts.no,
      abstainCount: counts.abstain,
      thresholdPassed: passed
    };
  } catch (e) {
    throw new Error(_errMsg('tallyVotes', e));
  }
}

function getVotes(token) {
  try {
    const session = _auth(token);
    const governance = _getGovernanceSheets();

    const ballotsByVote = governance.voteBallots.rows.reduce((acc, row) => {
      const voteID = String(row[governance.voteBallots.idx.VoteID] || '').trim();
      if (!voteID) {
        return acc;
      }

      if (!acc[voteID]) {
        acc[voteID] = { yes: 0, no: 0, abstain: 0, total: 0, voterEmails: {} };
      }

      const choice = _safeVoteChoice(row[governance.voteBallots.idx.VoteChoice]);
      const voterEmail = _norm(row[governance.voteBallots.idx.VoterEmail]);

      if (choice === 'Yes') acc[voteID].yes += 1;
      else if (choice === 'No') acc[voteID].no += 1;
      else if (choice === 'Abstain') acc[voteID].abstain += 1;

      acc[voteID].total += 1;
      if (voterEmail) {
        acc[voteID].voterEmails[voterEmail] = true;
      }

      return acc;
    }, {});

    const canCreate = _canCreateVote(session, governance);
    const canCast = _isEligibleVoter(session, governance);

    const votes = governance.votes.rows.map(row => {
      const VoteID = String(row[governance.votes.idx.VoteID] || '').trim();
      const tally = ballotsByVote[VoteID] || { yes: 0, no: 0, abstain: 0, total: 0, voterEmails: {} };
      const ThresholdType = _safeThresholdType(row[governance.votes.idx.ThresholdType]);

      return {
        VoteID: VoteID,
        Title: String(row[governance.votes.idx.Title] || '').trim(),
        ThresholdType: ThresholdType,
        Status: String(row[governance.votes.idx.Status] || '').trim(),
        totalBallots: tally.total,
        yesCount: tally.yes,
        noCount: tally.no,
        abstainCount: tally.abstain,
        thresholdPassed: _evaluateVoteThreshold(ThresholdType, tally.yes, tally.total),
        hasUserVoted: !!tally.voterEmails[_norm(session.email)]
      };
    });

    return {
      success: true,
      canCreateVote: canCreate,
      canCastBallot: canCast,
      votes: votes
    };
  } catch (e) {
    throw new Error(_errMsg('getVotes', e));
  }
}

/* =====================================================
   AUTH UTILITIES
===================================================== */

function _auth(token) {
  try {
    const tokenValue = String(token || '').trim();
    if (!tokenValue) {
      throw new Error('Session expired.');
    }

    const cached = CacheService
      .getScriptCache()
      .get(tokenValue);

    if (!cached) {
      throw new Error('Session expired.');
    }

    return JSON.parse(cached);
  } catch (e) {
    throw new Error(_errMsg('_auth', e));
  }
}

/* =====================================================
   SHEET UTILITIES
===================================================== */

function _ss() {
  if (_SS_CACHE) {
    return _SS_CACHE;
  }

  _SS_CACHE = SpreadsheetApp.openById(SS_ID);
  return _SS_CACHE;
}

function _sh(name) {
  try {
    const sh = _ss().getSheetByName(name);

    if (!sh) {
      throw new Error('Missing sheet: ' + name);
    }

    return sh;
  } catch (e) {
    throw new Error(_errMsg('_sh', e));
  }
}

function _readSheet(name, requiredHeadersMap) {
  try {
    const sheet = _sh(name);
    const data = sheet.getDataRange().getValues();
    const headers = (data[0] || []).map(h => String(h).trim());

    if (!headers.length) {
      throw new Error('Sheet has no headers: ' + name);
    }

    const idx = _resolveRequiredHeaders(headers, requiredHeadersMap || {});

    return {
      sheet: sheet,
      headers: headers,
      idx: idx,
      rows: data.slice(1)
    };
  } catch (e) {
    throw new Error(_errMsg('_readSheet', e));
  }
}

function _resolveRequiredHeaders(headers, requiredHeadersMap) {
  const idx = {};

  Object.keys(requiredHeadersMap).forEach(key => {
    const aliases = requiredHeadersMap[key] || [];

    const found = aliases.reduce((foundIndex, alias) => {
      if (foundIndex !== -1) {
        return foundIndex;
      }

      return headers.indexOf(alias);
    }, -1);

    if (found === -1) {
      throw new Error('Missing required header for ' + key + ': ' + aliases.join(' / '));
    }

    idx[key] = found;
  });

  return idx;
}



function _getGovernanceSheets() {
  return {
    votes: _readSheet('Votes', {
      VoteID: ['VoteID'],
      Title: ['Title'],
      ThresholdType: ['ThresholdType'],
      Status: ['Status']
    }),
    voteBallots: _readSheet('VoteBallots', {
      VoteID: ['VoteID'],
      VoterEmail: ['VoterEmail', 'Email'],
      VoteChoice: ['VoteChoice', 'Choice']
    }),
    access: _readSheet('Access', {
      EmailOptional: ['EmailOptional', 'Email'],
      Role: ['Role', 'RoleName']
    }),
    roles: _readSheet('Roles', {
      Email: ['Email', 'EmailOptional'],
      RoleName: ['RoleName', 'Role'],
      IsAdult: ['IsAdult', 'Adult']
    })
  };
}


function _getProjectSheets() {
  return {
    projects: _readSheet('Projects', {
      ProjectID: ['ProjectID'],
      Title: ['Title'],
      GoalUSD: ['GoalUSD'],
      Status: ['Status']
    }),
    tasks: _readSheet('ProjectTasks', {
      ProjectID: ['ProjectID'],
      PercentComplete: ['PercentComplete'],
      Status: ['Status'],
      Priority: ['Priority']
    }),
    updates: _readSheet('ProjectUpdates', {
      UpdateID: ['UpdateID'],
      ProjectID: ['ProjectID'],
      TaskID: ['TaskID'],
      UpdateText: ['UpdateText']
    }),
    access: _readSheet('Access', {
      EmailOptional: ['EmailOptional', 'Email'],
      Role: ['Role', 'RoleName']
    }),
    roles: _readSheet('Roles', {
      Email: ['Email', 'EmailOptional'],
      RoleName: ['RoleName', 'Role'],
      IsAdult: ['IsAdult', 'Adult']
    })
  };
}

function _getProjectPermissions(session, projectsCtx) {
  const email = _norm(session.email);

  const accessRole = projectsCtx.access.rows.reduce((found, row) => {
    if (found) return found;
    if (_norm(row[projectsCtx.access.idx.EmailOptional]) === email) {
      return String(row[projectsCtx.access.idx.Role] || '').trim();
    }
    return '';
  }, '');

  const privilegedNames = ['admin', 'project', 'pm', 'governance', 'chair', 'secretary'];

  const hasPrivilegedAccessRole = privilegedNames.some(name => _norm(accessRole).indexOf(name) !== -1);

  const hasPrivilegedRole = projectsCtx.roles.rows.some(row => {
    if (_norm(row[projectsCtx.roles.idx.Email]) !== email) {
      return false;
    }

    const roleName = _norm(row[projectsCtx.roles.idx.RoleName]);
    return privilegedNames.some(name => roleName.indexOf(name) !== -1);
  });

  const canEdit = hasPrivilegedAccessRole || hasPrivilegedRole;

  return {
    canCreateProject: canEdit,
    canEditTask: canEdit
  };
}

function _assertProjectEditor(session, projectsCtx) {
  const permissions = _getProjectPermissions(session, projectsCtx);
  if (!permissions.canEditTask) {
    throw new Error('Unauthorized to manage projects.');
  }
}

function _normalizeProjectStatus(value) {
  const normalized = String(value || '').trim();
  return normalized || 'Planning';
}

function _normalizeTaskStatus(value) {
  const normalized = String(value || '').trim();
  return normalized || 'Pending';
}

function _normalizeTaskPriority(value) {
  const normalized = String(value || '').trim();
  return normalized || 'Medium';
}

function _clampPercent(value) {
  const parsed = Number(value);
  if (isNaN(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, parsed));
}

function _deriveProjectTaskID(tasksCtx, row, rowIndex) {
  const taskIDHeaderIndex = tasksCtx.headers.indexOf('TaskID');
  const explicitTaskID = taskIDHeaderIndex !== -1 ? String(row[taskIDHeaderIndex] || '').trim() : '';
  return explicitTaskID || ('TASK-' + rowIndex);
}

function _findProjectTaskRow(tasksCtx, taskID) {
  const normalizedTaskID = String(taskID || '').trim();
  if (!normalizedTaskID) {
    return null;
  }

  for (let i = 0; i < tasksCtx.rows.length; i += 1) {
    const row = tasksCtx.rows[i];
    const rowIndex = i + 2;
    if (_deriveProjectTaskID(tasksCtx, row, rowIndex) === normalizedTaskID) {
      return {
        ctx: tasksCtx,
        row: row,
        rowIndex: rowIndex
      };
    }
  }

  return null;
}

function _normalizeThresholdType(value) {
  const normalized = String(value || '').replace(/\s+/g, '').toLowerCase();
  if (normalized === 'majority') return 'Majority';
  if (normalized === 'twothirds' || normalized === '2/3' || normalized === '66' || normalized === '66.67') return 'TwoThirds';
  if (normalized === 'seventyfive' || normalized === '75' || normalized === '75%') return 'SeventyFive';
  throw new Error('Unsupported threshold type. Use Majority, TwoThirds, or SeventyFive.');
}

function _safeThresholdType(value) {
  try {
    return _normalizeThresholdType(value);
  } catch (e) {
    return 'Majority';
  }
}

function _normalizeVoteChoice(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'yes' || normalized === 'y') return 'Yes';
  if (normalized === 'no' || normalized === 'n') return 'No';
  if (normalized === 'abstain' || normalized === 'abstained') return 'Abstain';
  throw new Error('VoteChoice must be Yes, No, or Abstain.');
}

function _safeVoteChoice(value) {
  try {
    return _normalizeVoteChoice(value);
  } catch (e) {
    return '';
  }
}

function _evaluateVoteThreshold(thresholdType, yesCount, totalBallots) {
  const total = Number(totalBallots) || 0;
  const yes = Number(yesCount) || 0;

  if (total <= 0) {
    return false;
  }

  if (thresholdType === 'Majority') {
    return yes > (total / 2);
  }

  if (thresholdType === 'TwoThirds') {
    return yes >= Math.ceil((2 * total) / 3);
  }

  if (thresholdType === 'SeventyFive') {
    return yes >= Math.ceil(total * 0.75);
  }

  throw new Error('Unsupported threshold type: ' + thresholdType);
}

function _assertVoteCreatorAuthorized(session, governance) {
  if (!_canCreateVote(session, governance)) {
    throw new Error('Unauthorized to create votes.');
  }
}

function _assertVoterEligible(session, governance) {
  if (!_isEligibleVoter(session, governance)) {
    throw new Error('User is not eligible to cast ballots.');
  }
}

function _canCreateVote(session, governance) {
  const email = _norm(session.email);

  const accessRole = governance.access.rows.reduce((found, row) => {
    if (found) return found;
    if (_norm(row[governance.access.idx.EmailOptional]) === email) {
      return String(row[governance.access.idx.Role] || '').trim();
    }
    return '';
  }, '');

  const hasPrivilegedAccessRole = ['admin', 'governance', 'chair', 'secretary'].some(name => _norm(accessRole).indexOf(name) !== -1);

  const privilegedRole = governance.roles.rows.some(row => {
    if (_norm(row[governance.roles.idx.Email]) !== email) {
      return false;
    }
    const roleName = _norm(row[governance.roles.idx.RoleName]);
    return ['admin', 'governance', 'chair', 'secretary'].some(name => roleName.indexOf(name) !== -1);
  });

  return hasPrivilegedAccessRole || privilegedRole;
}

function _isEligibleVoter(session, governance) {
  const email = _norm(session.email);

  const hasAccessRecord = governance.access.rows.some(row => _norm(row[governance.access.idx.EmailOptional]) === email);
  if (!hasAccessRecord) {
    return false;
  }

  const matchingRoles = governance.roles.rows.filter(row => _norm(row[governance.roles.idx.Email]) === email);
  if (!matchingRoles.length) {
    return true;
  }

  return matchingRoles.some(row => {
    const isAdult = row[governance.roles.idx.IsAdult];
    const normalized = String(isAdult || '').toLowerCase().trim();
    if (!normalized) return true;
    return normalized === 'true' || normalized === 'yes' || normalized === '1';
  });
}

function _getMessagingSheets() {
  return {
    channels: _readSheet('Channels', {
      ChannelID: ['ChannelID'],
      Name: ['Name'],
      Type: ['Type'],
      IsActive: ['IsActive']
    }),
    channelMembers: _readSheet('ChannelMembers', {
      ChannelID: ['ChannelID'],
      Email: ['Email'],
      MemberRole: ['MemberRole']
    }),
    messages: _readSheet('Messages', {
      ChannelID: ['ChannelID'],
      SenderEmail: ['SenderEmail'],
      Body: ['Body'],
      SentAt: ['SentAt']
    })
  };
}

function _getSOSSheets() {
  return {
    alerts: _readSheet('SOSAlerts', {
      ReporterEmail: ['ReporterEmail', 'EmailOptional', 'Email'],
      Lat: ['Lat', 'Latitude'],
      Lng: ['Lng', 'Longitude'],
      Status: ['Status'],
      WhatsAppLink: ['WhatsAppLink', 'WhatsAppURL']
    }),
    media: _readSheet('SOSMedia', {
      SOSID: ['SOSID', 'AlertID'],
      MediaType: ['MediaType', 'Type'],
      FileURL: ['FileURL', 'URL', 'MediaURL']
    }),
    settings: _readSheet('Settings', {
      Key: ['Key', 'SettingKey'],
      Value: ['Value', 'SettingValue']
    }),
    access: _readSheet('Access', {
      EmailOptional: ['EmailOptional', 'Email'],
      Role: ['Role', 'RoleName']
    }),
    roles: _readSheet('Roles', {
      Email: ['Email', 'EmailOptional'],
      RoleName: ['RoleName', 'Role'],
      IsAdult: ['IsAdult', 'Adult']
    })
  };
}

function _deriveSOSID(alertsCtx, row, rowIndex) {
  const sosIndex = alertsCtx.headers.indexOf('SOSID');
  const fromHeader = sosIndex !== -1 ? String(row[sosIndex] || '').trim() : '';
  return fromHeader || ('SOS-' + rowIndex);
}

function _buildSOSWhatsAppLink(settingsCtx, reporterEmail, lat, lng) {
  const settingsMap = settingsCtx.rows.reduce((acc, row) => {
    const key = _norm(row[settingsCtx.idx.Key]);
    if (!key) {
      return acc;
    }
    acc[key] = String(row[settingsCtx.idx.Value] || '').trim();
    return acc;
  }, {});

  const emergencyNumber = _pickSetting(settingsMap, [
    'soswhatsappnumber',
    'whatsappnumber',
    'emergencywhatsappnumber',
    'sosnumber'
  ]);

  if (!emergencyNumber) {
    return '';
  }

  const template = _pickSetting(settingsMap, [
    'soswhatsappmessage',
    'sosmessage',
    'emergencymessage'
  ]) || 'Emergency SOS from {email}. Location: {lat}, {lng}';

  const message = template
    .replace(/\{email\}/gi, reporterEmail)
    .replace(/\{lat\}/gi, String(lat))
    .replace(/\{lng\}/gi, String(lng));

  const number = String(emergencyNumber).replace(/[^\d]/g, '');
  if (!number) {
    return '';
  }

  return 'https://wa.me/' + number + '?text=' + encodeURIComponent(message);
}

function _pickSetting(settingsMap, aliases) {
  for (let i = 0; i < aliases.length; i += 1) {
    const alias = _norm(aliases[i]);
    if (!alias) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(settingsMap, alias) && settingsMap[alias]) {
      return settingsMap[alias];
    }
  }
  return '';
}

function _getSOSPermissions(session, sos) {
  const email = _norm(session.email);
  const accessRole = sos.access.rows.reduce((found, row) => {
    if (found) return found;
    if (_norm(row[sos.access.idx.EmailOptional]) === email) {
      return String(row[sos.access.idx.Role] || '').trim();
    }
    return '';
  }, '');

  const roleRows = sos.roles.rows.filter(row => _norm(row[sos.roles.idx.Email]) === email);

  const hasPrivilegedRole = ['admin', 'security', 'governance', 'chair'].some(name => _norm(accessRole).indexOf(name) !== -1) ||
    roleRows.some(row => {
      const roleName = _norm(row[sos.roles.idx.RoleName]);
      return ['admin', 'security', 'governance', 'chair'].some(name => roleName.indexOf(name) !== -1);
    });

  const isAdult = !roleRows.length || roleRows.some(row => {
    const normalized = String(row[sos.roles.idx.IsAdult] || '').toLowerCase().trim();
    if (!normalized) return true;
    return normalized === 'true' || normalized === 'yes' || normalized === '1';
  });

  return {
    canViewAllAlerts: hasPrivilegedRole,
    canViewSOSMedia: hasPrivilegedRole || isAdult
  };
}

function _findSOSAlertByID(sos, sosID) {
  const normalizedSOSID = String(sosID || '').trim();
  if (!normalizedSOSID) {
    return null;
  }

  const mapped = sos.alerts.rows.map((row, i) => {
    const rowIndex = i + 2;
    return {
      SOSID: _deriveSOSID(sos.alerts, row, rowIndex),
      ReporterEmail: _norm(row[sos.alerts.idx.ReporterEmail]),
      Lat: Number(row[sos.alerts.idx.Lat]) || 0,
      Lng: Number(row[sos.alerts.idx.Lng]) || 0,
      Status: String(row[sos.alerts.idx.Status] || '').trim() || 'Open',
      WhatsAppLink: String(row[sos.alerts.idx.WhatsAppLink] || '').trim()
    };
  });

  return mapped.find(item => item.SOSID === normalizedSOSID) || null;
}

function _normalizeSOSMediaType(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (normalized === 'photo' || normalized === 'image') return 'photo';
  if (normalized === 'video') return 'video';
  if (normalized === 'audio' || normalized === 'voice') return 'audio';
  throw new Error('Invalid media type. Use photo, video, or audio.');
}

function _mapHistoryRow(historyCtx, row) {
  const title = String(row[historyCtx.idx.Title] || '').trim();
  const eventType = String(row[historyCtx.idx.EventType] || '').trim();
  const description = String(row[historyCtx.idx.Description] || '').trim();
  const eventDate = _safeIsoDate(row[historyCtx.idx.EventDate]);

  return {
    Title: title,
    EventDate: eventDate,
    EventType: eventType,
    Description: description
  };
}

function _mapEventRow(eventCtx, row) {
  const recurrence = String(row[eventCtx.idx.Recurrence] || '').trim();
  const normalizedRecurrence = _normalizeRecurrence(recurrence);

  return {
    EventID: String(row[eventCtx.idx.EventID] || '').trim(),
    Title: String(row[eventCtx.idx.Title] || '').trim(),
    EventDate: _safeIsoDate(row[eventCtx.idx.EventDate]),
    Recurrence: recurrence,
    IsRecurring: normalizedRecurrence !== 'none' && normalizedRecurrence !== 'unsupported'
  };
}

function _safeIsoDate(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const dateValue = new Date(value);
  if (isNaN(dateValue.getTime())) {
    return '';
  }
  return dateValue.toISOString();
}

function _normalizeRecurrence(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (!normalized || normalized === 'none' || normalized === 'no' || normalized === 'once' || normalized === 'one-time') {
    return 'none';
  }
  if (normalized.indexOf('day') !== -1) return 'daily';
  if (normalized.indexOf('week') !== -1) return 'weekly';
  if (normalized.indexOf('month') !== -1) return 'monthly';
  if (normalized.indexOf('year') !== -1 || normalized.indexOf('annual') !== -1) return 'yearly';
  return 'unsupported';
}

function _computeNextOccurrence(eventDateIso, recurrence, todayStart) {
  if (!eventDateIso) {
    return null;
  }

  const sourceDate = _startOfDay(new Date(eventDateIso));
  if (isNaN(sourceDate.getTime())) {
    return null;
  }

  if (recurrence === 'none') {
    return sourceDate.getTime() >= todayStart.getTime() ? sourceDate : null;
  }

  if (recurrence === 'unsupported') {
    return sourceDate.getTime() >= todayStart.getTime() ? sourceDate : null;
  }

  const next = new Date(sourceDate.getTime());
  let guard = 0;

  while (next.getTime() < todayStart.getTime() && guard < 1200) {
    if (recurrence === 'daily') {
      next.setDate(next.getDate() + 1);
    } else if (recurrence === 'weekly') {
      next.setDate(next.getDate() + 7);
    } else if (recurrence === 'monthly') {
      next.setMonth(next.getMonth() + 1);
    } else if (recurrence === 'yearly') {
      next.setFullYear(next.getFullYear() + 1);
    }
    guard += 1;
  }

  if (guard >= 1200) {
    return null;
  }

  return next;
}

function _computeFounderLockProgress(expiryValue, lockYears, referenceDate) {
  const expiryDate = new Date(expiryValue);
  if (isNaN(expiryDate.getTime())) {
    return 0;
  }

  if (!lockYears || lockYears <= 0) {
    return referenceDate.getTime() >= expiryDate.getTime() ? 100 : 0;
  }

  const startDate = new Date(expiryDate.getTime());
  startDate.setFullYear(startDate.getFullYear() - lockYears);

  const totalMs = expiryDate.getTime() - startDate.getTime();
  if (totalMs <= 0) {
    return referenceDate.getTime() >= expiryDate.getTime() ? 100 : 0;
  }

  const elapsed = referenceDate.getTime() - startDate.getTime();
  const progress = (elapsed / totalMs) * 100;
  return Math.max(0, Math.min(100, progress));
}

function _toBoolean(value) {
  const normalized = String(value || '').toLowerCase().trim();
  return normalized === 'true' || normalized === 'yes' || normalized === '1' || normalized === 'released';
}

function _numSetting(settingsMap, aliases, fallback) {
  const value = (aliases || []).reduce((found, alias) => {
    if (found !== null) {
      return found;
    }
    const k = String(alias || '').toLowerCase().trim();
    if (!k || !Object.prototype.hasOwnProperty.call(settingsMap, k)) {
      return null;
    }
    return settingsMap[k];
  }, null);

  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return isNaN(parsed) ? fallback : parsed;
}

function _startOfDay(dateObj) {
  const d = new Date(dateObj.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

function _resolveAuthorizedChannel(messageCtx, email, channelID) {
  const normalizedChannelId = String(channelID || '').trim();

  if (!normalizedChannelId) {
    throw new Error('ChannelID is required.');
  }

  const channel = messageCtx.channels.rows
    .map(row => ({
      ChannelID: String(row[messageCtx.channels.idx.ChannelID] || '').trim(),
      Name: String(row[messageCtx.channels.idx.Name] || '').trim(),
      Type: String(row[messageCtx.channels.idx.Type] || '').trim(),
      IsActive: row[messageCtx.channels.idx.IsActive]
    }))
    .find(item => item.ChannelID === normalizedChannelId);

  if (!channel) {
    throw new Error('Channel not found.');
  }

  const type = channel.Type.toLowerCase();
  if (CHANNEL_TYPES.indexOf(type) === -1) {
    throw new Error('Unsupported channel type.');
  }

  const isActiveRaw = String(channel.IsActive || '').toLowerCase().trim();
  const isActive = isActiveRaw !== 'false' && isActiveRaw !== '0' && isActiveRaw !== 'no';
  if (!isActive) {
    throw new Error('Channel is inactive.');
  }

  const isMember = messageCtx.channelMembers.rows.some(row => {
    return String(row[messageCtx.channelMembers.idx.ChannelID] || '').trim() === normalizedChannelId &&
      _norm(row[messageCtx.channelMembers.idx.Email]) === _norm(email);
  });

  if (!isMember) {
    throw new Error('Unauthorized channel access.');
  }

  return channel;
}

function _norm(value) {
  return String(value || '').toLowerCase().trim();
}

function _errMsg(functionName, error) {
  const base = error && error.message ? String(error.message) : 'Unknown error';
  return functionName + ': ' + base;
}
