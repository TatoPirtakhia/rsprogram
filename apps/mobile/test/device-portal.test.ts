import { it, expect, vi } from "vitest";
import { runInNewContext } from "node:vm";
vi.mock("expo-crypto", () => ({ randomUUID: () => "job-id" }));
import { portalCaptureScript } from "../services/device/portal-session";
function browser(origin: string) {
  const postMessage = vi.fn();
  class XHR {
    status = 200;
    responseType = "";
    responseText = '{"d":{"Balance":1}}';
    listeners: (() => void)[] = [];
    open(_method: string, _url: string) {}
    addEventListener(_name: string, fn: () => void) {
      this.listeners.push(fn);
    }
    send() {
      for (const fn of this.listeners) fn.call(this);
    }
  }
  const context = {
    location: { origin, href: origin + "/Accounting.aspx" },
    XMLHttpRequest: XHR,
    URL,
    window: { ReactNativeWebView: { postMessage }, fetch: vi.fn() },
  };
  runInNewContext(portalCaptureScript("session-nonce"), context);
  return { XHR, postMessage };
}
it("captures only the exact official debt and inbox response URLs", () => {
  const { XHR, postMessage } = browser("https://eservices.rs.ge");
  for (const url of [
    "https://attacker.invalid/WebServices/hsAccounting.ashx/GetBudgetAccountingInfo",
    "https://eservices.rs.ge/other",
    "https://eservices.rs.ge/WebServices/hsAccounting.ashx/GetBudgetAccountingInfo",
  ]) {
    const x = new XHR();
    x.open("POST", url);
    x.send();
  }
  expect(postMessage).toHaveBeenCalledTimes(1);
  expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({
    nonce: "session-nonce",
    kind: "debt",
    body: { d: { Balance: 1 } },
  });
});
it("does not install capture on foreign pages", () => {
  const { XHR, postMessage } = browser("https://attacker.invalid");
  const x = new XHR();
  x.open(
    "POST",
    "https://eservices.rs.ge/WebServices/hsAccounting.ashx/GetBudgetAccountingInfo",
  );
  x.send();
  expect(postMessage).not.toHaveBeenCalled();
});
