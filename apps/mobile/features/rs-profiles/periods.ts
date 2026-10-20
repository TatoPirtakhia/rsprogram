import { localDate } from "@biz/shared";
export interface PeriodRange {
  from: string;
  to: string;
}
export function reportPeriods(now = new Date()) {
  const today = localDate(now);
  const shift = (days: number) =>
    localDate(
      new Date(Date.parse(today + "T12:00:00+04:00") + days * 86400000),
    );
  const monthStart = today.slice(0, 7) + "-01";
  const previousEnd = localDate(
    new Date(Date.parse(monthStart + "T12:00:00+04:00") - 86400000),
  );
  return [
    { value: "today", label: "დღეს", from: today, to: today },
    { value: "yesterday", label: "გუშინ", from: shift(-1), to: shift(-1) },
    { value: "week", label: "ბოლო 7 დღე", from: shift(-6), to: today },
    { value: "month", label: "ბოლო 30 დღე", from: shift(-29), to: today },
    { value: "this-month", label: "ამ თვეში", from: monthStart, to: today },
    {
      value: "last-month",
      label: "წინა თვე",
      from: previousEnd.slice(0, 7) + "-01",
      to: previousEnd,
    },
    {
      value: "year",
      label: "ამ წელს",
      from: today.slice(0, 4) + "-01-01",
      to: today,
    },
  ];
}
export function validPeriod(value: PeriodRange) {
  const from = Date.parse(value.from + "T12:00:00+04:00");
  const to = Date.parse(value.to + "T12:00:00+04:00");
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value.from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.to) &&
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    localDate(new Date(from)) === value.from &&
    localDate(new Date(to)) === value.to &&
    from <= to &&
    to - from <= 365 * 86400000
  );
}
export function shortPeriod(value: PeriodRange) {
  const date = (text: string) => text.split("-").reverse().join(".");
  return value.from === value.to
    ? date(value.from)
    : `${date(value.from)} — ${date(value.to)}`;
}
