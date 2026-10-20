import { useColorScheme } from "react-native";
import { useLocale } from "../localization";
export function useTheme() {
  const system = useColorScheme();
  const choice = useLocale((s) => s.theme);
  const dark = (choice === "system" ? system : choice) === "dark";
  return {
    dark,
    bg: dark ? "#0E1519" : "#F3F5F6",
    card: dark ? "#192329" : "#FFFFFF",
    text: dark ? "#F2F6F5" : "#142C2B",
    muted: dark ? "#A2B2B7" : "#687B80",
    line: dark ? "#2A3A40" : "#E1E9E8",
    accent: dark ? "#6ED8B4" : "#087F68",
    soft: dark ? "#193D34" : "#E3F4ED",
    warning: dark ? "#F2BD72" : "#9F601B",
    danger: dark ? "#F19999" : "#BB4040",
  };
}
