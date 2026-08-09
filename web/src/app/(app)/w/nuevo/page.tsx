import type { Entity, Project } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { createProject } from "@/lib/actions";
import { ALIVE } from "@/lib/filters";
import { PageHeader } from "@/components/ui";
import { ProjectForm } from "@/components/ProjectForm";

export const metadata = { title: "Nuevo workspace · Proyectos" };

export default async function NewProjectPage() {
  const pb = await requirePB();

  const [entities, parents] = await Promise.all([
    pb.collection("entities").getFullList<Entity>({ filter: ALIVE, sort: "name" }),
    pb.collection("projects").getFullList<Project>({ filter: ALIVE, sort: "name" }),
  ]);

  return (
    <>
      <PageHeader
        title="Nuevo workspace"
        subtitle="Un proyecto, un ramo, una empresa, una investigación — todos viven igual."
      />
      <ProjectForm action={createProject} entities={entities} parents={parents} />
    </>
  );
}
