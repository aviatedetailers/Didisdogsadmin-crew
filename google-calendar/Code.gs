// Didi's Dogs -> Google Calendar sync.
// Paste into script.google.com (any Google account). It keeps a calendar named "Didi's Dogs"
// up to date; share that calendar with whoever should see the events.
// then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
// The app sends every event added, changed or deleted here, and this updates the calendar.

const SECRET = "PASTE_SECRET_HERE";   // must match the app's setting
const TZ = "America/New_York";
const CAL_NAME = "Didi's Dogs";

function getCal() {
  const found = CalendarApp.getCalendarsByName(CAL_NAME);
  if (found.length) return found[0];
  const cal = CalendarApp.createCalendar(CAL_NAME, { timeZone: TZ });
  cal.setColor(CalendarApp.Color.RED);
  return cal;
}

function doGet() {
  return ContentService.createTextOutput("Didi's Dogs calendar sync is running.");
}

function doPost(e) {
  let msg;
  try { msg = JSON.parse(e.postData.contents); } catch (err) { return reply("bad request"); }
  if (!msg || msg.secret !== SECRET) return reply("not allowed");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const props = PropertiesService.getScriptProperties();
    const key = "dd_" + msg.id;
    const cal = getCal();
    const oldId = props.getProperty(key);
    let ev = oldId ? cal.getEventById(oldId) : null;

    if (msg.action === "delete") {
      if (ev) ev.deleteEvent();
      props.deleteProperty(key);
      return reply("deleted");
    }

    const title = msg.title || "Didi's Dogs event";
    const desc = [msg.notes || "", "Added from the Didi's Dogs app"].filter(String).join("\n\n");
    if (ev) ev.deleteEvent();   // simplest way to apply any change (date, time, all-day)

    if (msg.start) {
      const start = Utilities.parseDate(msg.date + " " + msg.start.slice(0, 5), TZ, "yyyy-MM-dd HH:mm");
      let end = msg.end
        ? Utilities.parseDate(msg.date + " " + msg.end.slice(0, 5), TZ, "yyyy-MM-dd HH:mm")
        : new Date(start.getTime() + 2 * 60 * 60 * 1000);   // no end time: 2 hours
      if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);   // goes past midnight
      ev = cal.createEvent(title, start, end, { location: msg.location || "", description: desc });
    } else {
      const day = Utilities.parseDate(msg.date, TZ, "yyyy-MM-dd");
      ev = cal.createAllDayEvent(title, day, { location: msg.location || "", description: desc });
    }
    props.setProperty(key, ev.getId());
    return reply("saved");
  } finally {
    lock.releaseLock();
  }
}

function reply(text) { return ContentService.createTextOutput(text); }

// Run once from the editor: approves calendar access and creates the "Didi's Dogs" calendar.
function testSetup() {
  Logger.log("Ready. Calendar: " + getCal().getName());
}
