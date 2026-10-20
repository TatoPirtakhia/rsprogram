import React, { useState } from "react";
import { View } from "react-native";
import {
  gel,
  type BankAccount,
  type BankTransaction,
  type Page,
} from "@biz/shared";
import { useResource } from "../../hooks/useResource";
import {
  Screen,
  Card,
  Txt,
  Input,
  Row,
  LinkRow,
  State,
  Button,
} from "../../components/ui";
import { useT } from "../../localization";
import { DateField } from "../../components/date-field";
export default function Banking() {
  const t = useT();
  const accounts = useResource<BankAccount[]>("/banking/accounts");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("demo");
  const params = new URLSearchParams({
    search,
    page: String(page),
    source,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });
  const q = useResource<Page<BankTransaction>>(
    `/banking/transactions?${params}`,
  );
  return (
    <Screen
      title={t("banking")}
      refreshing={q.isRefetching}
      onRefresh={() => {
        void accounts.refetch();
        void q.refetch();
      }}
    >
      <Txt muted>
        Bank movements and fiscal turnover are separate. Incoming transfers may
        include owner deposits or loans.
      </Txt>
      <State
        loading={accounts.isPending}
        error={accounts.isError}
        retry={() => void accounts.refetch()}
      />
      {accounts.data && (
        <Card>
          <Txt bold>{t("accounts")}</Txt>
          {accounts.data.map((a) => (
            <Row
              key={a.uid}
              title={a.bank}
              subtitle={`${a.iban} · ${a.source} · ${a.syncedAt}`}
              value={gel(a.balance)}
            />
          ))}
        </Card>
      )}
      <Card>
        <Input
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder={t("search")}
        />
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
        <Button
          quiet
          title={`${t("source")}: ${source}`}
          onPress={() => {
            setSource(source === "demo" ? "import" : "demo");
            setPage(1);
          }}
        />
        <LinkRow title={t("reconcile")} path="/detail/reconciliation" />
        <LinkRow title="Merchant settlements" path="/detail/settlements" />
      </Card>
      <State
        loading={q.isPending}
        error={q.isError}
        empty={q.data?.items.length === 0}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <Card>
          <Txt bold>
            {t("transactions")} · {q.data.total}
          </Txt>
          {q.data.items.map((tx) => (
            <Row
              key={tx.uid}
              title={tx.description}
              subtitle={`${tx.occurredAt.slice(0, 10)} · ${tx.category} · ${tx.source}`}
              value={`${tx.direction === "outgoing" ? "−" : "+"}${gel(tx.amount)}`}
              onPress={() =>
                alert(
                  `${tx.externalId}\n${tx.occurredAt}\n${tx.category}\nSource: ${tx.source}\nUpdated: ${tx.syncedAt}`,
                )
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
            <Button
              quiet
              title={t("next")}
              disabled={page * 25 >= q.data.total}
              onPress={() => setPage(page + 1)}
            />
          </View>
        </Card>
      )}
    </Screen>
  );
}
