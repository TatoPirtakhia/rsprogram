import React, { useEffect, useState } from "react";
import { Button, Card, Txt } from "../../components/ui";
import type { RsProfile } from "./types";
import {
  getServerConfig,
  connectionGeneration,
} from "../../services/server-connection";
import { requestServer } from "../../services/api.native";
export function PhoneProfilesTransfer({
  serverProfiles,
  onImported,
}: {
  serverProfiles: RsProfile[] | undefined;
  onImported: () => Promise<unknown>;
}) {
  const [phone, setPhone] = useState<RsProfile[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void import("../../services/device/store")
      .then((m) => m.deviceStore.list())
      .then((p) => {
        if (active) setPhone(p);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const pending = phone.filter(
    (p) => !serverProfiles?.some((s) => s.username === p.username),
  );
  if (!serverProfiles || !pending.length) return null;
  return (
    <Card>
      <Txt>
        ტელეფონში შენახულია {pending.length} პროფილი, რომელიც ამ სერვერზე ჯერ არ
        არის.
      </Txt>
      <Txt muted size={13}>
        გადატანისას მათი RS მომხმარებლები და პაროლები შეინახება არჩეული სერვერის
        დაშიფრულ ბაზაში.
      </Txt>
      {!!error && <Txt>{error}</Txt>}
      <Button
        title={busy ? "პროფილები გადადის…" : "პროფილების გადატანა სერვერზე"}
        disabled={busy}
        onPress={() =>
          void (async () => {
            setBusy(true);
            setError("");
            try {
              const generation = connectionGeneration(),
                config = await getServerConfig();
              const { deviceStore } =
                await import("../../services/device/store");
              for (const p of pending) {
                const stored = await deviceStore.read(p.uid);
                if (generation !== connectionGeneration())
                  throw new Error("SERVER_CONNECTION_CHANGED");
                await requestServer(config, "/local/profiles", {
                  method: "POST",
                  body: JSON.stringify({
                    name: stored.name,
                    username: stored.username,
                    password: stored.password,
                    taxpayerId: stored.taxpayerId,
                  }),
                });
                if (generation !== connectionGeneration())
                  throw new Error("SERVER_CONNECTION_CHANGED");
              }
            } catch {
              setError(
                "ყველა პროფილის გადატანა ვერ დასრულდა. განაახლეთ სია და სცადეთ დარჩენილი პროფილების გადატანა.",
              );
            } finally {
              await onImported().catch(() => {});
              setBusy(false);
            }
          })()
        }
      />
    </Card>
  );
}
