"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Entity, Project } from "@/lib/types";
import { deleteProject, updateProject } from "@/lib/local/actions";
import { useCollection, useRecord } from "@/lib/local/store";
import { useRouteId } from "@/lib/local/route";
import { sortBy } from "@/lib/local/query";
import { Form } from "@/components/form";
import { btn, PageHeader } from "@/components/ui";
import { ProjectForm } from "@/components/ProjectForm";
import { Title } from "@/components/Title";

export default function EditProjectPage() {
  const id = useRouteId();
  const project = useRecord<Project>("projects", id);
  const entities = useCollection<Entity>("entities");
  const projects = useCollection<Project>("projects");

  const sortedEntities = useMemo(() => sortBy(entities, "name"), [entities]);
  const sortedProjects = useMemo(() => sortBy(projects, "name"), [projects]);

  if (!project || project.deleted) {
    return (
      <>
        <Title>Editar workspace</Title>
        <PageHeader title="No está" subtitle="Este workspace no existe en esta cuenta." />
        <Link href="/w" className={btn("subtle")}>
          Volver a Trabajo
        </Link>
      </>
    );
  }

  return (
    <>
      <Title>Editar workspace</Title>
      <PageHeader title="Editar ficha" subtitle={project.name} />
      <ProjectForm
        action={updateProject}
        project={project}
        entities={sortedEntities}
        parents={sortedProjects}
      />

      <Form
        action={deleteProject}
        confirm={`¿Eliminar "${project.name}"? Su bitácora, tareas y ubicaciones se van con él.`}
        className="mt-10 border-t border-line pt-6"
      >
        <input type="hidden" name="id" value={project.id} />
        <p className="mb-3 text-[13px] leading-relaxed text-faint">
          Eliminar borra también su bitácora, tareas y mapa de ubicaciones. Los movimientos
          financieros quedan, pero sin proyecto asociado.
        </p>
        <button type="submit" className={btn("danger")}>
          Eliminar workspace
        </button>
      </Form>
    </>
  );
}
