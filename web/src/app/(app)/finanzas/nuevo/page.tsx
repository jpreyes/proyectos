"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createEntry } from "@/lib/local/actions";
import { useLedgerLists } from "@/lib/local/lists";
import { PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/EntryForm";
import { Title } from "@/components/Title";

export default function NewEntryRoute() {
  return (
    <Suspense fallback={null}>
      <NewEntryPage />
    </Suspense>
  );
}

function NewEntryPage() {
  const sp = useSearchParams();
  const lists = useLedgerLists();

  return (
    <>
      <Title>Nuevo movimiento</Title>
      <PageHeader title="Nuevo movimiento" />
      <EntryForm
        action={createEntry}
        {...lists}
        defaultProject={sp.get("project") || undefined}
        returnTo={sp.get("return_to") || undefined}
      />
    </>
  );
}
