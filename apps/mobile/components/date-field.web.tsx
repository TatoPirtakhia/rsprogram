import React from "react";
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
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        minWidth: 0,
        flex: 1,
        fontSize: 11,
        color: c.muted,
      }}
    >
      {!compact && label}
      <input
        aria-label={label}
        type="date"
        value={value}
        disabled={disabled}
        min={minimumDate}
        max={maximumDate}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        style={{
          boxSizing: "border-box",
          width: "100%",
          minWidth: 0,
          minHeight: 42,
          border: `1px solid ${c.line}`,
          borderRadius: 10,
          padding: "8px 9px",
          fontFamily: "inherit",
          fontSize: 13,
          color: c.text,
          backgroundColor: c.bg,
          colorScheme: c.dark ? "dark" : "light",
        }}
      />
    </label>
  );
}
