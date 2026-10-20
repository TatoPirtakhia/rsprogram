import React from "react";
import { Host, Picker } from "@expo/ui";
import { useTheme } from "../theme";
export interface SelectFieldProps {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}
export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: SelectFieldProps) {
  const c = useTheme();
  return (
    <Host matchContents colorScheme={c.dark ? "dark" : "light"}>
      <Picker
        selectedValue={value}
        onValueChange={onChange}
        appearance="menu"
        enabled={!disabled}
        testID={label}
      >
        {options.map((option) => (
          <Picker.Item
            key={option.value}
            value={option.value}
            label={option.label}
          />
        ))}
      </Picker>
    </Host>
  );
}
