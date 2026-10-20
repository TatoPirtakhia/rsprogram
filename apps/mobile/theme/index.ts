import { useColorScheme } from "react-native";
import { useLocale } from "../localization";
// iOS (Cupertino) system palette: grouped backgrounds, label colors and
// system tints, with the brand green kept as the tint color.
export function useTheme() {
  const system = useColorScheme();
  const choice = useLocale((s) => s.theme);
  const dark = (choice === "system" ? system : choice) === "dark";
  return {
    dark,
    bg: dark ? "#000000" : "#F2F2F7",
    card: dark ? "#1C1C1E" : "#FFFFFF",
    fill: dark ? "#2C2C2E" : "#EFEFF4",
    text: dark ? "#FFFFFF" : "#000000",
    muted: dark ? "#98989F" : "#6C6C70",
    line: dark ? "#38383A" : "#C6C6C8",
    accent: dark ? "#30D158" : "#0A8F6A",
    soft: dark ? "#16351F" : "#E3F4ED",
    warning: dark ? "#FF9F0A" : "#C26A00",
    danger: dark ? "#FF453A" : "#FF3B30",
  };
}
