import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  gel,
  localDate,
  type Receipt,
  type Page,
  type CashRegister,
} from "@biz/shared";
import { useResource } from "../../hooks/useResource";
import {
  Screen,
  Card,
  Txt,
  Button,
  Input,
  Row,
  LinkRow,
  State,
} from "../../components/ui";
import { useT } from "../../localization";
import { SalesChart } from "../../components/chart";
import { DateField } from "../../components/date-field";
export default function Sales() {
  const t = useT();
  const [from, setFrom] = useState(localDate());
  const [to, setTo] = useState(localDate());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [register, setRegister] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [source, setSource] = useState<"demo" | "import">("demo");
  const params = new URLSearchParams({
    from,
    to,
    search,
    page: String(page),
    limit: "20",
    sort,
    source,
    ...(register ? { register } : {}),
  });
  const q = useResource<Page<Receipt>>(`/fiscal/receipts?${params}`);
  const summary = useResource<{
    netSales: string;
    average: string;
    refunds: string;
    receiptCount: number;
    voidCount: number;
    chart: { date: string; amount: string }[];
  }>(`/fiscal/summary?${params}`);
  const registers = useResource<CashRegister[]>("/fiscal/registers");
  const period = (days: number) => {
    setFrom(localDate(new Date(Date.now() - days * 86400000)));
    setTo(
      days === 1 ? localDate(new Date(Date.now() - 86400000)) : localDate(),
    );
    setPage(1);
  };
  return (
    <Screen
      title={t("sales")}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
    >
      <Card>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {[0, 1, 7, 30, 365].map((n) => (
            <Button
              quiet
              key={n}
              title={n === 0 ? t("today") : `${n}d`}
              onPress={() => period(n)}
            />
          ))}
        </View>
        <DateField
          label="From"
          value={from}
          onChange={(v) => {
            setFrom(v);
            setPage(1);
          }}
        />
        <DateField
          label="To"
          value={to}
          onChange={(v) => {
            setTo(v);
            setPage(1);
          }}
        />
        <Input
          placeholder={t("search")}
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <Button
          quiet
          title={`${t("source")}: ${source}`}
          onPress={() => {
            setSource(source === "demo" ? "import" : "demo");
            setPage(1);
          }}
        />
        <Button
          quiet
          title={sort === "desc" ? "Newest first ↓" : "Oldest first ↑"}
          onPress={() => setSort(sort === "desc" ? "asc" : "desc")}
        />
        <Row
          title={t("registers")}
          value={register ? "Filtered" : "All"}
          onPress={() => {
            const all = registers.data ?? [];
            setRegister(
              register
                ? (all[all.findIndex((r) => r.uid === register) + 1]?.uid ?? "")
                : (all[0]?.uid ?? ""),
            );
            setPage(1);
          }}
        />
      </Card>
      <State
        loading={summary.isPending}
        error={summary.isError}
        retry={() => void summary.refetch()}
      />
      {summary.data && (
        <Card>
          <Txt bold size={30}>
            {gel(summary.data.netSales)}
          </Txt>
          <Txt muted>
            {summary.data.receiptCount} receipts · Average{" "}
            {gel(summary.data.average)}
          </Txt>
          <Txt muted>
            Refunds {gel(summary.data.refunds)} · Voids {summary.data.voidCount}
          </Txt>
          <SalesChart data={summary.data.chart} />
        </Card>
      )}
      <State
        loading={q.isPending}
        error={q.isError}
        empty={q.data?.items.length === 0}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <Card>
          <Txt bold>
            {q.data.total} {t("receipts")}
          </Txt>
          {q.data.items.map((r) => (
            <Row
              key={r.uid}
              title={gel(r.amount)}
              subtitle={`${r.occurredAt.slice(0, 16)} · ${r.status} · ${r.source}`}
              value={r.externalId.slice(-8)}
              onPress={() =>
                router.push({
                  pathname: "/detail/receipt",
                  params: { uid: r.uid },
                })
              }
            />
          ))}
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Button
              quiet
              title={t("previous")}
              disabled={page === 1}
              onPress={() => setPage(page - 1)}
            />
            <Txt>{page}</Txt>
            <Button
              quiet
              title={t("next")}
              disabled={page * 20 >= q.data.total}
              onPress={() => setPage(page + 1)}
            />
          </View>
        </Card>
      )}
      <Card>
        <LinkRow title={t("registers")} path="/detail/registers" />
        <LinkRow title="CSV import" path="/detail/imports" />
      </Card>
    </Screen>
  );
}
