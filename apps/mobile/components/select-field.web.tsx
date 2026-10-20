import React from "react";
import { useTheme } from "../theme";
import type { SelectFieldProps } from "./select-field";
export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: SelectFieldProps) {
  const c = useTheme();
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      style={{
        fontFamily: "inherit",
        fontSize: 13,
        fontWeight: 600,
        color: c.text,
        backgroundColor: c.bg,
        border: `1px solid ${c.line}`,
        borderRadius: 10,
        padding: "10px 28px 10px 12px",
        minHeight: 42,
        width: "100%",
        cursor: disabled ? "default" : "pointer",
        colorScheme: c.dark ? "dark" : "light",
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
