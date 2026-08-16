"use client";

import Link from "next/link";
import type { Entry } from "@/lib/types";
import { deleteEntry, updateEntry } from "@/lib/local/actions";
import { useLedgerLists } from "@/lib/local/lists";
import { useRecord } from "@/lib/local/store";
import { useRouteId } from "@/lib/local/route";
import { Form } from "@/components/form";
import { btn, PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/EntryForm";
import { Title } from "@/components/Title";

export default function EditEntryPage() {
  const id = useRouteId();
  const entry = useRecord<Entry>("entries", id);
  const lists = useLedgerLists();

  if (!entry || entry.deleted) {
    return (
      <>
        <Title>Movimiento</Title>
        <PageHeader title="No está" subtitle="Este movimiento no existe en esta cuenta." />
        <Link href="/finanzas" className={btn("subtle")}>
          Volver a Finanzas
        </Link>
      </>
    );
  }

  return (
    <>
      <Title>Movimiento</Title>
      <PageHeader title="Editar movimiento" subtitle={entry.description} />
      <EntryForm action={updateEntry} entry={entry} {...lists} />

      <Form
        action={deleteEntry}
        confirm={`¿Eliminar "${entry.description}"?`}
        className="mt-10 border-t border-line pt-5"
      >
        <input type="hidden" name="id" value={entry.id} />
        <button type="submit" className={btn("danger", "sm")}>
          Eliminar movimiento
        </button>
      </Form>
    </>
  );
}
