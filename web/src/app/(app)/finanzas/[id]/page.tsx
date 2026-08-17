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

      {/* Un movimiento fabricado por una regla se puede corregir como cualquier
          otro —ese es el punto de materializarlos— pero conviene saber que hay
          once más detrás y dónde se cambian todos de una vez. */}
      {entry.series && (
        <Link
          href={`/recurrentes/${entry.series}`}
          className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-row px-4 py-3.5 text-[15px] transition-colors active:bg-pill"
        >
          <span className="min-w-0">
            <span className="block font-semibold">Viene de una recurrencia</span>
            <span className="mt-0.5 block text-[13px] text-faint">
              Editarlo acá cambia solo esta vez
            </span>
          </span>
          <span className="shrink-0 text-[17px] leading-none text-faint" aria-hidden>
            ›
          </span>
        </Link>
      )}

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
