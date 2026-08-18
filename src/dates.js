const MS_DAY = 86400000;
const MS_WEEK = 7 * MS_DAY;

function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d;
}

function mondayOfISO(iso) {
  return toISO(mondayOf(parseISO(iso)));
}

function todayMonday() {
  return toISO(mondayOf(new Date()));
}

function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function addWeeks(iso, n) {
  return toISO(new Date(parseISO(iso).getTime() + n * MS_WEEK));
}

function diffWeeks(a, b) {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / MS_WEEK);
}

function monthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: toISO(start), end: toISO(end) };
}

function monthLabel(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const names = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
  return `${names[m]} ${y}`;
}

function isoWeekNumber(iso) {
  const d = mondayOf(parseISO(iso));
  d.setDate(d.getDate() + 3);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / MS_DAY + 1) / 7);
}

function weekLabel(iso) {
  return `Tuần ${isoWeekNumber(iso)} (${addDays(iso, 0).slice(5).replace('-', '/')}–${addDays(iso, 6).slice(5).replace('-', '/')})`;
}

function shortWeekLabel(iso) {
  const dd = addDays(iso, 0).slice(5).replace('-', '/');
  const nd = addDays(iso, 6).slice(5).replace('-', '/');
  return `T${isoWeekNumber(iso)} · ${dd}–${nd}`;
}

function daysBetween(a, b) {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / MS_DAY);
}

module.exports = {
  parseISO, toISO, mondayOf, mondayOfISO, todayMonday, addDays, addWeeks,
  diffWeeks, monthRange, monthLabel, isoWeekNumber, weekLabel, shortWeekLabel, daysBetween,
};
