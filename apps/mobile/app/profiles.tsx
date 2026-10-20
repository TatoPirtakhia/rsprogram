import React, { useState } from "react";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Screen, Card, Txt, Button, Row, State } from "../components/ui";
import { RsProfileForm } from "../features/rs-profiles/form";
import type { RsProfile } from "../features/rs-profiles/types";
import { useResource } from "../hooks/useResource";
import { post } from "../services/api";
export default function Profiles() {
  const q = useResource<RsProfile[]>("/local/profiles");
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  return (
    <Screen
      title="RS მომხმარებლები"
      demo={false}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
    >
      <Txt muted>
        აირჩიეთ შენახული RS პროფილი ან დაამატეთ ახალი. აპში ცალკე ავტორიზაცია
        საჭირო არ არის.
      </Txt>
      <State
        loading={q.isPending}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {q.data?.length === 0 && (
        <Card>
          <Txt>RS მომხმარებელი ჯერ არ არის დამატებული.</Txt>
          <Txt muted>
            შეინახეთ მომხმარებლის სახელი და პაროლი ლოკალურ ბაზაში. მონაცემების
            მისაღებად შემდეგ აირჩიეთ პროფილი.
          </Txt>
        </Card>
      )}
      {!!q.data?.length && (
        <Card>
          {q.data.map((p) => (
            <Row
              key={p.uid}
              title={p.name}
              subtitle={`${p.username} · ${p.connectionState === "received" ? "პასუხი მიღებულია" : p.connectionState === "error" ? "კავშირი შესამოწმებელია" : "ჯერ არ შემოწმებულა"}`}
              onPress={() =>
                router.push({
                  pathname: "/rs-profile/[uid]",
                  params: { uid: p.uid },
                })
              }
            />
          ))}
        </Card>
      )}
      <Button
        title={adding ? "დახურვა" : "+ RS მომხმარებლის დამატება"}
        quiet={adding}
        onPress={() => setAdding(!adding)}
      />
      {adding && (
        <Card>
          <Txt bold>ახალი RS პროფილი</Txt>
          <RsProfileForm
            onSave={async (value) => {
              const profile = await post<RsProfile>("/local/profiles", value);
              client.removeQueries({
                queryKey: ["resource", `/local/profiles/${profile.uid}`],
              });
              await q.refetch();
              setAdding(false);
              router.push({
                pathname: "/rs-profile/[uid]",
                params: { uid: profile.uid },
              });
            }}
          />
          <Txt muted size={12}>
            პაროლი დაშიფრულად ინახება ამ კომპიუტერზე. მისი მიღება მხოლოდ სერვერს
            შეუძლია.
          </Txt>
        </Card>
      )}
    </Screen>
  );
}
