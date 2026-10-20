import React from "react";
import { Input } from "./ui";
import type { DateFieldProps } from "./date-field.types";
export function DateField({ value, onChange, label }: DateFieldProps) {
  return (
    <Input
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      placeholder={`${label} · YYYY-MM-DD`}
    />
  );
}
