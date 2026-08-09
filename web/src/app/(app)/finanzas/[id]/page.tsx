import { notFound } from "next/navigation";
import type { Account, Category, Entity, Entry, Project } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { deleteEntry, updateEntry } from "@/lib/actions";
import { btn, PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/EntryForm";

export const metadata = { title: "Movimiento · Proyectos" };

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pb = await requirePB();

  let entry: Entry;
  try {
    entry = await pb.collection("entries").getOne<Entry>(id);
  } catch {
    notFound();
  }

  const [projects, entities, accounts, categories] = await Promise.all([
    pb.collection("projects").getFullList<Project>({ filter: "deleted != true", sort: "name" }),
    pb.collection("entities").getFullList<Entity>({ filter: "deleted != true", sort: "name" }),
    pb.collection("accounts").getFullList<Account>({ sort: "name" }),
    pb.collection("categories").getFullList<Category>({ sort: "direction,name" }),
  ]);

  return (
    <>
      <PageHeader title="Editar movimiento" subtitle={entry.description} />
      <EntryForm
        action={updateEntry}
        entry={entry}
        projects={projects}
        entities={entities}
        accounts={accounts}
        categories={categories}
      />

      <form action={deleteEntry} className="mt-10 border-t border-line pt-5">
        <input type="hidden" name="id" value={entry.id} />
        <input type="hidden" name="project" value={entry.project} />
        <button type="submit" className={btn("danger", "sm")}>
          Eliminar movimiento
        </button>
      </form>
    </>
  );
}
