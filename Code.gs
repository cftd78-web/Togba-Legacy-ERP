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
