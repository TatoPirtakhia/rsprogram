import React, { useState, useEffect } from "react";
import { View, Pressable } from "react-native";
import { localDate } from "@biz/shared";
import { SelectField } from "../../components/select-field";
import { DateField } from "../../components/date-field";
import { Txt } from "../../components/ui";
import { useTheme } from "../../theme";
import {
  reportPeriods,
  shortPeriod,
  validPeriod,
  type PeriodRange,
} from "./periods";
export function PeriodFilter({
  value,
  onApply,
  busy,
}: {
  value: PeriodRange;
  onApply: (value: PeriodRange) => void;
  busy: boolean;
}) {
  const c = useTheme();
  const options = reportPeriods();
  const matched =
    options.find((p) => p.from === value.from && p.to === value.to)?.value ??
    "custom";
  const [selected, setSelected] = useState(matched);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setSelected(
      reportPeriods().find((p) => p.from === value.from && p.to === value.to)
        ?.value ?? "custom",
    );
    setDraft(value);
  }, [value.from, value.to]);
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Txt bold size={13}>
          ფისკალური თანხა
        </Txt>
        <View style={{ width: 138, flexShrink: 1 }}>
          <SelectField
            label="სწრაფი პერიოდი"
            value={selected}
            disabled={busy}
            options={[
              ...options.map(({ value, label }) => ({ value, label })),
              { value: "custom", label: "სხვა პერიოდი" },
            ]}
            onChange={(key) => {
              setSelected(key);
              const preset = options.find((p) => p.value === key);
              if (preset) onApply({ from: preset.from, to: preset.to });
            }}
          />
        </View>
      </View>
      {selected === "custom" ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ flex: 1 }}>
              <DateField
                compact
                label="საწყისი თარიღი"
                value={draft.from}
                disabled={busy}
                maximumDate={draft.to}
                onChange={(from) => setDraft({ ...draft, from })}
              />
            </View>
            <Txt muted size={12}>
              —
            </Txt>
            <View style={{ flex: 1 }}>
              <DateField
                compact
                label="საბოლოო თარიღი"
                value={draft.to}
                disabled={busy}
                minimumDate={draft.from}
                maximumDate={localDate()}
                onChange={(to) => setDraft({ ...draft, to })}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="პერიოდის ჩვენება"
              disabled={busy || !validPeriod(draft)}
              onPress={() => onApply(draft)}
              style={{
                minHeight: 44,
                minWidth: 44,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.accent,
                borderRadius: 10,
                opacity: busy || !validPeriod(draft) ? 0.4 : 1,
              }}
            >
              <Txt color={c.dark ? "#102A24" : "#FFFFFF"} bold size={18}>
                ✓
              </Txt>
            </Pressable>
          </View>
          {!validPeriod(draft) && (
            <Txt size={11} color={c.danger}>
              აირჩიეთ სწორი პერიოდი — მაქსიმუმ 366 დღე.
            </Txt>
          )}
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="კონკრეტული თარიღების არჩევა"
          onPress={() => setSelected("custom")}
          disabled={busy}
        >
          <Txt muted size={12}>
            {shortPeriod(value)} ▾
          </Txt>
        </Pressable>
      )}
    </View>
  );
}
