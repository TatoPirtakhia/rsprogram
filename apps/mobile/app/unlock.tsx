import React, { useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { router } from "expo-router";
import { Screen, Card, Button, Txt } from "../components/ui";
import { useSession } from "../services/session";
import { clearSession } from "./(tabs)/settings";
export default function Unlock() {
  const [error, setError] = useState("");
  return (
    <Screen title="BizMonitor GE">
      <Card>
        <Txt bold>სესია დაბლოკილია / Session locked</Txt>
        <Button
          title="Unlock"
          onPress={() => {
            void LocalAuthentication.authenticateAsync({
              promptMessage: "Unlock BizMonitor",
            }).then((result) => {
              if (result.success) {
                useSession.getState().set({ locked: false });
                router.replace("/(tabs)");
              } else setError("Authentication failed");
            });
          }}
        />
        {!!error && <Txt>{error}</Txt>}
        <Button quiet title="Sign out" onPress={() => void clearSession()} />
      </Card>
    </Screen>
  );
}
