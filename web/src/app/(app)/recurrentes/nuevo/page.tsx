"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createSeries } from "@/lib/local/actions";
import { useLedgerLists } from "@/lib/local/lists";
import { PageHeader } from "@/components/ui";
import { SeriesForm } from "@/components/SeriesForm";
import { Title } from "@/components/Title";

export default function NewSeriesRoute() {
  return (
    <Suspense fallback={null}>
      <NewSeriesPage />
    </Suspense>
  );
}

function NewSeriesPage() {
  const sp = useSearchParams();
  const lists = useLedgerLists();

  return (
    <>
      <Title>Nueva recurrencia</Title>
      <PageHeader
        title="Nueva recurrencia"
        subtitle="Se escribe una vez y queda anotada todos los meses."
      />
      <SeriesForm action={createSeries} {...lists} returnTo={sp.get("return_to") || undefined} />
    </>
  );
}
