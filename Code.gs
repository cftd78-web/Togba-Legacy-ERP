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

    const alerts = _readSheet('SOSAlerts', {
      ReporterEmail: ['ReporterEmail', 'EmailOptional', 'Email'],
      Lat: ['Lat', 'Latitude'],
      Lng: ['Lng', 'Longitude'],
      Status: ['Status'],
      WhatsAppLink: ['WhatsAppLink', 'WhatsAppURL']
    });

    const row = new Array(alerts.headers.length).fill('');
    row[alerts.idx.ReporterEmail] = session.email;
    row[alerts.idx.Lat] = Number(lat) || 0;
    row[alerts.idx.Lng] = Number(lng) || 0;
    row[alerts.idx.Status] = 'Open';
    row[alerts.idx.WhatsAppLink] = '';

    alerts.sheet.appendRow(row);

    return { success: true };
  } catch (e) {
    throw new Error(_errMsg('triggerSOS', e));
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
