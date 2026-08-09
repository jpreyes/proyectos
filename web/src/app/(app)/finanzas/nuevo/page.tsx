import type { Account, Category, Entity, Project } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { createEntry } from "@/lib/actions";
import { PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/EntryForm";

export const metadata = { title: "Nuevo movimiento · Proyectos" };

export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; return_to?: string }>;
}) {
  const sp = await searchParams;
  const pb = await requirePB();

  const [projects, entities, accounts, categories] = await Promise.all([
    pb.collection("projects").getFullList<Project>({ filter: "deleted != true", sort: "name" }),
    pb.collection("entities").getFullList<Entity>({ filter: "deleted != true", sort: "name" }),
    pb.collection("accounts").getFullList<Account>({ sort: "name" }),
    pb.collection("categories").getFullList<Category>({ sort: "direction,name" }),
  ]);

  return (
    <>
      <PageHeader title="Nuevo movimiento" />
      <EntryForm
        action={createEntry}
        projects={projects}
        entities={entities}
        accounts={accounts}
        categories={categories}
        defaultProject={sp.project}
        returnTo={sp.return_to}
      />
    </>
  );
}
