import { notFound } from "next/navigation";
import type { Entity, Project } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { deleteProject, updateProject } from "@/lib/actions";
import { ALIVE } from "@/lib/filters";
import { btn, PageHeader } from "@/components/ui";
import { ProjectForm } from "@/components/ProjectForm";

export const metadata = { title: "Editar workspace · Proyectos" };

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pb = await requirePB();

  let project: Project;
  try {
    project = await pb.collection("projects").getOne<Project>(id);
  } catch {
    notFound();
  }

  const [entities, parents] = await Promise.all([
    pb.collection("entities").getFullList<Entity>({ filter: ALIVE, sort: "name" }),
    pb.collection("projects").getFullList<Project>({ filter: ALIVE, sort: "name" }),
  ]);

  return (
    <>
      <PageHeader title="Editar ficha" subtitle={project.name} />
      <ProjectForm
        action={updateProject}
        project={project}
        entities={entities}
        parents={parents}
      />

      <form action={deleteProject} className="mt-10 border-t border-line pt-5">
        <input type="hidden" name="id" value={project.id} />
        <p className="mb-2 text-[12px] text-faint">
          Eliminar borra también su bitácora, tareas y mapa de ubicaciones. Los movimientos
          financieros quedan, pero sin proyecto asociado.
        </p>
        <button type="submit" className={btn("danger", "sm")}>
          Eliminar workspace
        </button>
      </form>
    </>
  );
}
