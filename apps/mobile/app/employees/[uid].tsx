import React, { useRef, useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { RsEmployeesResult } from "@biz/shared";
import { BackLink, Button, Card, Screen, Txt } from "../../components/ui";
import { SelectField } from "../../components/select-field";
import { useTheme } from "../../theme";
import { post } from "../../services/api";

const statuses = { "1": "აქტიური", "0": "შეწყვეტილი", "-1": "შეჩერებული" };
const errors: Record<string, string> = {
  RS_TAXPAYER_ID_REQUIRED:
    "პროფილის პარამეტრებში შეავსეთ დამქირავებლის საიდენტიფიკაციო ნომერი.",
  RS_ACCESS_DENIED:
    "RS-მა წვდომა უარყო. გადაამოწმეთ ანგარიშის მონაცემები და დაქირავებულ პირთა რეესტრის წაკითხვის უფლება.",
  RS_EMPLOYEES_PIN_EXPIRED:
    "SMS სესია დასრულდა ან სერვერი გადაიტვირთა. თავიდან მიიღეთ სია.",
  RS_EMPLOYEES_REJECTED:
    "RS-მა მოთხოვნა უარყო. გადაამოწმეთ ავტორიზაცია, SMS კოდი და რეესტრის წაკითხვის უფლება. საჭიროებისას თავიდან მიიღეთ სია.",
  RS_PORTAL_ID_MISMATCH:
    "დამქირავებლის ნომერი პროფილს არ ემთხვევა. სია არ ჩაიტვირთა.",
  RS_INVALID_RESPONSE: "RS-ის პასუხის ფორმატი ვერ ამოვიცანით.",
  SERVER_CONNECTION_CHANGED:
    "სერვერის კავშირი შეიცვალა. თავიდან გახსენით განყოფილება.",
};
export default function EmployeesPage() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  return <Employees key={uid} uid={uid} />;
}
function Employees({ uid }: { uid: string }) {
  const c = useTheme();
  const [data, setData] = useState<RsEmployeesResult | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [pin, setPin] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  async function load(verify = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const body =
        verify && data?.state === "pin_required"
          ? { challengeId: data.challengeId, pin }
          : {};
      const result = await post<RsEmployeesResult>(
        `/local/profiles/${uid}/employees`,
        body,
      );
      setData(result);
      setPage(0);
      setPin("");
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        errors[code] ??
          "სიის მიღება ვერ მოხერხდა. შეამოწმეთ კავშირი და სცადეთ თავიდან.",
      );
      // A verification challenge is single use, including rejected PIN attempts.
      if (verify) setData(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const ready = data?.state === "ready" ? data : null;
  const needle = search.trim().toLocaleLowerCase();
  const rows =
    ready?.employees.filter(
      (row) =>
        (status === "all" || String(row.status) === status) &&
        (!needle ||
          row.name.toLocaleLowerCase().includes(needle) ||
          row.tin.includes(needle)),
    ) ?? [];
  const inputStyle = {
    color: c.text,
    backgroundColor: c.fill,
    borderRadius: 10,
    padding: 12,
  };
  return (
    <Screen
      title="დაქირავებული პირები"
      demo={false}
      showContext={false}
      header={
        <BackLink
          title="პროფილი"
          label="‹ პროფილზე დაბრუნება"
          onPress={() => router.back()}
        />
      }
    >
      <Card>
        <Txt bold>დაქირავებულ პირთა რეესტრი</Txt>
        <Txt muted>RS-ში რეგისტრირებული თანამშრომლები და მათი სტატუსები.</Txt>
        <Button
          title={
            busy
              ? "იტვირთება…"
              : ready
                ? "RS-დან განახლება"
                : "RS-დან სიის მიღება"
          }
          disabled={busy}
          onPress={() => void load()}
        />
        {busy && <ActivityIndicator color={c.accent} />}
        {!!error && <Txt>{error}</Txt>}
        {!ready && !data && !busy && <Txt muted>სია ჯერ არ ჩატვირთულა.</Txt>}
      </Card>
      {data?.state === "pin_required" && (
        <Card>
          <Txt bold>RS-ის SMS დადასტურება</Txt>
          <Txt muted>
            შეიყვანეთ ნომერზე {data.mobile} მიღებული ოთხნიშნა კოდი.
          </Txt>
          <TextInput
            accessibilityLabel="RS SMS კოდი"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            style={inputStyle}
          />
          <Button
            title="დადასტურება"
            disabled={busy || !/^\d{4}$/.test(pin)}
            onPress={() => void load(true)}
          />
        </Card>
      )}
      <Card>
        <Txt bold>ხელფასები</Txt>
        <Txt muted>
          ხელფასის თანხა რეესტრის API-ში არ არის ხელმისაწვდომი. მის საჩვენებლად
          საჭიროა სახელფასო დეკლარაციების ცალკე წყაროს დაკავშირება.
        </Txt>
      </Card>
      {ready && (
        <>
          <Card>
            <Txt bold>
              სულ: {ready.total} · აქტიური:{" "}
              {ready.employees.filter((e) => e.status === 1).length}
            </Txt>
            <Txt muted>
              განახლდა:{" "}
              {new Date(ready.checkedAt).toLocaleString("ka-GE", {
                timeZone: "Asia/Tbilisi",
              })}
            </Txt>
            {ready.truncated && (
              <Txt>
                ნაჩვენებია მხოლოდ {ready.employees.length} ჩანაწერი{" "}
                {ready.total}-დან. აქტიურების რაოდენობა ეხება მხოლოდ ჩატვირთულ
                სიას.
              </Txt>
            )}
            <TextInput
              accessibilityLabel="თანამშრომლის ძებნა"
              placeholder="სახელი ან პირადი ნომერი"
              placeholderTextColor={c.muted}
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setPage(0);
              }}
              style={inputStyle}
            />
            <SelectField
              label="სტატუსი"
              value={status}
              onChange={(value) => {
                setStatus(value);
                setPage(0);
              }}
              options={[
                { label: "ყველა", value: "all" },
                ...Object.entries(statuses).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
            <Txt muted>მოიძებნა: {rows.length}</Txt>
            {rows.length > 50 && (
              <View style={{ gap: 8 }}>
                <Txt muted>
                  გვერდი {page + 1} / {Math.ceil(rows.length / 50)}
                </Txt>
                <Button
                  title="წინა გვერდი"
                  quiet
                  disabled={page === 0}
                  onPress={() => setPage((value) => value - 1)}
                />
                <Button
                  title="შემდეგი გვერდი"
                  quiet
                  disabled={(page + 1) * 50 >= rows.length}
                  onPress={() => setPage((value) => value + 1)}
                />
              </View>
            )}
          </Card>
          {!rows.length && (
            <Card>
              <Txt muted>
                {ready.employees.length
                  ? "ფილტრის შესაბამისი პირი ვერ მოიძებნა."
                  : "RS-მა დაქირავებულთა ცარიელი სია დააბრუნა."}
              </Txt>
            </Card>
          )}
          {rows.slice(page * 50, (page + 1) * 50).map((row) => (
            <Card key={row.id}>
              <Txt bold>{row.name || "სახელი მიუწვდომელია"}</Txt>
              <Txt muted>პირადი ნომერი: {row.tin}</Txt>
              <View style={{ gap: 4 }}>
                <Txt>
                  {statuses[String(row.status) as keyof typeof statuses]}
                </Txt>
                {!!row.workType && (
                  <Txt muted>სამუშაოს ტიპი: {row.workType}</Txt>
                )}
                {!!row.activatedAt && (
                  <Txt muted>გააქტიურება: {row.activatedAt}</Txt>
                )}
                <Txt muted>ხელფასი: მიუწვდომელია</Txt>
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
