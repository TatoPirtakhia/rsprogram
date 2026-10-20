import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import { LocalProfileStore } from "../src/modules/local-profiles.js";
import { registerLocalProfiles } from "../src/modules/local-profile-routes.js";
import {
  parsePortalDate,
  parsePortalMessages,
  type PortalMessage,
} from "../src/providers/rs-portal-inbox-client.js";
import { checkInboxes, type PushMessage } from "../src/jobs/inbox-poller.js";
import { RsRequestError } from "../src/providers/soap-transport.js";
const directories: string[] = [];
const stores: LocalProfileStore[] = [];
function store() {
  const directory = mkdtempSync(join(tmpdir(), "biz-inbox-"));
  directories.push(directory);
  const value = new LocalProfileStore(directory);
  stores.push(value);
  return value;
}
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of directories.splice(0))
    rmSync(d, { recursive: true, force: true });
});
const row = (id: number, subject: string, read = false) => ({
  NOTIF_ID: id,
  UN_ID: 342259,
  NOTIF_SUBJ: subject,
  NOTIF_DATE: "15-ოქტ-2026 10:05:45",
  READ_DATE: read ? "15-ოქტ-2026 15:18:24" : null,
  NOTIF_TEXT:
    '<p align="justify">მოგესალმებით!&nbsp;შეგახსენებთ</p><p>მეორე<br>ხაზი &amp; ბოლო</p>',
});
const message = (id: string, subject = `subject ${id}`): PortalMessage => ({
  id,
  subject,
  sentAt: "2026-10-15T06:05:45.000Z",
  read: false,
  preview: "",
  text: `text ${id}`,
});
it("parses the portal notifications grid response", () => {
  expect(parsePortalDate("15-ოქტ-2026 10:05:45")).toBe(
    "2026-10-15T06:05:45.000Z",
  );
  expect(
    parsePortalMessages({
      STATUS: { ID: 0 },
      DATA: { data: { Rows: [row(268336259, " სავადო თარიღი ", true)] } },
    }),
  ).toEqual([
    {
      id: "268336259",
      subject: "სავადო თარიღი",
      sentAt: "2026-10-15T06:05:45.000Z",
      read: true,
      preview: "მოგესალმებით! შეგახსენებთ მეორე ხაზი & ბოლო",
      text: "მოგესალმებით! შეგახსენებთ\nმეორე\nხაზი & ბოლო",
    },
  ]);
  expect(() => parsePortalMessages({ STATUS: { ID: 1 } })).toThrow(
    "RS_PORTAL_FORMAT_CHANGED",
  );
  expect(() =>
    parsePortalMessages({
      STATUS: { ID: 0 },
      DATA: { data: { Rows: [{ ...row(1, "x"), NOTIF_DATE: "2026-10-15" }] } },
    }),
  ).toThrow("RS_PORTAL_FORMAT_CHANGED");
});
it("pushes only messages that arrive after the first check", async () => {
  const s = store();
  const profile = s.save({
    name: "Company",
    username: "user",
    password: "secret",
    taxpayerId: "60003008009",
  });
  s.save({ name: "No ID", username: "other", password: "secret" });
  let inbox = [message("1"), message("2")];
  let fail = false;
  const seen: string[] = [];
  const client = {
    async getMessages(credentials: { password: string }, id: string) {
      expect(credentials.password).toBe("secret");
      seen.push(id);
      if (fail) throw new RsRequestError("RS_PORTAL_LOGIN_REQUIRED");
      return inbox;
    },
  };
  const sent: PushMessage[][] = [];
  const send = async (m: PushMessage[]) => void sent.push(m);
  expect(await checkInboxes(s, client, send)).toEqual([]);
  expect(seen).toEqual(["60003008009"]);
  inbox = [message("3", "ახალი წერილი"), ...inbox];
  expect(await checkInboxes(s, client, send)).toEqual([
    {
      title: "Company",
      body: "ახალი წერილი",
      data: { profileUid: profile.uid },
    },
  ]);
  expect(await checkInboxes(s, client, send)).toEqual([]);
  inbox = [message("4"), message("5"), ...inbox];
  expect((await checkInboxes(s, client, send))[0].body).toBe(
    "2 ახალი შეტყობინება RS-დან",
  );
  fail = true;
  expect(await checkInboxes(s, client, send)).toEqual([]);
  expect(s.get(profile.uid).inboxError).toBe("RS_PORTAL_LOGIN_REQUIRED");
  expect(sent).toHaveLength(5);
});
it("marks every stored message read", async () => {
  const s = store();
  const p = s.save({
    name: "Company",
    username: "user",
    password: "secret",
    taxpayerId: "60003008009",
  });
  s.inboxResult(p.uid, [message("1"), message("2")], null);
  expect(s.inbox(p.uid).messages.every((m) => !m.read)).toBe(true);
  expect(s.markInboxRead(p.uid).messages.every((m) => m.read)).toBe(true);
  s.inboxResult(p.uid, [message("3"), message("1"), message("2")], null);
  expect(s.inbox(p.uid).messages.map((m) => m.read)).toEqual([
    false,
    true,
    true,
  ]);
});
it("treats an empty first inbox as the baseline", async () => {
  const s = store();
  s.save({
    name: "Company",
    username: "user",
    password: "secret",
    taxpayerId: "60003008009",
  });
  let inbox: PortalMessage[] = [];
  const client = { getMessages: async () => inbox };
  const send = async () => {};
  expect(await checkInboxes(s, client, send)).toEqual([]);
  inbox = [message("1")];
  expect(await checkInboxes(s, client, send)).toHaveLength(1);
});
it("serves the stored inbox and refreshes it on request", async () => {
  const s = store();
  const p = s.save({
    name: "Company",
    username: "user",
    password: "secret",
    taxpayerId: "60003008009",
  });
  let calls = 0;
  const app = Fastify();
  try {
    await registerLocalProfiles(
      app,
      s,
      "http://localhost:8081",
      undefined,
      undefined,
      {
        async getMessages() {
          calls++;
          if (calls === 2) throw new RsRequestError("RS_PORTAL_UNAVAILABLE");
          return [message("7", "წერილი")];
        },
      },
    );
    const call = (method: "GET" | "POST") =>
      app.inject({
        method,
        url: `/api/v1/local/profiles/${p.uid}/inbox`,
        headers: { host: "localhost" },
        payload: method === "POST" ? {} : undefined,
      });
    expect((await call("GET")).json().data).toEqual({
      checkedAt: null,
      error: null,
      messages: [],
    });
    const fresh = (await call("POST")).json().data;
    expect(fresh.messages[0]).toMatchObject({ id: "7", text: "text 7" });
    const failed = (await call("POST")).json().data;
    expect(failed.error).toBe("RS_PORTAL_UNAVAILABLE");
    expect(failed.messages).toHaveLength(1);
    expect(JSON.stringify((await call("GET")).json())).not.toContain("secret");
    const markRead = (payload: object) =>
      app.inject({
        method: "POST",
        url: `/api/v1/local/profiles/${p.uid}/inbox/read`,
        headers: { host: "localhost" },
        payload,
      });
    expect((await call("GET")).json().data.messages[0].read).toBe(false);
    expect(
      (await markRead({ ids: ["999"] })).json().data.messages[0].read,
    ).toBe(false);
    expect((await markRead({ ids: ["7"] })).json().data.messages[0].read).toBe(
      true,
    );
    expect((await markRead({ ids: ["<x>"] })).statusCode).not.toBe(200);
    expect((await call("GET")).json().data.messages[0].read).toBe(true);
    expect(JSON.stringify(s.get(p.uid))).not.toContain("text 7");
  } finally {
    await app.close();
  }
});
it("registers only Expo push tokens", async () => {
  const s = store();
  const app = Fastify();
  try {
    await registerLocalProfiles(app, s, "http://localhost:8081");
    const post = (token: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/local/push-token",
        headers: { host: "localhost" },
        payload: { token },
      });
    expect((await post("ExponentPushToken[abc-123_X]")).statusCode).toBe(200);
    expect((await post("ExponentPushToken[abc-123_X]")).statusCode).toBe(200);
    expect((await post("https://evil.example")).statusCode).not.toBe(200);
    expect(s.pushTokens()).toEqual(["ExponentPushToken[abc-123_X]"]);
    s.removePushToken("ExponentPushToken[abc-123_X]");
    expect(s.pushTokens()).toEqual([]);
  } finally {
    await app.close();
  }
});
