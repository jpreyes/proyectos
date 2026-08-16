"use client";

import { useMemo } from "react";
import type { Account, Category, Entity, Project } from "../types";
import { useCollection } from "./store";
import { sortBy } from "./query";

/** Las cuatro listas que alimentan los selectores del formulario de movimientos. */
export function useLedgerLists() {
  const projects = useCollection<Project>("projects");
  const entities = useCollection<Entity>("entities");
  const accounts = useCollection<Account>("accounts");
  const categories = useCollection<Category>("categories");

  return useMemo(
    () => ({
      projects: sortBy(projects, "name"),
      entities: sortBy(entities, "name"),
      accounts: sortBy(accounts, "name"),
      categories: sortBy(categories, "direction", "name"),
    }),
    [projects, entities, accounts, categories]
  );
}
