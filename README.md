# Seat booking

A bilingual seat reservation system for a single event. 75 seats on an interactive map,
Arabic and English, with a Google Apps Script backend writing to a Google Sheet and a
script lock preventing two people from booking the same seat.

**Status** Archived. Ran for its event, preserved as a reference implementation
**Built** October 2025
**Live** [Demo](https://seats-bookingg.netlify.app/) (frontend only, no backend attached)

## Why this exists

An event needed seat reservations, gender-segregated sections, and an interface that worked
in Arabic for attendees who would not use an English one. The budget was zero and the
organisers needed to see the bookings in a format they could already read.

That last constraint decided the architecture. A Google Sheet is a database the organisers
can open, sort, filter and export without me being involved or a dashboard existing. The
technically better choice would have been Postgres and a small API. The correct choice for
these people was the spreadsheet they already knew how to use.

## What this is and is not

**The frontend and the backend script are both in this repo, but it is not a deployable
unit.** `index.html` is the interface. `Code.gs` is the Apps Script backend. Making it work
means creating your own Apps Script project, pasting `Code.gs` in, running the setup
function to create a Sheet, and deploying it as a web app.

**The Netlify demo has no backend.** It renders the seat map and the booking flow so you
can see the interface. Nothing is stored.

**There are no user accounts.** Attendees do not log in. A booking is identified by the
name, college and phone number entered at the time, and cancelling means supplying one of
those. Administrative functions are protected only by the fact that running them requires
access to the Apps Script project itself.

**Access control means the sheet's sharing settings.** There is no authentication in
`Code.gs`. Whoever can open the spreadsheet can read every attendee's name and phone
number. For a one-off student event with organisers
who already had that list, that was acceptable. It would not be acceptable for anything
larger, and it is the first thing I would change.

## Stack and rationale

| Layer | Choice | Why |
|---|---|---|
| Frontend | Single `index.html` with inline CSS and JavaScript | One file to hand over. No build step, deploys anywhere, and the organisers could host it themselves if I disappeared |
| Backend | Google Apps Script | Free, no server to keep alive, and it runs next to the data. The alternative was paying for hosting for an event lasting one day |
| Storage | Google Sheets | The organisers can read, sort and export bookings without any interface I have to build. This is the reason the whole stack exists |
| Concurrency | `LockService.getScriptLock()` | Apps Script has no transactions. A script lock is the only primitive that makes read-then-write safe |
| Index | `CacheService` | Turns "find this seat's row" from a full column scan into a map lookup |
| Hosting | Netlify | Static file, free, instant deploys |

## Design decisions

1. **Every booking write happens inside a script lock with a 5 second timeout.** The two
   attendee-facing writes, `reserveSeat` and `cancelBooking`, both take the lock. The
   administrative functions (`seedSeats`, `syncInventoryWithCode`) do not, because they are
   run by one person from the script editor and never concurrently. `tryLock(5000)`
   returns false rather than queueing forever, and the user gets "System busy, please try
   again" instead of a hung page. The lock is released in a `finally` block so a thrown
   error cannot leave it held.

2. **The availability check lives inside the lock, not before it.** Reading the status,
   deciding, and writing all happen while the lock is held. Checking first and locking
   second would be a race with a smaller window, which is worse than an obvious one because
   it only fails under the load you get on the day tickets open.

3. **The seat's row index is cached, not scanned.** `getSeatIndex_` builds a map of seat id
   to row number and caches it for 600 seconds. Without it, every booking scans column A.
   Apps Script charges you in wall-clock time for spreadsheet reads, and the lock is held
   for the duration of that scan.

4. **A reservation is one write, not five.** `getRange(row, 2, 1, 5).setValues([[...]])`
   writes status, name, college, phone and timestamp in a single call. Five separate writes
   would be five round trips holding the lock, and a failure halfway through would leave a
   half-booked row.

5. **Ambiguous cancellations are refused, not guessed.** If a name matches more than one
   booking, `cancelBooking` returns `Multiple matches` along with the seat ids rather than
   cancelling the first one it found. Cancelling a stranger's seat because two people share
   a name is not a recoverable error at an event.

6. **Gender sections are frontend validation, not backend enforcement.**
   `isSeatAllowedForGender()` lives in `index.html`; `Code.gs` takes no gender parameter
   and performs no section check. If you deploy this, add the check server-side. As shipped
   it holds only because the browser page is the only client.

## How a booking works

`reserveSeat(seatId, name, college, phone)` in `Code.gs`:

1. Reject if `CONFIG.bookingOpen` is false.
2. Trim and validate all four fields. Any empty one returns `Missing required fields`.
3. Acquire the script lock, waiting up to 5 seconds. On failure return `System busy`.
4. Look up the seat's row from the cached index. Unknown seat returns `Seat not found`.
5. Read the current status. Anything other than `AVAILABLE` returns `Seat already booked`.
6. Write all five columns in one `setValues` call.
7. Refresh the cache entry, release the lock in `finally`, return `{ ok: true, seatId }`.

Steps 3 through 6 are the whole point. Two people pressing the same seat at the same moment
serialise at step 3, and the second one fails at step 5 with a clear message.

## Seat layout

75 seats total.

Left columns L1 (8), L2 (6), L3 (6), L4 (5). Right columns R1 (8), R2 (6), R3 (6), R4 (5).
Centre rows A (3), B (6), C (8), D (8).

Men may book R1 to R4. Women may book L1 to L4 and rows A to D.

## Data model

One sheet, six columns. The sheet name is read from `CONFIG.sheetName`, which ships as a
sanitised placeholder in the public repo rather than the name used at the event.

| Column | Contents |
|---|---|
| SeatID | `L1-3`, `R2-5`, `B4` |
| Status | `AVAILABLE` or `BOOKED` |
| HolderName | Full name |
| College | University or college |
| Phone | Contact number |
| Timestamp | When the row last changed |

There is no separate bookings table. A booking is a row transitioning from `AVAILABLE` to
`BOOKED`, and cancelling clears the fields and writes the timestamp. That means no history:
once a seat is cancelled, there is no record it was ever held.

## Known limitations

**Cancellation reads the sheet once per candidate row.** The loop already holds the full
data block from a single `getRange` call, then calls `getRange(rowIndex,
targetCol).getValue()` again inside the loop for the comparison column. That is one API
round trip per row, while the lock is held. Survivable at 75 rows, and a straightforward
fix against data already in memory.

**No booking history.** Cancelling erases the previous holder. There is no way to answer
"who had seat C4 before" or to audit a dispute.

**Any change requires a redeployment.** Apps Script web apps serve a pinned version, so
editing `Code.gs` does nothing until a new deployment is published. This caught me
repeatedly during the event build, and it is the single most annoying property of the
platform.

**Apps Script quotas apply.** Execution time and daily call limits are Google's, not mine.
Fine for one event, not for continuous operation.

**Booking open and closed is a constant in the source.** `CONFIG.bookingOpen` requires an
edit and a redeploy to flip, which is exactly the wrong ergonomics for the one setting an
organiser might want to change at short notice. It belongs in Script Properties.

**Gender rules are client-side only.** See design decision 6. Add the check to
`reserveSeat` before deploying this anywhere that matters.

**Administrative functions are unauthenticated at the code level.** They are protected by
the fact that running them requires access to the Apps Script project. That is a real
boundary, but it is not one expressed anywhere in the code.

## Setting it up

Requires a Google account.

1. Create a project at [script.google.com](https://script.google.com) and paste in
   `Code.gs`.
2. Run `createInventorySpreadsheet()`. It creates the Sheet and stores its id in Script
   Properties.
3. Run `seedSeats()` to build the seat inventory. This destroys existing data, so use
   `syncInventoryWithCode()` instead if bookings already exist.
4. Deploy as a web app. Set execution and access permissions according to how open the
   booking needs to be.
5. Host `index.html` anywhere static. It talks to the backend through `google.script.run`.

## API

Public: `getBookingStatus()`, `getSeats()`, `reserveSeat(seatId, name, college, phone)`,
`cancelBooking(type, value)` where type is `name`, `phone` or `kuid`.

Management: `seedSeats()` rebuilds inventory and destroys data, `syncInventoryWithCode()`
adds missing seats non-destructively.

Setup: `createInventorySpreadsheet()`, `setSpreadsheetId(id)`.

One wart worth knowing: the `kuid` identifier from the UI maps to the `College` column. The
field was repurposed during the build and the name never followed.

## AI usage disclosure

AI coding tools were used during the development of this project. All generated code was
reviewed before use.

The application does not call any model at runtime.

## Licence

Provided as-is for reference. Sanitised for public release, with event-specific details
replaced by placeholders.
