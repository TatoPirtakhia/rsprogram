import React from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import type { Business } from "@biz/shared";
import { api } from "../services/api";
import { Screen, Card, Row, State } from "../components/ui";
export default function Businesses() {
  const q = useQuery({
    queryKey: ["businesses"],
    queryFn: () => api<Business[]>("/businesses"),
  });
  return (
    <Screen title="აირჩიეთ ბიზნესი">
      <State
        loading={q.isPending}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <Card>
          {q.data.map((b) => (
            <Row
              key={b.uid}
              title={b.name}
              subtitle={`${b.owner} · ${b.taxId}`}
              onPress={() => router.replace("/(tabs)")}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
