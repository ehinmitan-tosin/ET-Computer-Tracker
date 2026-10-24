// Date and phone formatting. All dates are shown in Lagos time.

const TIME_ZONE = "Africa/Lagos";
const LOCALE = "en-NG";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Lagos as "YYYY-MM-DD" (for overdue checks and the minimum promised date). */
export function todayInLagos(now = new Date()) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const currentYear = () => todayInLagos().slice(0, 4);

function formatter(options) {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, ...options });
}
const dayMonth = formatter({ day: "numeric", month: "short" });
const dayMonthYear = formatter({ day: "numeric", month: "short", year: "numeric" });
const time = formatter({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const longDate = formatter({ weekday: "long", day: "numeric", month: "long", year: "numeric" });

// "YYYY-MM-DD" → Date at noon UTC (13:00 in Lagos), so the calendar day never shifts.
function parseDateOnly(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  // Reject dates that roll over, e.g. 2026-02-30 → 2 March.
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function lagosYear(date) {
  return todayInLagos(date).slice(0, 4);
}

/** ISO timestamp → "7 Oct, 10:42" (year added when not the current year). Invalid input → "". */
export function formatDateTime(iso) {
  const date = new Date(iso ?? "");
  if (!iso || Number.isNaN(date.getTime())) return "";
  const day = lagosYear(date) === currentYear() ? dayMonth : dayMonthYear;
  return `${day.format(date)}, ${time.format(date)}`;
}

/** "YYYY-MM-DD" → "10 Oct" (year added when not the current year). Invalid input → "". */
export function formatDate(yyyyMmDd) {
  const date = parseDateOnly(yyyyMmDd);
  if (!date) return "";
  return (lagosYear(date) === currentYear() ? dayMonth : dayMonthYear).format(date);
}

/** "YYYY-MM-DD" → "Thursday, 8 October 2026". Invalid input → "". */
export function formatLongDate(yyyyMmDd) {
  const date = parseDateOnly(yyyyMmDd);
  return date ? longDate.format(date) : "";
}

// "+2348030004471" / "08030004471" → "08030004471"; anything else → null.
function localNigerianNumber(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("234")) return `0${digits.slice(3)}`;
  if (digits.length === 11 && digits.startsWith("0")) return digits;
  return null;
}

/** Full number for staff views: "+2348030004471" → "0803 000 4471". Unknown formats are returned unchanged. */
export function formatPhone(phone) {
  const local = localNigerianNumber(phone);
  return local ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : String(phone ?? "");
}

/** Masked number for screens customers may see: "+2348030004471" → "0803 *** 4471". */
export function maskPhone(phone) {
  const local = localNigerianNumber(phone);
  if (local) return `${local.slice(0, 4)} *** ${local.slice(7)}`;
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `*** ${digits.slice(-4)}` : "";
}
