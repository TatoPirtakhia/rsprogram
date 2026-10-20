import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
export function useResource<T>(path: string) {
  return useQuery({
    queryKey: ["resource", path],
    queryFn: () => api<T>(path),
  });
}
