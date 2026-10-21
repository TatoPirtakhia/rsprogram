import React, { useEffect, useState } from "react";
import { Button, Input, Txt } from "../../components/ui";
import { Sheet } from "../../components/settings-drawer";
import {
  getServerConfig,
  saveServerConfig,
} from "../../services/server-connection";
import { validateServerConfig } from "../../services/server-config";
import { requestServer } from "../../services/api.native";
const errors: Record<string, string> = {
  SERVER_URL_INVALID: "შეიყვანეთ სერვერის სწორი მისამართი.",
  SERVER_HTTPS_REQUIRED: "საჯარო სერვერის მისამართი HTTPS-ით უნდა იწყებოდეს.",
  SERVER_TOKEN_INVALID: "კავშირის გასაღები მინიმუმ 32 სიმბოლო უნდა იყოს.",
  LOCAL_ACCESS_ONLY: "კავშირის გასაღები ან სერვერის დაშვება არ ემთხვევა.",
  HTTP_403: "კავშირის გასაღები ან სერვერის დაშვება არ ემთხვევა.",
};
export function ServerSettings({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [url, setUrl] = useState(""),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open)
      void getServerConfig()
        .then((c) => {
          setUrl(c.url);
          setToken(c.token);
          setError("");
        })
        .catch(() =>
          setError("შეავსეთ სერვერის მისამართი და კავშირის გასაღები."),
        );
  }, [open]);
  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="სერვერის პარამეტრები"
    >
      <Txt>სერვერის მისამართი</Txt>
      <Input
        accessibilityLabel="Server URL"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://api.example.ge"
      />
      <Txt>კავშირის გასაღები</Txt>
      <Input
        accessibilityLabel="Server connection key"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Txt muted size={13}>
        ახლა მიუთითეთ Mac-ის სერვერი. ჰოსტინგზე გადატანის შემდეგ აქ ჩაწერთ ახალ
        HTTPS მისამართსა და გასაღებს.
      </Txt>
      {!!error && <Txt>{error}</Txt>}
      <Button
        title={busy ? "კავშირი მოწმდება…" : "შემოწმება და შენახვა"}
        disabled={busy}
        onPress={() =>
          void (async () => {
            setBusy(true);
            setError("");
            try {
              const value = validateServerConfig({ url, token });
              await requestServer(value, "/local/profiles");
              await saveServerConfig(value);
              await onSaved();
              onClose();
            } catch (e) {
              setError(
                errors[(e as Error).message] ??
                  "სერვერთან დაკავშირება ვერ მოხერხდა. გადაამოწმეთ მისამართი, გასაღები და სერვერის მუშაობა.",
              );
            } finally {
              setBusy(false);
            }
          })()
        }
      />
    </Sheet>
  );
}
