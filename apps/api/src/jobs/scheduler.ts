import { randomUUID } from "node:crypto";
import { localDate, cents, type Dataset } from "@biz/shared";
import type { Repository } from "../database/repository.js";
import { dashboard } from "../modules/finance.js";
export async function retry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  let error: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      error = e;
      if (i < attempts - 1) await wait(250 * 2 ** i);
    }
  }
  throw error;
}
export function deadlineDays(dueDate: string, today = localDate()): number {
  return Math.round(
    (Date.parse(dueDate + "T00:00:00+04:00") -
      Date.parse(today + "T00:00:00+04:00")) /
      86400000,
  );
}
export function reminders(data: Dataset, now = new Date()) {
  for (const obligation of data.obligations) {
    if (obligation.status === "completed") continue;
    const days = deadlineDays(obligation.dueDate, localDate(now));
    if (days < 0) obligation.status = "overdue";
    if (!data.preferences.reminders.includes(days) && days >= 0) continue;
    const eventKey = `${obligation.uid}:${days < 0 ? "overdue" : days}`;
    if (data.notifications.some((n) => n.eventKey === eventKey)) continue;
    data.notifications.push({
      uid: randomUUID(),
      eventKey,
      title: days < 0 ? "ვადაგადაცილებული ვალდებულება" : "მოახლოებული ვადა",
      body: data.preferences.detailedNotifications
        ? `${obligation.taxType} · ${obligation.dueDate}`
        : "გახსენით BizMonitor დეტალებისთვის.",
      createdAt: now.toISOString(),
      read: false,
    });
  }
}
export function financialAlerts(data: Dataset, now = new Date()) {
  const summary = dashboard(data, now);
  const yesterday = cents(summary.comparisons.yesterday);
  const today = cents(summary.sales);
  const change = today - yesterday;
  const absolute = change < 0n ? -change : change;
  const add = (eventKey: string, title: string) => {
    if (!data.notifications.some((n) => n.eventKey === eventKey))
      data.notifications.push({
        uid: randomUUID(),
        eventKey,
        title,
        body: "გახსენით BizMonitor დეტალებისთვის.",
        read: false,
        createdAt: now.toISOString(),
      });
  };
  if (
    yesterday > 0n &&
    absolute * 100n >=
      yesterday * BigInt(Math.round(data.preferences.salesChangePercent))
  )
    add(
      `sales:${localDate(now)}:${data.preferences.salesChangePercent}`,
      "გაყიდვების მნიშვნელოვანი ცვლილება · Demo",
    );
  for (const debt of data.debts)
    if (debt.amount !== null && cents(debt.amount) > 0n)
      add(
        `debt:${debt.uid}:${debt.amount}`,
        "საგადასახადო ნაშთის ცვლილება · Demo",
      );
}
export class SyncService {
  private running = new Set<string>();
  constructor(private repo: Repository) {}
  async sync(businessUid: string, integrationUid: string) {
    const key = `${businessUid}:${integrationUid}`;
    if (this.running.has(key)) throw new Error("SYNC_IN_PROGRESS");
    this.running.add(key);
    try {
      return await retry(() =>
        this.repo.mutate(businessUid, (d) => {
          const integration = d.integrations.find(
            (i) => i.uid === integrationUid,
          );
          if (!integration) throw new Error("INTEGRATION_NOT_FOUND");
          if (integration.source !== "demo") throw new Error("UNSUPPORTED");
          const now = new Date().toISOString();
          integration.lastSuccessAt = now;
          integration.state = "connected";
          integration.message = "Demo synchronization completed";
          const records =
            integrationUid === "rs-demo"
              ? [
                  ...d.receipts,
                  ...d.registers,
                  ...d.debts,
                  ...d.obligations,
                  ...d.declarations,
                ]
              : [...d.accounts, ...d.transactions, ...d.settlements];
          for (const r of records) if (r.source === "demo") r.syncedAt = now;
          d.logs.unshift({
            uid: randomUUID(),
            integrationUid,
            at: now,
            state: "success",
            message: "Demo snapshot refreshed; no live request made",
          });
          d.logs = d.logs.slice(0, 100);
          reminders(d);
          financialAlerts(d);
          return integration;
        }),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        !["UNSUPPORTED", "INTEGRATION_NOT_FOUND"].includes(error.message)
      )
        await this.repo
          .mutate(businessUid, (d) => {
            const integration = d.integrations.find(
              (i) => i.uid === integrationUid,
            );
            if (integration) {
              integration.state = "error";
              integration.message = "Synchronization failed; retry later";
            }
            d.logs.unshift({
              uid: randomUUID(),
              integrationUid,
              at: new Date().toISOString(),
              state: "error",
              message:
                "Synchronization failed after retry; sensitive details withheld",
            });
            const eventKey = `sync-error:${integrationUid}:${integration?.lastSuccessAt ?? "never"}`;
            if (!d.notifications.some((n) => n.eventKey === eventKey))
              d.notifications.push({
                uid: randomUUID(),
                eventKey,
                title: "სინქრონიზაცია ვერ დასრულდა",
                body: "გახსენით BizMonitor დეტალებისთვის.",
                read: false,
                createdAt: new Date().toISOString(),
              });
          })
          .catch(() => {});
      throw error;
    } finally {
      this.running.delete(key);
    }
  }
}
