import { afterEach, describe, it, expect, vi } from "vitest";
import { createDemo } from "../src/providers/demo.js";
import { MemoryRepository } from "../src/database/repository.js";
import { MemoryPushStore } from "../src/database/push-store.js";
import { PushService } from "../src/modules/push.js";
import { financialAlerts } from "../src/jobs/scheduler.js";
afterEach(() => vi.unstubAllGlobals());
describe("financial alerts and push privacy", () => {
  it("deduplicates unchanged financial alerts", () => {
    const data = createDemo();
    financialAlerts(data);
    const count = data.notifications.length;
    financialAlerts(data);
    expect(data.notifications.length).toBe(count);
  });
  it("sends generic lock-screen bodies and skips accepted tickets on retry", async () => {
    const repo = new MemoryRepository();
    const data = createDemo();
    data.preferences.pushEnabled = true;
    data.notifications[0].body = "Sensitive balance: 99999 GEL";
    repo.datasets.set(data.business.uid, data);
    const devices = new MemoryPushStore();
    await devices.save(data.business.uid, "user", "ExponentPushToken[demo]");
    const send = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ status: "ok" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", send);
    const push = new PushService(repo, devices);
    await push.dispatch(data.business.uid);
    await push.dispatch(data.business.uid);
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(payload[1].body)).not.toContain("99999");
  });
});
