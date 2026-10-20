import React from "react";
import { Platform, View, Pressable } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { localDate } from "@biz/shared";
import { Txt } from "./ui";
import { useTheme } from "../theme";
import type { DateFieldProps } from "./date-field.types";
export function DateField({
  value,
  onChange,
  label,
  compact,
  disabled,
  minimumDate,
  maximumDate,
}: DateFieldProps) {
  const c = useTheme();
  const date = value ? new Date(value + "T12:00:00+04:00") : new Date();
  const minimum = minimumDate
    ? new Date(minimumDate + "T00:00:00+04:00")
    : undefined;
  const maximum = maximumDate
    ? new Date(maximumDate + "T23:59:59+04:00")
    : undefined;
  if (Platform.OS === "android")
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        style={{
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 10,
          minHeight: 44,
          backgroundColor: c.bg,
          opacity: disabled ? 0.5 : 1,
        }}
        onPress={() =>
          DateTimePickerAndroid.open({
            value: date,
            mode: "date",
            timeZoneName: "Asia/Tbilisi",
            minimumDate: minimum,
            maximumDate: maximum,
            onChange: (event, selected) => {
              if (event.type === "set" && selected)
                onChange(localDate(selected));
            },
          })
        }
      >
        <Txt size={13}>
          {compact
            ? value.split("-").reverse().join(".")
            : `${label} · ${value}`}
        </Txt>
      </Pressable>
    );
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      {!compact && <Txt>{label}</Txt>}
      <DateTimePicker
        accessibilityLabel={label}
        disabled={disabled}
        minimumDate={minimum}
        maximumDate={maximum}
        value={date}
        mode="date"
        display="compact"
        timeZoneName="Asia/Tbilisi"
        onChange={(_event, selected) => {
          if (selected) onChange(localDate(selected));
        }}
      />
    </View>
  );
}
