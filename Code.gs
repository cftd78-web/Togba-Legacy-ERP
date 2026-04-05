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
const ADMIN_CACHE_TTL_SECONDS = 120;
// TEMP DEV-ONLY TOGGLE (Phase 1.5):
// Keep OFF in normal/prod usage. Turn ON only for local UI debugging.
const DEV_BYPASS_MODE = true;
const DEV_BYPASS_IDENTITY = {
  email: 'dev.ui.debug@togba.local',
  role: 'Admin',
  name: 'UI Debug Developer'
};

let _SS_CACHE = null;
let _SHEET_CACHE = {};

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

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
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
      OneTimeCode: ['OneTimeCode', 'OTP', 'OneTimePasscode'],
      FullName: ['FullName', 'Name']
    });

    const rowIndex = access.rows.findIndex(r => _norm(r[access.idx.EmailOptional]) === normalizedEmail);

    if (rowIndex === -1) {
      throw new Error('Email not found.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    access.sheet.getRange(rowIndex + 2, access.idx.OneTimeCode + 1).setValue(otp);

    SpreadsheetApp.flush();

    let deliveredByEmail = false;
    let deliveryError = '';
    try {
      const fullName = String(access.rows[rowIndex][access.idx.FullName] || '').trim() || 'Member';
      MailApp.sendEmail({
        to: normalizedEmail,
        subject: 'Your Togba Legacy ERP login code',
        htmlBody: '<p>Hello ' + fullName + ',</p><p>Your one-time login code is:</p><h2 style="letter-spacing:2px">' + otp + '</h2><p>This code expires with your active login window.</p>'
      });
      deliveredByEmail = true;
    } catch (mailErr) {
      deliveryError = mailErr && mailErr.message ? String(mailErr.message) : 'Email delivery failed.';
    }

    return {
      success: true,
      deliveredByEmail: deliveredByEmail,
      deliveryError: deliveryError
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

function getAuthModeConfig() {
  try {
    return {
      developerBypassEnabled: DEV_BYPASS_MODE
    };
  } catch (e) {
    throw new Error(_errMsg('getAuthModeConfig', e));
  }
}

function startDeveloperBypassSession() {
  try {
    if (!DEV_BYPASS_MODE) {
      throw new Error('Developer bypass mode is disabled.');
    }

    const token = 'DEV-BYPASS-' + Utilities.getUuid();
    CacheService
      .getScriptCache()
      .put(
        token,
        JSON.stringify({
          email: DEV_BYPASS_IDENTITY.email,
          role: DEV_BYPASS_IDENTITY.role,
          name: DEV_BYPASS_IDENTITY.name,
          devBypass: true
        }),
        SESSION_TTL
      );

    return {
      token: token,
      profile: {
        email: DEV_BYPASS_IDENTITY.email,
        role: DEV_BYPASS_IDENTITY.role,
        name: DEV_BYPASS_IDENTITY.name
      }
    };
  } catch (e) {
    throw new Error(_errMsg('startDeveloperBypassSession', e));
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
        email: _norm(session.email),
        name: row[access.idx.FullName],
        role: row[access.idx.Role]
      }
    };
  } catch (e) {
    throw new Error(_errMsg('getDashboardData', e));
  }
}


function getStartupBootstrap(token) {
  try {
    return getDashboardData(token);
  } catch (e) {
    throw new Error(_errMsg('getStartupBootstrap', e));
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

function createProject(token, title, goalUSD, status, description, imageURL) {
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

    const descriptionIndex = _optionalHeaderIndex(projectsCtx.projects, ['Description', 'ProjectDescription']);
    const imageIndex = _optionalHeaderIndex(projectsCtx.projects, ['ImageURL', 'ThumbnailURL', 'ProjectImageURL']);
    if (descriptionIndex !== -1) {
      row[descriptionIndex] = String(description || '').trim();
    }
    if (imageIndex !== -1) {
      row[imageIndex] = String(imageURL || '').trim();
    }

    projectsCtx.projects.sheet.appendRow(row);

    return {
      success: true,
      project: {
        ProjectID: projectID,
        Title: normalizedTitle,
        Description: descriptionIndex === -1 ? '' : row[descriptionIndex],
        ImageURL: imageIndex === -1 ? '' : row[imageIndex],
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

    const taskTitleIdx = _optionalHeaderIndex(projectsCtx.tasks, ['TaskTitle', 'Title']);
    const assigneeTypeIdx = _optionalHeaderIndex(projectsCtx.tasks, ['AssigneeType', 'AssignedType']);
    const assigneeValueIdx = _optionalHeaderIndex(projectsCtx.tasks, ['Assignee', 'AssignedTo', 'AssigneeValue']);
    const descriptionIndex = _optionalHeaderIndex(projectsCtx.projects, ['Description', 'ProjectDescription']);
    const imageIndex = _optionalHeaderIndex(projectsCtx.projects, ['ImageURL', 'ThumbnailURL', 'ProjectImageURL']);

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
        TaskTitle: taskTitleIdx === -1 ? '' : String(row[taskTitleIdx] || '').trim(),
        AssigneeType: assigneeTypeIdx === -1 ? '' : _safeReadAssigneeType(row[assigneeTypeIdx]),
        Assignee: assigneeValueIdx === -1 ? '' : String(row[assigneeValueIdx] || '').trim(),
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
        Description: descriptionIndex === -1 ? '' : String(row[descriptionIndex] || '').trim(),
        ImageURL: imageIndex === -1 ? '' : String(row[imageIndex] || '').trim(),
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

    const taskTitleIdx = _optionalHeaderIndex(projectsCtx.tasks, ['TaskTitle', 'Title']);
    const assigneeTypeIdx = _optionalHeaderIndex(projectsCtx.tasks, ['AssigneeType', 'AssignedType']);
    const assigneeValueIdx = _optionalHeaderIndex(projectsCtx.tasks, ['Assignee', 'AssignedTo', 'AssigneeValue']);

    const tasks = projectsCtx.tasks.rows
      .map((row, i) => ({ row: row, rowIndex: i + 2 }))
      .filter(item => String(item.row[projectsCtx.tasks.idx.ProjectID] || '').trim() === normalizedProjectID)
      .map(item => ({
        TaskID: _deriveProjectTaskID(projectsCtx.tasks, item.row, item.rowIndex),
        ProjectID: normalizedProjectID,
        PercentComplete: _clampPercent(item.row[projectsCtx.tasks.idx.PercentComplete]),
        Status: _normalizeTaskStatus(item.row[projectsCtx.tasks.idx.Status]),
        Priority: _normalizeTaskPriority(item.row[projectsCtx.tasks.idx.Priority]),
        TaskTitle: taskTitleIdx === -1 ? '' : String(item.row[taskTitleIdx] || '').trim(),
        AssigneeType: assigneeTypeIdx === -1 ? '' : _safeReadAssigneeType(item.row[assigneeTypeIdx]),
        Assignee: assigneeValueIdx === -1 ? '' : String(item.row[assigneeValueIdx] || '').trim(),
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

function getAdminDashboardData(token) {
  try {
    const session = _auth(token);
    _assertAdminSession(session);

    const cacheKey = 'ADMIN_DASHBOARD::' + _norm(session.email);
    const cache = CacheService.getScriptCache();
    const cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const access = _readSheet('Access', {
      EmailOptional: ['EmailOptional', 'Email'],
      FullName: ['FullName', 'Name'],
      Role: ['Role', 'RoleName']
    });

    const roles = _readSheet('Roles', {
      Email: ['Email', 'EmailOptional'],
      RoleName: ['RoleName', 'Role'],
      IsAdult: ['IsAdult', 'Adult']
    });

    const settings = _readSheet('Settings', {
      Key: ['Key', 'SettingKey'],
      Value: ['Value', 'SettingValue']
    });

    const institution = _readSheet('InstitutionSettings', {
      SettingKey: ['SettingKey', 'Key'],
      SettingValue: ['SettingValue', 'Value']
    });

    const users = access.rows.map(row => ({
      email: _norm(row[access.idx.EmailOptional]),
      role: String(row[access.idx.Role] || '').trim(),
      name: String(row[access.idx.FullName] || '').trim()
    }));

    const roleMap = roles.rows.reduce((acc, row) => {
      const email = _norm(row[roles.idx.Email]);
      if (!email) return acc;
      if (!acc[email]) {
        acc[email] = [];
      }
      acc[email].push({
        roleName: String(row[roles.idx.RoleName] || '').trim(),
        isAdult: _toBoolean(row[roles.idx.IsAdult])
      });
      return acc;
    }, {});

    const totalUsers = users.length;
    const adminUsers = users.filter(u => _norm(u.role) === 'admin').length;
    const userOverview = {
      totalUsers: totalUsers,
      adminUsers: adminUsers,
      usersWithoutRoleValue: users.filter(u => !u.role).length,
      usersWithoutMatchingRoleRecord: users.filter(u => !(roleMap[u.email] || []).length).length,
      adultsInRoles: Object.keys(roleMap).reduce((sum, email) => {
        const hasAdult = (roleMap[email] || []).some(r => r.isAdult);
        return sum + (hasAdult ? 1 : 0);
      }, 0)
    };

    const result = {
      success: true,
      generatedAt: new Date().toISOString(),
      userOverview: userOverview,
      settingsOverview: {
        totalEntries: settings.rows.length
      },
      institutionSettingsOverview: {
        totalEntries: institution.rows.length
      },
      notices: [
        totalUsers ? '' : 'Access sheet has no user records yet.',
        settings.rows.length ? '' : 'Settings sheet has no entries yet.',
        institution.rows.length ? '' : 'InstitutionSettings sheet has no entries yet.'
      ].filter(Boolean)
    };

    cache.put(cacheKey, JSON.stringify(result), ADMIN_CACHE_TTL_SECONDS);
    return result;
  } catch (e) {
    throw new Error(_errMsg('getAdminDashboardData', e));
  }
}

function getSettingsSummary(token) {
  try {
    const session = _auth(token);
    _assertAdminSession(session);

    const settings = _readSheet('Settings', {
      Key: ['Key', 'SettingKey'],
      Value: ['Value', 'SettingValue']
    });

    const entries = settings.rows
      .map(row => ({
        key: String(row[settings.idx.Key] || '').trim(),
        value: row[settings.idx.Value]
      }))
      .filter(item => item.key);

    const requiredKeys = ['InstitutionName', 'SupportEmail', 'DefaultCurrency', 'EmergencyContact'];
    const keyMap = entries.reduce((acc, item) => {
      acc[_norm(item.key)] = item.value;
      return acc;
    }, {});

    const missingRequiredKeys = requiredKeys.filter(key => !Object.prototype.hasOwnProperty.call(keyMap, _norm(key)));

    return {
      success: true,
      totalEntries: entries.length,
      missingRequiredKeys: missingRequiredKeys,
      entries: entries,
      message: entries.length ? '' : 'Settings sheet has no data yet.'
    };
  } catch (e) {
    throw new Error(_errMsg('getSettingsSummary', e));
  }
}

function getInstitutionSettingsSummary(token) {
  try {
    const session = _auth(token);
    _assertAdminSession(session);

    const institution = _readSheet('InstitutionSettings', {
      SettingKey: ['SettingKey', 'Key'],
      SettingValue: ['SettingValue', 'Value']
    });

    const entries = institution.rows
      .map(row => ({
        key: String(row[institution.idx.SettingKey] || '').trim(),
        value: row[institution.idx.SettingValue]
      }))
      .filter(item => item.key);

    const map = entries.reduce((acc, item) => {
      acc[_norm(item.key)] = item.value;
      return acc;
    }, {});

    const allocationKeys = ['EquityPercent', 'FixedIncomePercent', 'CashPercent', 'AlternativePercent'];
    const allocations = allocationKeys.map(key => ({
      key: key,
      value: _numSetting(map, [key], 0)
    }));

    const allocationTotal = allocations.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    const allocationIsValid = Math.abs(allocationTotal - 100) < 0.0001;

    const requiredKeys = ['ProjectionRate'].concat(allocationKeys);
    const missingRequiredKeys = requiredKeys.filter(key => !Object.prototype.hasOwnProperty.call(map, _norm(key)));

    return {
      success: true,
      totalEntries: entries.length,
      entries: entries,
      allocations: allocations,
      allocationTotal: allocationTotal,
      allocationIsValid: allocationIsValid,
      missingRequiredKeys: missingRequiredKeys,
      message: entries.length ? '' : 'InstitutionSettings sheet has no data yet.'
    };
  } catch (e) {
    throw new Error(_errMsg('getInstitutionSettingsSummary', e));
  }
}

function getSystemHealth(token) {
  try {
    const session = _auth(token);
    _assertAdminSession(session);

    const expectedSheets = {
      Access: ['EmailOptional', 'OneTimeCode', 'FullName', 'Role'],
      Roles: ['Email', 'RoleName', 'IsAdult'],
      Settings: ['Key', 'Value'],
      InstitutionSettings: ['SettingKey', 'SettingValue'],
      Contributions: ['AmountUSD', 'ContributionType'],
      FounderLocks: ['AmountUSD', 'ExpiryDate', 'LockYears', 'Released'],
      Votes: ['VoteID', 'Title', 'ThresholdType', 'Status'],
      VoteBallots: ['VoteID', 'VoterEmail', 'VoteChoice'],
      Messages: ['ChannelID', 'SenderEmail', 'Body', 'SentAt'],
      Channels: ['ChannelID', 'Name', 'Type', 'IsActive'],
      ChannelMembers: ['ChannelID', 'Email', 'MemberRole'],
      SOSAlerts: ['ReporterEmail', 'Lat', 'Lng', 'Status', 'WhatsAppLink'],
      SOSMedia: ['SOSID', 'MediaType', 'FileURL'],
      Projects: ['ProjectID', 'Title', 'GoalUSD', 'Status'],
      ProjectTasks: ['ProjectID', 'PercentComplete', 'Status', 'Priority'],
      ProjectUpdates: ['UpdateID', 'ProjectID', 'TaskID', 'UpdateText'],
      History: ['Title', 'EventDate', 'EventType', 'Description'],
      Events: ['EventID', 'Title', 'EventDate', 'Recurrence']
    };

    const perSheet = Object.keys(expectedSheets).map(sheetName => _validateSheetHealth(sheetName, expectedSheets[sheetName]));
    const missingSheets = perSheet.filter(item => !item.exists).map(item => item.sheet);
    const missingHeaders = perSheet.filter(item => item.exists && item.missingHeaders.length);

    const institutionHealth = _checkInstitutionAllocationHealth();
    const settingsHealth = _checkSettingsHealthKeys();

    const issues = [];
    missingSheets.forEach(name => issues.push('Missing required sheet: ' + name));
    missingHeaders.forEach(item => {
      item.missingHeaders.forEach(header => issues.push(item.sheet + ' missing header: ' + header));
    });
    if (!institutionHealth.valid) {
      issues.push(institutionHealth.message);
    }
    settingsHealth.missingKeys.forEach(key => {
      issues.push('Settings missing expected key: ' + key);
    });

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      healthy: issues.length === 0,
      issueCount: issues.length,
      issues: issues,
      missingSheets: missingSheets,
      sheetsWithMissingHeaders: missingHeaders,
      allocationHealth: institutionHealth,
      settingsHealth: settingsHealth,
      sheets: perSheet
    };
  } catch (e) {
    throw new Error(_errMsg('getSystemHealth', e));
  }
}

function _assertAdminSession(session) {
  const role = _norm(session && session.role);
  if (role !== 'admin') {
    throw new Error('Unauthorized');
  }
}

function _validateSheetHealth(sheetName, requiredHeaders) {
  const sheet = _ss().getSheetByName(sheetName);
  if (!sheet) {
    return {
      sheet: sheetName,
      exists: false,
      headerCount: 0,
      missingHeaders: requiredHeaders.slice()
    };
  }

  const values = sheet.getDataRange().getValues();
  const headers = (values[0] || []).map(h => String(h || '').trim());
  const headerMap = headers.reduce((acc, header) => {
    acc[header] = true;
    return acc;
  }, {});

  const missingHeaders = requiredHeaders.filter(header => !Object.prototype.hasOwnProperty.call(headerMap, header));

  return {
    sheet: sheetName,
    exists: true,
    headerCount: headers.length,
    missingHeaders: missingHeaders
  };
}

function _checkInstitutionAllocationHealth() {
  const sheet = _readSheet('InstitutionSettings', {
    SettingKey: ['SettingKey', 'Key'],
    SettingValue: ['SettingValue', 'Value']
  });

  const map = sheet.rows.reduce((acc, row) => {
    const key = _norm(row[sheet.idx.SettingKey]);
    if (key) {
      acc[key] = row[sheet.idx.SettingValue];
    }
    return acc;
  }, {});

  const keys = ['EquityPercent', 'FixedIncomePercent', 'CashPercent', 'AlternativePercent'];
  const total = keys.reduce((sum, key) => sum + _numSetting(map, [key], 0), 0);
  const valid = Math.abs(total - 100) < 0.0001;

  return {
    valid: valid,
    total: total,
    message: valid ? '' : 'Institution allocation total must equal 100. Current total is ' + total + '.'
  };
}

function _checkSettingsHealthKeys() {
  const sheet = _readSheet('Settings', {
    Key: ['Key', 'SettingKey'],
    Value: ['Value', 'SettingValue']
  });

  const requiredKeys = ['InstitutionName', 'SupportEmail', 'DefaultCurrency', 'EmergencyContact'];
  const keyMap = sheet.rows.reduce((acc, row) => {
    const key = _norm(row[sheet.idx.Key]);
    if (key) {
      acc[key] = true;
    }
    return acc;
  }, {});

  const missingKeys = requiredKeys.filter(key => !Object.prototype.hasOwnProperty.call(keyMap, _norm(key)));

  return {
    requiredKeys: requiredKeys,
    missingKeys: missingKeys
  };
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

    const reporterEmail = _norm(session.email);
    const reporterName = _resolveFullNameByEmail(reporterEmail) || reporterEmail;

    const row = new Array(sos.alerts.headers.length).fill('');
    row[sos.alerts.idx.ReporterEmail] = reporterEmail;
    row[sos.alerts.idx.Lat] = latNum;
    row[sos.alerts.idx.Lng] = lngNum;
    row[sos.alerts.idx.Status] = 'Open';
    row[sos.alerts.idx.WhatsAppLink] = _buildSOSWhatsAppLink(sos.settings, reporterEmail, reporterName, latNum, lngNum);

    sos.alerts.sheet.appendRow(row);

    const alertRowIndex = sos.alerts.rows.length + 2;

    return {
      success: true,
      alert: {
        SOSID: _deriveSOSID(sos.alerts, row, alertRowIndex),
        ReporterEmail: reporterEmail,
        ReporterName: reporterName,
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
          ReporterName: _resolveFullNameByEmail(_norm(row[sos.alerts.idx.ReporterEmail])),
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
        Description: _readVoteDescription(governance.votes, row),
        ImageURL: _readVoteImageURL(governance.votes, row),
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
      Description: vote.Description,
      ImageURL: vote.ImageURL,
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
        Description: _readVoteDescription(governance.votes, row),
        ImageURL: _readVoteImageURL(governance.votes, row),
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
    if (_SHEET_CACHE[name]) {
      return _SHEET_CACHE[name];
    }

    const sh = _ss().getSheetByName(name);

    if (!sh) {
      throw new Error('Missing sheet: ' + name);
    }

    _SHEET_CACHE[name] = sh;

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
    const headerMap = headers.reduce((acc, header, index) => {
      acc[header] = index;
      return acc;
    }, {});

    if (!headers.length) {
      throw new Error('Sheet has no headers: ' + name);
    }

    const idx = _resolveRequiredHeaders(headers, requiredHeadersMap || {}, headerMap);

    return {
      sheet: sheet,
      headers: headers,
      headerMap: headerMap,
      idx: idx,
      rows: data.slice(1)
    };
  } catch (e) {
    throw new Error(_errMsg('_readSheet', e));
  }
}

function _resolveRequiredHeaders(headers, requiredHeadersMap, headerMap) {
  const idx = {};
  const normalizedHeaderMap = headerMap || headers.reduce((acc, header, index) => {
    acc[header] = index;
    return acc;
  }, {});

  Object.keys(requiredHeadersMap).forEach(key => {
    const aliases = requiredHeadersMap[key] || [];

    const found = aliases.reduce((foundIndex, alias) => {
      if (foundIndex !== -1) {
        return foundIndex;
      }

      return Object.prototype.hasOwnProperty.call(normalizedHeaderMap, alias)
        ? normalizedHeaderMap[alias]
        : -1;
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

function _normalizeAssigneeType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'member' || normalized === 'internal') return 'internal';
  if (normalized === 'external') return 'external';
  throw new Error('AssigneeType must be internal or external.');
}

function _safeReadAssigneeType(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return _normalizeAssigneeType(raw);
  } catch (e) {
    return '';
  }
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

function _buildSOSWhatsAppLink(settingsCtx, reporterEmail, reporterName, lat, lng) {
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
  ]) || 'Emergency SOS from {name} ({email}). Location: {lat}, {lng}. Map: {map}';

  const message = template
    .replace(/\{name\}/gi, String(reporterName || reporterEmail || '').trim())
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
          ReporterName: _resolveFullNameByEmail(_norm(row[sos.alerts.idx.ReporterEmail])),
      Lat: Number(row[sos.alerts.idx.Lat]) || 0,
      Lng: Number(row[sos.alerts.idx.Lng]) || 0,
      Status: String(row[sos.alerts.idx.Status] || '').trim() || 'Open',
      WhatsAppLink: String(row[sos.alerts.idx.WhatsAppLink] || '').trim()
    };
  });

  return mapped.find(item => item.SOSID === normalizedSOSID) || null;
}


function _resolveFullNameByEmail(email) {
  try {
    if (!email) return '';
    const access = _readSheet('Access', { EmailOptional: ['EmailOptional', 'Email'], FullName: ['FullName', 'Name'] });
    const row = access.rows.find(r => _norm(r[access.idx.EmailOptional]) === _norm(email));
    return row ? String(row[access.idx.FullName] || '').trim() : '';
  } catch (e) {
    return '';
  }
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



function getProjectBoard(token) {
  try {
    const session = _auth(token);
    const ctx = _getProjectSheets();
    const projectDescriptionIdx = _optionalHeaderIndex(ctx.projects, ['Description', 'ProjectDescription']);
    const projectImageIdx = _optionalHeaderIndex(ctx.projects, ['ImageURL', 'ThumbnailURL', 'ProjectImageURL']);
    const taskTitleIdx = _optionalHeaderIndex(ctx.tasks, ['TaskTitle', 'Title']);
    const assigneeTypeIdx = _optionalHeaderIndex(ctx.tasks, ['AssigneeType', 'AssignedType']);
    const assigneeValueIdx = _optionalHeaderIndex(ctx.tasks, ['Assignee', 'AssignedTo', 'AssigneeValue']);

    const tasksByProject = {};
    ctx.tasks.rows.forEach((row, i) => {
      const projectID = String(row[ctx.tasks.idx.ProjectID] || '').trim();
      if (!projectID) return;
      if (!tasksByProject[projectID]) tasksByProject[projectID] = [];
      tasksByProject[projectID].push({
        TaskID: _deriveProjectTaskID(ctx.tasks, row, i + 2),
        ProjectID: projectID,
        TaskTitle: taskTitleIdx === -1 ? '' : String(row[taskTitleIdx] || '').trim(),
        PercentComplete: _clampPercent(row[ctx.tasks.idx.PercentComplete]),
        Status: _normalizeTaskStatus(row[ctx.tasks.idx.Status]),
        Priority: _normalizeTaskPriority(row[ctx.tasks.idx.Priority]),
        AssigneeType: assigneeTypeIdx === -1 ? '' : _safeReadAssigneeType(row[assigneeTypeIdx]),
        Assignee: assigneeValueIdx === -1 ? '' : String(row[assigneeValueIdx] || '').trim()
      });
    });

    return {
      success: true,
      permissions: _getProjectPermissions(session, ctx),
      projects: ctx.projects.rows.map(row => {
        const projectID = String(row[ctx.projects.idx.ProjectID] || '').trim();
        const tasks = tasksByProject[projectID] || [];
        const progress = tasks.length ? tasks.reduce((s,t)=>s+t.PercentComplete,0)/tasks.length : 0;
        const assignedTasks = tasks
          .filter(task => task.Assignee)
          .map(task => ({
            TaskID: task.TaskID,
            TaskTitle: task.TaskTitle,
            AssigneeType: task.AssigneeType,
            Assignee: task.Assignee,
            Status: task.Status,
            Priority: task.Priority,
            PercentComplete: task.PercentComplete
          }));
        return {
          ProjectID: projectID,
          Title: String(row[ctx.projects.idx.Title] || '').trim(),
          Description: projectDescriptionIdx === -1 ? '' : String(row[projectDescriptionIdx] || '').trim(),
          ImageURL: projectImageIdx === -1 ? '' : String(row[projectImageIdx] || '').trim(),
          GoalUSD: Number(row[ctx.projects.idx.GoalUSD]) || 0,
          Status: _normalizeProjectStatus(row[ctx.projects.idx.Status]),
          ProgressPercent: Number(progress.toFixed(2)),
          AssignedTaskCount: assignedTasks.length,
          AssignedTasks: assignedTasks,
          tasks: tasks
        };
      })
    };
  } catch (e) {
    throw new Error(_errMsg('getProjectBoard', e));
  }
}

function createProjectTaskEnhanced(token, payload) {
  try {
    const session = _auth(token);
    const ctx = _getProjectSheets();
    _assertProjectEditor(session, ctx);
    payload = payload || {};
    const projectID = String(payload.projectID || '').trim();
    if (!projectID) throw new Error('projectID is required.');
    const status = _normalizeTaskStatus(payload.status);
    const priority = _normalizeTaskPriority(payload.priority);
    const percentComplete = _clampPercent(payload.percentComplete);
    const title = String(payload.taskTitle || '').trim();
    const assigneeType = _normalizeAssigneeType(payload.assigneeType);
    const assignee = String(payload.assignee || '').trim();
    const created = createProjectTask(token, projectID, status, priority, percentComplete);
    const rowIndex = ctx.tasks.rows.length + 2;
    const taskTitleIdx = _optionalHeaderIndex(ctx.tasks, ['TaskTitle', 'Title']);
    const assigneeTypeIdx = _optionalHeaderIndex(ctx.tasks, ['AssigneeType', 'AssignedType']);
    const assigneeValueIdx = _optionalHeaderIndex(ctx.tasks, ['Assignee', 'AssignedTo', 'AssigneeValue']);
    if (taskTitleIdx !== -1) ctx.tasks.sheet.getRange(rowIndex, taskTitleIdx + 1).setValue(title);
    if (assigneeTypeIdx !== -1) ctx.tasks.sheet.getRange(rowIndex, assigneeTypeIdx + 1).setValue(assigneeType);
    if (assigneeValueIdx !== -1) ctx.tasks.sheet.getRange(rowIndex, assigneeValueIdx + 1).setValue(assignee);
    return created;
  } catch (e) {
    throw new Error(_errMsg('createProjectTaskEnhanced', e));
  }
}

function updateProjectTaskEnhanced(token, payload) {
  try {
    const session = _auth(token);
    const ctx = _getProjectSheets();
    _assertProjectEditor(session, ctx);
    payload = payload || {};
    const taskID = String(payload.taskID || '').trim();
    if (!taskID) throw new Error('taskID is required.');

    const updated = updateProjectTask(token, taskID, payload.percentComplete, payload.status, payload.priority);
    const target = _findProjectTaskRow(ctx.tasks, taskID);
    if (!target) throw new Error('Task not found after update.');

    const taskTitleIdx = _optionalHeaderIndex(ctx.tasks, ['TaskTitle', 'Title']);
    const assigneeTypeIdx = _optionalHeaderIndex(ctx.tasks, ['AssigneeType', 'AssignedType']);
    const assigneeValueIdx = _optionalHeaderIndex(ctx.tasks, ['Assignee', 'AssignedTo', 'AssigneeValue']);
    const assigneeType = _normalizeAssigneeType(payload.assigneeType);
    const assignee = String(payload.assignee || '').trim();
    const taskTitle = String(payload.taskTitle || '').trim();

    if (taskTitleIdx !== -1) ctx.tasks.sheet.getRange(target.rowIndex, taskTitleIdx + 1).setValue(taskTitle);
    if (assigneeTypeIdx !== -1) ctx.tasks.sheet.getRange(target.rowIndex, assigneeTypeIdx + 1).setValue(assigneeType);
    if (assigneeValueIdx !== -1) ctx.tasks.sheet.getRange(target.rowIndex, assigneeValueIdx + 1).setValue(assignee);

    return updated;
  } catch (e) {
    throw new Error(_errMsg('updateProjectTaskEnhanced', e));
  }
}

function createChannel(token, name, type) {
  try {
    const session = _auth(token);
    const ctx = _getMessagingSheets();
    const normalizedName = String(name || '').trim();
    const normalizedType = String(type || 'private').trim().toLowerCase();
    if (!normalizedName) throw new Error('Channel name is required.');
    if (CHANNEL_TYPES.indexOf(normalizedType) === -1) throw new Error('Unsupported channel type.');
    const channelID = 'CH-' + Utilities.getUuid().split('-')[0].toUpperCase();
    const row = new Array(ctx.channels.headers.length).fill('');
    row[ctx.channels.idx.ChannelID] = channelID;
    row[ctx.channels.idx.Name] = normalizedName;
    row[ctx.channels.idx.Type] = normalizedType;
    row[ctx.channels.idx.IsActive] = true;
    ctx.channels.sheet.appendRow(row);

    const memberRow = new Array(ctx.channelMembers.headers.length).fill('');
    memberRow[ctx.channelMembers.idx.ChannelID] = channelID;
    memberRow[ctx.channelMembers.idx.Email] = _norm(session.email);
    memberRow[ctx.channelMembers.idx.MemberRole] = 'Owner';
    ctx.channelMembers.sheet.appendRow(memberRow);
    return { success: true, channel: { ChannelID: channelID, Name: normalizedName, Type: normalizedType, IsActive: true } };
  } catch (e) { throw new Error(_errMsg('createChannel', e)); }
}

function joinChannel(token, channelID) {
  try {
    const session = _auth(token);
    const ctx = _getMessagingSheets();
    const cid = String(channelID || '').trim();
    if (!cid) throw new Error('ChannelID is required.');
    const channel = ctx.channels.rows.find(r => String(r[ctx.channels.idx.ChannelID] || '').trim() === cid);
    if (!channel) throw new Error('Channel not found.');
    const isActiveRaw = String(channel[ctx.channels.idx.IsActive] || '').toLowerCase().trim();
    const isActive = isActiveRaw !== 'false' && isActiveRaw !== '0' && isActiveRaw !== 'no';
    if (!isActive) throw new Error('Channel is inactive.');
    const exists = ctx.channelMembers.rows.some(r => String(r[ctx.channelMembers.idx.ChannelID] || '').trim() === cid && _norm(r[ctx.channelMembers.idx.Email]) === _norm(session.email));
    if (!exists) {
      const row = new Array(ctx.channelMembers.headers.length).fill('');
      row[ctx.channelMembers.idx.ChannelID] = cid;
      row[ctx.channelMembers.idx.Email] = _norm(session.email);
      row[ctx.channelMembers.idx.MemberRole] = 'Member';
      ctx.channelMembers.sheet.appendRow(row);
    }
    return { success: true };
  } catch (e) { throw new Error(_errMsg('joinChannel', e)); }
}

function getChannelDirectory(token) {
  try {
    const session = _auth(token);
    const ctx = _getMessagingSheets();
    const email = _norm(session.email);
    return {
      success: true,
      channels: ctx.channels.rows
        .map(r => ({
          ChannelID: String(r[ctx.channels.idx.ChannelID] || '').trim(),
          Name: String(r[ctx.channels.idx.Name] || '').trim(),
          Type: String(r[ctx.channels.idx.Type] || '').trim(),
          IsActive: r[ctx.channels.idx.IsActive]
        }))
        .filter(ch => {
          const isActiveRaw = String(ch.IsActive || '').toLowerCase().trim();
          const isActive = isActiveRaw !== 'false' && isActiveRaw !== '0' && isActiveRaw !== 'no';
          return isActive;
        })
        .map(ch => {
          const joined = ctx.channelMembers.rows.some(r =>
            String(r[ctx.channelMembers.idx.ChannelID] || '').trim() === ch.ChannelID &&
            _norm(r[ctx.channelMembers.idx.Email]) === email
          );
          return { ChannelID: ch.ChannelID, Name: ch.Name, Type: ch.Type, IsActive: ch.IsActive, Joined: joined };
        })
    };
  } catch (e) { throw new Error(_errMsg('getChannelDirectory', e)); }
}


function getMessagingRecipients(token, query) {
  try {
    const session = _auth(token);
    const ctx = _getMessagingSheets();
    const access = _readSheet('Access', {
      EmailOptional: ['EmailOptional', 'Email'],
      FullName: ['FullName', 'Name']
    });

    const normalizedSessionEmail = _norm(session.email);
    const normalizedQuery = _norm(query);

    const privateChannelIds = ctx.channels.rows.reduce((acc, row) => {
      const channelID = String(row[ctx.channels.idx.ChannelID] || '').trim();
      const type = String(row[ctx.channels.idx.Type] || '').toLowerCase().trim();
      const isActiveRaw = String(row[ctx.channels.idx.IsActive] || '').toLowerCase().trim();
      const isActive = isActiveRaw !== 'false' && isActiveRaw !== '0' && isActiveRaw !== 'no';
      if (channelID && type === 'private' && isActive) {
        acc[channelID] = true;
      }
      return acc;
    }, {});

    const privateChannelMembers = ctx.channelMembers.rows.reduce((acc, row) => {
      const channelID = String(row[ctx.channelMembers.idx.ChannelID] || '').trim();
      const email = _norm(row[ctx.channelMembers.idx.Email]);
      if (!privateChannelIds[channelID] || !email) {
        return acc;
      }
      if (!acc[channelID]) {
        acc[channelID] = {};
      }
      acc[channelID][email] = true;
      return acc;
    }, {});

    const recipients = access.rows
      .map(row => {
        const emailRaw = String(row[access.idx.EmailOptional] || '').trim();
        const email = _norm(emailRaw);
        const fullName = String(row[access.idx.FullName] || '').trim();
        if (!email || email === normalizedSessionEmail) {
          return null;
        }

        const channelID = Object.keys(privateChannelMembers).find(id => {
          const members = privateChannelMembers[id] || {};
          return !!members[normalizedSessionEmail] && !!members[email];
        }) || '';

        return {
          Email: emailRaw,
          FullName: fullName,
          ChannelID: channelID
        };
      })
      .filter(item => !!item)
      .filter(item => {
        if (!normalizedQuery) {
          return true;
        }
        return _norm(item.FullName).indexOf(normalizedQuery) !== -1 || _norm(item.Email).indexOf(normalizedQuery) !== -1;
      })
      .sort((a, b) => {
        const left = _norm(a.FullName || a.Email);
        const right = _norm(b.FullName || b.Email);
        return left.localeCompare(right);
      })
      .slice(0, 50);

    return {
      success: true,
      recipients: recipients
    };
  } catch (e) {
    throw new Error(_errMsg('getMessagingRecipients', e));
  }
}

function getMemberDirectory(token) {
  try {
    _auth(token);
    const access = _readSheet('Access', { EmailOptional: ['EmailOptional', 'Email'], FullName: ['FullName', 'Name'], Role: ['Role', 'RoleName'] });
    return { success: true, members: access.rows.map((r,i)=>({ rowIndex:i+2,email:String(r[access.idx.EmailOptional]||'').trim(), fullName:String(r[access.idx.FullName]||'').trim(), role:String(r[access.idx.Role]||'').trim() })) };
  } catch (e) { throw new Error(_errMsg('getMemberDirectory', e)); }
}

function addMember(token, payload) {
  try {
    const session = _auth(token); _assertAdminSession(session); payload = payload || {};
    const access = _readSheet('Access', { PersonID:['PersonID'], EmailOptional:['EmailOptional','Email'], FullName:['FullName','Name'], OneTimeCode:['OneTimeCode','OTP','OneTimePasscode'], PublicKey:['PublicKey'], Role:['Role','RoleName'] });
    const row = new Array(access.headers.length).fill('');
    row[access.idx.PersonID] = String(payload.personID || ('P-' + Utilities.getUuid().split('-')[0].toUpperCase())).trim();
    row[access.idx.EmailOptional] = _norm(payload.email);
    row[access.idx.FullName] = String(payload.fullName || '').trim();
    row[access.idx.OneTimeCode] = '';
    row[access.idx.PublicKey] = String(payload.publicKey || '').trim();
    row[access.idx.Role] = String(payload.role || 'Member').trim();
    access.sheet.appendRow(row);
    return { success: true };
  } catch (e) { throw new Error(_errMsg('addMember', e)); }
}

function updateMember(token, payload) {
  try {
    const session = _auth(token); _assertAdminSession(session); payload = payload || {};
    const access = _readSheet('Access', { EmailOptional:['EmailOptional','Email'], FullName:['FullName','Name'], Role:['Role','RoleName'] });
    const email = _norm(payload.email);
    const idx = access.rows.findIndex(r => _norm(r[access.idx.EmailOptional]) === email);
    if (idx === -1) throw new Error('Member not found.');
    const rowIndex = idx + 2;
    if (payload.fullName !== undefined) access.sheet.getRange(rowIndex, access.idx.FullName + 1).setValue(String(payload.fullName || '').trim());
    if (payload.role !== undefined) access.sheet.getRange(rowIndex, access.idx.Role + 1).setValue(String(payload.role || '').trim());
    return { success: true };
  } catch (e) { throw new Error(_errMsg('updateMember', e)); }
}

function deactivateMember(token, email) {
  try {
    const session = _auth(token); _assertAdminSession(session);
    const normalized = _norm(email);
    const access = _readSheet('Access', { EmailOptional:['EmailOptional','Email'], Role:['Role','RoleName'] });
    const idx = access.rows.findIndex(r => _norm(r[access.idx.EmailOptional]) === normalized);
    if (idx === -1) throw new Error('Member not found.');
    access.sheet.getRange(idx + 2, access.idx.Role + 1).setValue('Inactive');
    return { success: true };
  } catch (e) { throw new Error(_errMsg('deactivateMember', e)); }
}

function getFamilyData(token) {
  try {
    _auth(token);
    const people = _readSheet('People', { PersonID:['PersonID'], RelationshipToPatriarch:['RelationshipToPatriarch'], GenerationTier:['GenerationTier'], FatherID:['FatherID'], MotherID:['MotherID'], SpouseFullNameOptional:['SpouseFullNameOptional'] });
    const photos = _readSheet('Photos', { PersonID:['PersonID'], PhotoFileURL:['PhotoFileURL', 'FileURL', 'PhotoURL', 'URL'], PhotoType:['PhotoType', 'Type'] });
    const nameIdx = _optionalHeaderIndex(people, ['FullName', 'Name']);
    const photoMap = {};
    photos.rows.forEach(r => {
      const personID = String(r[photos.idx.PersonID] || '').trim();
      if (!personID) {
        return;
      }
      const photoURL = String(r[photos.idx.PhotoFileURL] || '').trim();
      if (!photoURL) {
        return;
      }
      const photoType = String(r[photos.idx.PhotoType] || '').trim().toLowerCase();
      if (!photoMap[personID] || photoType === 'profile' || photoType === 'primary') {
        photoMap[personID] = photoURL;
      }
    });
    return { success: true, members: people.rows.map(r => {
      const personID = String(r[people.idx.PersonID]||'').trim();
      return {
        PersonID: personID,
        FullName:nameIdx===-1?'':String(r[nameIdx]||'').trim(),
        RelationshipToPatriarch:String(r[people.idx.RelationshipToPatriarch]||'').trim(),
        GenerationTier:String(r[people.idx.GenerationTier]||'').trim(),
        FatherID:String(r[people.idx.FatherID]||'').trim(),
        MotherID:String(r[people.idx.MotherID]||'').trim(),
        SpouseFullNameOptional:String(r[people.idx.SpouseFullNameOptional]||'').trim(),
        PhotoFileURL:photoMap[personID] || ''
      };
    }) };
  } catch (e) { throw new Error(_errMsg('getFamilyData', e)); }
}

function upsertFamilyMember(token, payload) {
  try {
    const session = _auth(token);
    payload = payload || {};
    const people = _readSheet('People', { PersonID:['PersonID'], RelationshipToPatriarch:['RelationshipToPatriarch'], GenerationTier:['GenerationTier'], FatherID:['FatherID'], MotherID:['MotherID'], SpouseFullNameOptional:['SpouseFullNameOptional'] });
    const pid = String(payload.PersonID || '').trim() || ('P-' + Utilities.getUuid().split('-')[0].toUpperCase());
    let idx = people.rows.findIndex(r => String(r[people.idx.PersonID] || '').trim() === pid);
    const row = new Array(people.headers.length).fill('');
    if (idx !== -1) {
      for (let i=0;i<people.headers.length;i+=1) row[i] = people.rows[idx][i];
    }
    row[people.idx.PersonID] = pid;
    row[people.idx.RelationshipToPatriarch] = String(payload.RelationshipToPatriarch || '').trim();
    row[people.idx.GenerationTier] = String(payload.GenerationTier || '').trim();
    row[people.idx.FatherID] = String(payload.FatherID || '').trim();
    row[people.idx.MotherID] = String(payload.MotherID || '').trim();
    row[people.idx.SpouseFullNameOptional] = String(payload.SpouseFullNameOptional || '').trim();
    const nameIdx = _optionalHeaderIndex(people, ['FullName', 'Name']);
    if (nameIdx !== -1) row[nameIdx] = String(payload.FullName || '').trim();
    if (idx === -1) people.sheet.appendRow(row); else people.sheet.getRange(idx + 2, 1, 1, row.length).setValues([row]);
    return { success: true, PersonID: pid };
  } catch (e) { throw new Error(_errMsg('upsertFamilyMember', e)); }
}

function upsertFamilyPhoto(token, payload) {
  try {
    _auth(token);
    payload = payload || {};

    const personID = String(payload.PersonID || '').trim();
    if (!personID) {
      throw new Error('PersonID is required for photo updates.');
    }

    const people = _readSheet('People', { PersonID:['PersonID'] });
    const personExists = people.rows.some(r => String(r[people.idx.PersonID] || '').trim() === personID);
    if (!personExists) {
      throw new Error('Person record not found. Save member details first.');
    }

    const photos = _readSheet('Photos', { PersonID:['PersonID'], PhotoFileURL:['PhotoFileURL', 'FileURL', 'PhotoURL', 'URL'], PhotoType:['PhotoType', 'Type'] });
    const photoType = String(payload.PhotoType || 'profile').trim() || 'profile';
    let photoURL = String(payload.PhotoFileURL || '').trim();

    const base64 = String(payload.PhotoBase64 || '').trim();
    if (!photoURL && base64) {
      const commaIdx = base64.indexOf(',');
      const encoded = commaIdx === -1 ? base64 : base64.substring(commaIdx + 1);
      const mimeType = String(payload.MimeType || 'image/jpeg').trim() || 'image/jpeg';
      const extension = mimeType.indexOf('png') !== -1 ? 'png' : (mimeType.indexOf('webp') !== -1 ? 'webp' : 'jpg');
      const blob = Utilities.newBlob(Utilities.base64Decode(encoded), mimeType, personID + '_' + Date.now() + '.' + extension);
      const folder = DriveApp.getRootFolder();
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      photoURL = 'https://drive.google.com/uc?export=view&id=' + file.getId();
    }

    if (!photoURL) {
      throw new Error('Photo file URL or image upload is required.');
    }

    const existingIdx = photos.rows.findIndex(r => String(r[photos.idx.PersonID] || '').trim() === personID && String(r[photos.idx.PhotoType] || '').trim().toLowerCase() === photoType.toLowerCase());
    const row = new Array(photos.headers.length).fill('');
    if (existingIdx !== -1) {
      for (let i=0;i<photos.headers.length;i+=1) row[i] = photos.rows[existingIdx][i];
    }
    row[photos.idx.PersonID] = personID;
    row[photos.idx.PhotoFileURL] = photoURL;
    row[photos.idx.PhotoType] = photoType;

    if (existingIdx === -1) {
      photos.sheet.appendRow(row);
    } else {
      photos.sheet.getRange(existingIdx + 2, 1, 1, row.length).setValues([row]);
    }

    return { success: true, PersonID: personID, PhotoFileURL: photoURL, PhotoType: photoType };
  } catch (e) { throw new Error(_errMsg('upsertFamilyPhoto', e)); }
}

function getFamilyTree(token) {
  const data = getFamilyData(token);
  const map = {};
  (data.members || []).forEach(m => { map[m.PersonID] = Object.assign({ children: [] }, m); });
  Object.keys(map).forEach(pid => {
    const m = map[pid];
    [m.FatherID, m.MotherID].forEach(parentID => { if (parentID && map[parentID]) map[parentID].children.push(pid); });
  });
  return { success: true, nodes: Object.keys(map).map(k => map[k]) };
}

function getVotingDashboard(token) {
  try {
    _auth(token);
    const votes = getVotes(token);
    return { success: true, canCreateVote: votes.canCreateVote, canCastBallot: votes.canCastBallot, votes: votes.votes || [] };
  } catch (e) { throw new Error(_errMsg('getVotingDashboard', e)); }
}

function createVoteEnhanced(token, payload) {
  try {
    payload = payload || {};
    const res = createVote(token, payload.title, payload.thresholdType, payload.status);
    const ctx = _getGovernanceSheets();
    const imageURL = String(payload.imageURL || '').trim();
    const description = String(payload.description || '').trim();
    const imageIdx = _optionalHeaderIndex(ctx.votes, ['ImageURL', 'ProposalImageURL', 'ThumbnailURL']);
    const descriptionIdx = _optionalHeaderIndex(ctx.votes, ['Description', 'ProposalDescription', 'Details']);
    const idx = ctx.votes.rows.findIndex(r => String(r[ctx.votes.idx.VoteID] || '').trim() === res.vote.VoteID);
    if (idx !== -1) {
      if (imageIdx !== -1) {
        ctx.votes.sheet.getRange(idx + 2, imageIdx + 1).setValue(imageURL);
      }
      if (descriptionIdx !== -1) {
        ctx.votes.sheet.getRange(idx + 2, descriptionIdx + 1).setValue(description);
      }
    }
    return {
      success: true,
      vote: Object.assign({}, res.vote, {
        Description: description,
        ImageURL: imageURL
      })
    };
  } catch (e) { throw new Error(_errMsg('createVoteEnhanced', e)); }
}

function _readVoteImageURL(votesCtx, row) {
  const imageIdx = _optionalHeaderIndex(votesCtx, ['ImageURL', 'ProposalImageURL', 'ThumbnailURL']);
  if (imageIdx === -1) {
    return '';
  }
  return String(row[imageIdx] || '').trim();
}

function _readVoteDescription(votesCtx, row) {
  const descriptionIdx = _optionalHeaderIndex(votesCtx, ['Description', 'ProposalDescription', 'Details']);
  if (descriptionIdx === -1) {
    return '';
  }
  return String(row[descriptionIdx] || '').trim();
}

function getTimelineCalendarData(token) {
  try {
    _auth(token);
    const data = getTimelineData(token);
    const buckets = {};
    (data.upcoming || []).forEach(item => {
      const d = item.NextOccurrence || item.EventDate;
      const k = d ? String(d).slice(0, 10) : '';
      if (!k) return;
      if (!buckets[k]) buckets[k] = [];
      buckets[k].push(item);
    });
    return Object.assign({}, data, { calendar: buckets });
  } catch (e) { throw new Error(_errMsg('getTimelineCalendarData', e)); }
}

function getSOSAdminGuide(token) {
  try {
    const session = _auth(token); _assertAdminSession(session);
    return {
      success: true,
      whatsappConfigInstructions: [
        'In Settings sheet add key WhatsAppNumber with an international number (example: 15551234567).',
        'Optional key WhatsAppMessageTemplate can include {email}, {name}, {lat}, {lng}, {map}.',
        'Optional key SOSEmergencyAction can be set to whatsapp to surface one-click action.'
      ],
      otpEmailInstructions: [
        'Authorize MailApp for the Apps Script deployment owner.',
        'Deploy as web app with the owner account that can send email.',
        'Ensure Access.EmailOptional has valid addresses for recipients.'
      ]
    };
  } catch (e) { throw new Error(_errMsg('getSOSAdminGuide', e)); }
}

function _optionalHeaderIndex(ctx, aliases) {
  for (let i = 0; i < (aliases || []).length; i += 1) {
    const alias = aliases[i];
    if (Object.prototype.hasOwnProperty.call(ctx.headerMap, alias)) {
      return ctx.headerMap[alias];
    }
  }
  return -1;
}

function _norm(value) {
  return String(value || '').toLowerCase().trim();
}

function _errMsg(functionName, error) {
  const base = error && error.message ? String(error.message) : 'Unknown error';
  return functionName + ': ' + base;
}
