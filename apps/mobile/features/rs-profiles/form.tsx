import React, { useEffect, useState } from "react";
import { post } from "../../services/api";
import { Pressable, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "../../theme";
import { Input, Button, Txt } from "../../components/ui";
export function RsProfileForm({
  initial,
  onSave,
  button = "შენახვა",
}: {
  initial?: {
    uid?: string;
    name: string;
    username: string;
    taxpayerId?: string;
  };
  onSave: (value: {
    name: string;
    username: string;
    password: string;
    taxpayerId?: string;
  }) => Promise<void>;
  button?: string;
}) {
  const c = useTheme();
  const [name, setName] = useState(initial?.name ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [taxpayerId, setTaxpayerId] = useState(initial?.taxpayerId ?? "");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!initial?.uid) return;
    let active = true;
    void post<{ password: string }>(`/local/profiles/${initial.uid}/password`)
      .then((value) => {
        if (active) setPassword((current) => current || value.password);
      })
      .catch(() => {
        if (active)
          setError(
            "შენახული პაროლი ვერ ჩაიტვირთა. სცადეთ რედაქტირების ხელახლა გახსნა.",
          );
      });
    return () => {
      active = false;
    };
  }, [initial?.uid]);
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
      <Txt>საიდენტიფიკაციო / პირადი ნომერი (დავალიანებისთვის)</Txt>
      <Input
        accessibilityLabel="Taxpayer ID"
        value={taxpayerId}
        onChangeText={setTaxpayerId}
        placeholder="9 ან 11 ციფრი"
        keyboardType="numeric"
        maxLength={11}
      />
      <Txt>RS პაროლი</Txt>
      <View style={{ position: "relative" }}>
        <Input
          accessibilityLabel="RS password"
          placeholder="პაროლი"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!passwordVisible}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect={false}
          style={{ paddingRight: 56 }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            passwordVisible ? "პაროლის დამალვა" : "პაროლის ჩვენება"
          }
          accessibilityState={{ selected: passwordVisible }}
          onPress={() => setPasswordVisible((value) => !value)}
          style={{
            position: "absolute",
            right: 4,
            top: 0,
            bottom: 0,
            width: 48,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke={c.muted}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <Circle cx={12} cy={12} r={3} />
            {passwordVisible && <Path d="M3 3l18 18" />}
          </Svg>
        </Pressable>
      </View>
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
            taxpayerId: taxpayerId.trim(),
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
