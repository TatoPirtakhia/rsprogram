import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Preferences } from "@biz/shared";
import { api } from "../services/api";
import { useSession } from "../services/session";
import { useLocale } from "../localization";
export function usePreferences() {
  const authenticated = useSession((s) => s.authenticated);
  const q = useQuery({
    queryKey: ["resource", "/settings"],
    queryFn: () => api<Preferences>("/settings"),
    enabled: authenticated,
  });
  useEffect(() => {
    if (q.data)
      useLocale.setState({ language: q.data.language, theme: q.data.theme });
  }, [q.data]);
}
