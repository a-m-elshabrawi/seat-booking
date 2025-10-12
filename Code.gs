/** =========================
 *  Seat Booking Backend (Code.gs)
 *  - Stand-alone safe: stores Spreadsheet ID in Script Properties
 *  - Toggle booking on/off via CONFIG.bookingOpen (true/false)
 *  - Uses "College" instead of "KUID"
 *  - Concurrency via LockService.getScriptLock()
 *  - Front-end calls:
 *      getBookingStatus()
 *      reserveSeat(seatId, name, college, phone)
 *      getSeats()
 *      cancelBooking(type, value)
 *      seedSeats()                  // optional, rebuilds (DESTROYS data)
 *      syncInventoryWithCode()      // safe add-missing
 *      verifyAdminPassword(pwd)     // admin pass check
 *  - Setup helpers:
 *      createInventorySpreadsheet() // create new sheet & store ID
 *      setSpreadsheetId(id)         // store existing sheet ID
 *  ========================= */

const CONFIG = {
  sheetName: 'SHEET_NAME',
  propKey:   'SHEET_NAME',
  bookingOpen: true,            // <<< Toggle this to open/close booking
  // Optional: you can hardcode a spreadsheet id here instead of using Script Properties:
  // spreadsheetId: 'PUT-OPTIONAL-SHEET-ID-HERE'
};

/** Serve index.html */
function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('Seat Booking')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** ======== Booking status API ======== */
function getBookingStatus() {
  return { open: !!CONFIG.bookingOpen };
}

/** ======== Spreadsheet access (stand-alone safe) ======== */
function getSpreadsheet_() {
  // 1) priority: CONFIG.spreadsheetId if provided
  let id = CONFIG.spreadsheetId && String(CONFIG.spreadsheetId).trim();
  // 2) else: Script Properties
  if (!id) {
    const props = PropertiesService.getScriptProperties();
    id = props.getProperty(CONFIG.propKey);
  }
  if (!id) {
    throw new Error('No spreadsheet is configured. Run createInventorySpreadsheet() or setSpreadsheetId("YOUR_ID").');
  }
  return SpreadsheetApp.openById(id);
}

/** Create new spreadsheet and store its ID (one-time setup) */
function createInventorySpreadsheet() {
  const ss = SpreadsheetApp.create('Seat Booking Inventory');
  PropertiesService.getScriptProperties().setProperty(CONFIG.propKey, ss.getId());
  const sh = ss.getActiveSheet();
  sh.setName(CONFIG.sheetName);
  // Headers
  sh.getRange(1,1,1,6).setValues([['SeatID','Status','HolderName','College','Phone','Timestamp']]);
  return { ok: true, spreadsheetId: ss.getId(), url: ss.getUrl() };
}

/** Bind an existing spreadsheet by ID (one-time setup) */
function setSpreadsheetId(id) {
  if (!id) throw new Error('Missing spreadsheet id.');
  // Check that it opens
  const ss = SpreadsheetApp.openById(id);
  PropertiesService.getScriptProperties().setProperty(CONFIG.propKey, ss.getId());
  // Ensure sheet & headers exist
  const { sh } = getOrCreateInventory_();
  return { ok: true, spreadsheetId: ss.getId(), url: ss.getUrl(), sheet: sh.getName() };
}

/** ========== Sheet bootstrap ========== */
function getOrCreateInventory_() {
  const ss = getSpreadsheet_();

  let sh = ss.getSheetByName(CONFIG.sheetName);
  if (!sh) sh = ss.insertSheet(CONFIG.sheetName);

  // Ensure headers exist and match our model:
  const headers = ['SeatID', 'Status', 'HolderName', 'College', 'Phone', 'Timestamp'];
  if (sh.getLastRow() === 0) sh.insertRowBefore(1);
  const lastCol = Math.max(sh.getLastColumn(), headers.length);
  const current = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  let changed = false;
  for (let i = 0; i < headers.length; i++) {
    if ((current[i] || '') !== headers[i]) {
      current[i] = headers[i];
      changed = true;
    }
  }
  if (changed) sh.getRange(1, 1, 1, headers.length).setValues([current.slice(0, headers.length)]);

  return { ss, sh, headers };
}

/** ========== Seat list used by the front-end layout ==========
 * Left:  L1=8, L2=6, L3=6, L4=5
 * Right: R4=5, R3=6, R2=6, R1=8
 * Rows:  A=3, B=6, C=8, D=8
 * IDs look like: "L1-3", "R2-5", "B4", etc.
 */
function seatIdsList_() {
  const out = [];

  // Columns (left)
  pushRange_('L1', 8, out, true);
  pushRange_('L2', 6, out, true);
  pushRange_('L3', 6, out, true);
  pushRange_('L4', 5, out, true);

  // Columns (right)
  pushRange_('R4', 5, out, true);
  pushRange_('R3', 6, out, true);
  pushRange_('R2', 6, out, true);
  pushRange_('R1', 8, out, true);

  // Center rows
  pushRange_('A', 3, out, false);
  pushRange_('B', 6, out, false);
  pushRange_('C', 8, out, false);
  pushRange_('D', 8, out, false);

  return out;
}
function pushRange_(prefix, count, arr, hyphen) {
  for (let i = 1; i <= count; i++) {
    arr.push(hyphen ? `${prefix}-${i}` : `${prefix}${i}`);
  }
}

/** ========== Public API used by the web app ========== */

/** Return [{seatId, status}, ...] */
function getSeats() {
  const { sh } = getOrCreateInventory_();
  const last = sh.getLastRow();
  if (last < 2) return []; // no data yet

  const vals = sh.getRange(2, 1, last - 1, 2).getValues(); // SeatID, Status
  const list = [];
  for (let i = 0; i < vals.length; i++) {
    const id = String(vals[i][0] || '').trim();
    const status = String(vals[i][1] || '').trim() || 'AVAILABLE';
    if (id) list.push({ seatId: id, status: status.toUpperCase() });
  }
  return list;
}

/** Book a seat if AVAILABLE and booking is open */
function reserveSeat(seatId, name, college, phone) {
  if (!CONFIG.bookingOpen) return { ok: false, reason: 'Booking closed' };

  seatId = String(seatId || '').trim().toUpperCase();
  name = String(name || '').trim();
  college = String(college || '').trim();
  phone = String(phone || '').trim();

  if (!seatId || !name || !college || !phone) {
    return { ok: false, reason: 'Missing required fields' };
  }

  const { sh } = getOrCreateInventory_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok:false, reason:'System busy, please try again' };

  try {
    // O(1) lookup
    const idx = getSeatIndex_(sh);
    const row = idx[seatId] || null;
    if (!row) return { ok:false, reason:'Seat not found' };

    const status = String(sh.getRange(row, 2).getValue() || '').toUpperCase();
    if (status && status !== 'AVAILABLE') return { ok:false, reason:'Seat already booked' };

    // Single write
    sh.getRange(row, 2, 1, 5).setValues([[
      'BOOKED', name, college, phone, new Date()
    ]]);

    // keep cache warm (row didn’t change, but ensure key exists)
    updateSeatIndexCache_(seatId, row);

    return { ok: true, seatId };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Cancel by unique identifier.
 * type: 'kuid' (mapped to College), 'phone', or 'name'
 * value: the search value (exact, case-insensitive for strings)
 */
function cancelBooking(type, value) {
  if (!CONFIG.bookingOpen) return { ok: false, reason: 'Booking closed' };

  type = String(type || '').toLowerCase().trim();
  value = String(value || '').trim();
  if (!value) return { ok: false, reason: 'Empty value' };

  const { sh, headers } = getOrCreateInventory_();

  // Map UI types to column indices
  // SeatID | Status | HolderName | College | Phone | Timestamp
  const COL = {
    name: headers.indexOf('HolderName') + 1,
    kuid: headers.indexOf('College') + 1, // "kuid" from UI = College column
    phone: headers.indexOf('Phone') + 1
  };

  const targetCol = COL[type];
  if (!targetCol) return { ok: false, reason: 'Unsupported identifier type' };

  const last = sh.getLastRow();
  if (last < 2) return { ok: false, reason: 'No bookings found' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {                 // try up to ~5s
  return { ok: false, reason: 'System busy, please try again' };
}
  try {
    // Read entire data block (SeatID, Status, HolderName, College, Phone)
    const range = sh.getRange(2, 1, last - 1, 5).getValues();
    const matches = [];

    for (let i = 0; i < range.length; i++) {
      const rowIndex = i + 2;
      const seatId = String(range[i][0] || '').trim();
      const status = String(range[i][1] || '').trim().toUpperCase();
      const cellVal = String(sh.getRange(rowIndex, targetCol).getValue() || '').trim();

      // Case-insensitive compare for name/college; exact for phone
      const isPhone = (targetCol === COL.phone);
      const equal = isPhone ? (cellVal === value) : (cellVal.toLowerCase() === value.toLowerCase());
      if (equal && status === 'BOOKED') {
        matches.push({ row: rowIndex, seatId });
      }
    }

    if (matches.length === 0) {
      return { ok: false, reason: 'No matching booking found' };
    }
    if (matches.length > 1) {
      return { ok: false, reason: 'Multiple matches', seats: matches.map(m => m.seatId) };
    }

    const { row, seatId } = matches[0];
    // Clear: Status->AVAILABLE, wipe HolderName/College/Phone, set Timestamp
    sh.getRange(row, 2, 1, 5).setValues([[
      'AVAILABLE', '', '', '', new Date()
    ]]);

    return { ok: true, seatId };
  } finally {
    lock.releaseLock();
  }
}

/** Helper: find row number by SeatID (or null) */
function findRowBySeatId_(sh, seatId) {
  const last = sh.getLastRow();
  if (last < 2) return null;
  const vals = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim().toUpperCase() === seatId) {
      return i + 2;
    }
  }
  return null;
}

/** Build/read a cached SeatID -> row index (column A) */
function getSeatIndex_(sh) {
  const cache = CacheService.getScriptCache();
  const key = 'seatIndex';
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const last = sh.getLastRow();
  const map = {};
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues(); // col A
    for (let i = 0; i < ids.length; i++) {
      const id = String(ids[i][0] || '').trim().toUpperCase();
      if (id) map[id] = i + 2; // row number
    }
  }
  cache.put(key, JSON.stringify(map), 600); // cache 10 minutes
  return map;
}

/** Update cache for a single seat (after reserve/cancel) */
function updateSeatIndexCache_(seatId, row) {
  const cache = CacheService.getScriptCache();
  const key = 'seatIndex';
  const hit = cache.get(key);
  const seat = String(seatId || '').trim().toUpperCase();
  if (!seat) return;
  if (hit) {
    const map = JSON.parse(hit);
    map[seat] = row;
    cache.put(key, JSON.stringify(map), 600);
  }
}

/** Invalidate the whole index cache (call from seed/sync) */
function invalidateSeatIndex_() {
  CacheService.getScriptCache().remove('seatIndex');
}


/** ========== Inventory management (optional) ========== */

/** Rebuild the sheet content from code (CAUTION: clears data!) */
function seedSeats() {
  const { sh } = getOrCreateInventory_();
  sh.clearContents();
  sh.getRange(1, 1, 1, 6).setValues([['SeatID','Status','HolderName','College','Phone','Timestamp']]);

  const ids = seatIdsList_();
  if (ids.length) {
    sh.getRange(2, 1, ids.length, 6).setValues(ids.map(id => [id, 'AVAILABLE', '', '', '', '']));
  }
   invalidateSeatIndex_();
  return { ok: true, count: ids.length };
  
}

/**
 * Safe sync: adds any missing SeatIDs as AVAILABLE.
 * Does NOT delete or overwrite existing bookings.
 */
function syncInventoryWithCode() {
  const { sh } = getOrCreateInventory_();
  const want = new Set(seatIdsList_().map(String));

  const last = sh.getLastRow();
  const have = new Set();
  if (last >= 2) {
    const vals = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < vals.length; i++) {
      const id = String(vals[i][0] || '').trim();
      if (id) have.add(id);
    }
  }

  const missing = Array.from(want).filter(id => !have.has(id));
  if (missing.length) {
    const start = sh.getLastRow() + 1;
    sh.getRange(start, 1, missing.length, 6)
      .setValues(missing.map(id => [id, 'AVAILABLE', '', '', '', '']));
  }
   invalidateSeatIndex_();
  return { ok: true, added: missing.length, message: missing.length ? `Added ${missing.length} seats.` : 'All seats already present.' };

}

/** ========== Utilities ========== */

/** Include for templated HTML (if you use <?!= include('filename'); ?>) */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

