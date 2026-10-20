import React from "react";
import {
  gel,
  type TaxDebt,
  type TaxObligation,
  type Declaration,
} from "@biz/shared";
import { useResource } from "../../hooks/useResource";
import { Screen, Card, Txt, Row, LinkRow, State } from "../../components/ui";
import { useT } from "../../localization";
export default function Taxes() {
  const t = useT();
  const debt = useResource<TaxDebt[]>("/taxes/debts");
  const obligations = useResource<TaxObligation[]>("/taxes/obligations");
  const declarations = useResource<Declaration[]>("/taxes/declarations");
  return (
    <Screen
      title={t("taxes")}
      refreshing={debt.isRefetching}
      onRefresh={() => {
        void debt.refetch();
        void obligations.refetch();
        void declarations.refetch();
      }}
    >
      <State
        loading={debt.isPending}
        error={debt.isError}
        empty={debt.data?.length === 0}
        retry={() => void debt.refetch()}
      />
      {debt.data && (
        <Card>
          <Txt bold>{t("debt")}</Txt>
          {debt.data.map((d) => (
            <Row
              key={d.uid}
              title={d.taxType}
              subtitle={`${d.source} · ${d.confirmed ? "Confirmed" : "SIMULATED / unverified"} · Credit ${gel(d.credit)} · ${d.syncedAt}`}
              value={gel(d.amount)}
            />
          ))}
          <Txt muted>
            Demo tax profile: small business. Calendar deadlines are separate
            from assessed debt.
          </Txt>
        </Card>
      )}
      <Card>
        <Txt bold>{t("obligations")}</Txt>
        <State
          loading={obligations.isPending}
          error={obligations.isError}
          retry={() => void obligations.refetch()}
        />
        {obligations.data?.map((o) => (
          <Row
            key={o.uid}
            title={`${o.kind} · ${o.dueDate}`}
            subtitle={`${o.period} · ${o.status} · ${o.estimated ? t("estimated") : "Demo filing deadline"}`}
            value={gel(o.amount)}
          />
        ))}
        <LinkRow title={t("calendar")} path="/detail/calendar" />
      </Card>
      <Card>
        <Txt bold>{t("declarations")}</Txt>
        <State
          loading={declarations.isPending}
          error={declarations.isError}
          retry={() => void declarations.refetch()}
        />
        {declarations.data?.map((d) => (
          <Row
            key={d.uid}
            title={`${d.taxType} · ${d.period}`}
            subtitle={`${d.status} · due ${d.dueDate} · ${d.submittedAt ?? "Not submitted"}`}
            value={gel(d.amount)}
          />
        ))}
      </Card>
    </Screen>
  );
}
