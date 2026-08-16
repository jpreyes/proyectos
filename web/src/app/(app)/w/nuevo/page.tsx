"use client";

import { useMemo } from "react";
import type { Entity, Project } from "@/lib/types";
import { createProject } from "@/lib/local/actions";
import { useCollection } from "@/lib/local/store";
import { sortBy } from "@/lib/local/query";
import { PageHeader } from "@/components/ui";
import { ProjectForm } from "@/components/ProjectForm";
import { Title } from "@/components/Title";

export default function NewProjectPage() {
  const entities = useCollection<Entity>("entities");
  const projects = useCollection<Project>("projects");

  const sortedEntities = useMemo(() => sortBy(entities, "name"), [entities]);
  const sortedProjects = useMemo(() => sortBy(projects, "name"), [projects]);

  return (
    <>
      <Title>Nuevo workspace</Title>
      <PageHeader
        title="Nuevo workspace"
        subtitle="Un proyecto, un ramo, una empresa, una investigación — todos viven igual."
      />
      <ProjectForm action={createProject} entities={sortedEntities} parents={sortedProjects} />
    </>
  );
}
