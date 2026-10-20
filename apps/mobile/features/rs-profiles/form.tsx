import React, { useState } from "react";
import { Input, Button, Txt } from "../../components/ui";
export function RsProfileForm({
  initial,
  onSave,
  button = "შენახვა",
}: {
  initial?: { name: string; username: string };
  onSave: (value: {
    name: string;
    username: string;
    password: string;
  }) => Promise<void>;
  button?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <Txt>პროფილის სახელი</Txt>
      <Input
        accessibilityLabel="Profile name"
        placeholder="მაგ. ჩემი კომპანია"
        value={name}
        onChangeText={setName}
      />
      <Txt>RS მომხმარებლის სახელი</Txt>
      <Input
        accessibilityLabel="RS username"
        placeholder="მომხმარებლის სახელი"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
      />
      <Txt>RS პაროლი</Txt>
      <Input
        accessibilityLabel="RS password"
        placeholder="პაროლი"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!passwordVisible}
        autoComplete="off"
      />
      <Button
        quiet
        title={passwordVisible ? "პაროლის დამალვა" : "პაროლის ჩვენება"}
        onPress={() => setPasswordVisible(!passwordVisible)}
      />
      {!!error && <Txt>{error}</Txt>}
      <Button
        title={busy ? "ინახება…" : button}
        disabled={busy || !name.trim() || !username.trim() || !password}
        onPress={() => {
          setBusy(true);
          setError("");
          void onSave({
            name: name.trim(),
            username: username.trim(),
            password,
          })
            .then(() => setPassword(""))
            .catch((e) =>
              setError(
                e.message === "REQUEST_ERROR"
                  ? "ამ სახელით პროფილი უკვე დამატებულია."
                  : e.message,
              ),
            )
            .finally(() => setBusy(false));
        }}
      />
    </>
  );
}
