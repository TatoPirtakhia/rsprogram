import React from "react";
import { Host, Switch } from "@expo/ui";
import { useTheme } from "../theme";
export function NativeSwitch({
  value,
  onValueChange,
  label,
  disabled,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const c = useTheme();
  return (
    <Host matchContents colorScheme={c.dark ? "dark" : "light"}>
      <Switch
        label={label}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      />
    </Host>
  );
}
