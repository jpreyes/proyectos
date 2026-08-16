"use client";

import type { Resource } from "@/lib/types";
import { RESOURCE_KIND_ICON } from "@/lib/labels";
import type { Config } from "@/lib/config";
import { useConfig } from "@/lib/local/config";
import { addResource, deleteResource, toggleResourcePin } from "@/lib/local/actions";
import { Form } from "./form";
import { Badge, btn, cx, Empty, inputClass, Select } from "./ui";
import { CopyButton } from "./CopyButton";

function isWeb(path: string) {
  return /^https?:\/\//i.test(path);
}

function ResourceRow({ r, cfg }: { r: Resource; cfg: Config }) {
  const dim = r.state === "archived" || r.state === "deprecated";

  return (
    <li
      className={cx(
        "flex items-start gap-3 rounded-xl px-1 py-2.5 hover:bg-panel2/70",
        dim && "opacity-55"
      )}
    >
      <span className="mt-1 w-5 shrink-0 text-center text-[15px] text-muted">
        {cfg.icon("resource_kind", r.kind) || RESOURCE_KIND_ICON[r.kind] || "◇"}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold">{r.label}</span>
          {r.pinned && <span className="text-[12px] text-accent">fijado</span>}
          {r.state && r.state !== "active" && (
            <Badge tone={cfg.tone("resource_state", r.state)}>
              {cfg.label("resource_state", r.state)}
            </Badge>
          )}
        </div>

        {/* El punto entero de la colección: la nota que dejó tu yo anterior. */}
        {r.purpose && <p className="mt-1 text-[13px] leading-snug text-muted">{r.purpose}</p>}

        <div className="mt-1.5 flex items-center gap-2">
          {isWeb(r.path) ? (
            <a
              href={r.path}
              target="_blank"
              rel="noreferrer"
              className="truncate font-mono text-[12px] text-accent"
            >
              {r.path}
            </a>
          ) : (
            <span className="truncate font-mono text-[12px] text-faint" title={r.path}>
              {r.path}
            </span>
          )}
          {!isWeb(r.path) && <CopyButton value={r.path} />}
        </div>
      </div>

      {/* Estaban en opacity-0 hasta el hover: en un teléfono simplemente no se
          podían tocar. Atenuados y permanentes. */}
      <div className="flex shrink-0 items-center gap-0.5">
        <Form action={toggleResourcePin}>
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="pinned" value={r.pinned ? "0" : "1"} />
          <button
            type="submit"
            aria-label={r.pinned ? `Desfijar ${r.label}` : `Fijar ${r.label}`}
            className={cx(
              "grid h-9 w-9 place-items-center rounded-full text-[15px] transition-colors hover:bg-pill",
              r.pinned ? "text-accent" : "text-faint"
            )}
          >
            ★
          </button>
        </Form>
        <Form action={deleteResource}>
          <input type="hidden" name="id" value={r.id} />
          <button
            type="submit"
            aria-label={`Eliminar ${r.label}`}
            className="grid h-9 w-9 place-items-center rounded-full text-[15px] text-faint transition-colors hover:bg-bad/15 hover:text-bad"
          >
            ✕
          </button>
        </Form>
      </div>
    </li>
  );
}

export function ResourceMap({
  projectId,
  resources,
}: {
  projectId: string;
  resources: Resource[];
}) {
  const cfg = useConfig();
  const pinned = resources.filter((r) => r.pinned);
  const current = resources.filter(
    (r) => !r.pinned && r.state !== "archived" && r.state !== "deprecated"
  );
  const old = resources.filter(
    (r) => !r.pinned && (r.state === "archived" || r.state === "deprecated")
  );

  return (
    <div>
      {resources.length === 0 && (
        <Empty>
          Aquí va el mapa del proyecto: cada carpeta, repo o documento, con una línea que explique
          para qué sirve.
        </Empty>
      )}

      {pinned.length > 0 && (
        <ul className="mb-3 space-y-0.5 border-b border-line pb-3">
          {pinned.map((r) => (
            <ResourceRow key={r.id} r={r} cfg={cfg} />
          ))}
        </ul>
      )}

      <ul className="space-y-0.5">
        {current.map((r) => (
          <ResourceRow key={r.id} r={r} cfg={cfg} />
        ))}
      </ul>

      {old.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer px-1 py-1.5 text-[13px] text-faint hover:text-muted">
            {old.length} archivada{old.length === 1 ? "" : "s"} u obsoleta
            {old.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1 space-y-0.5">
            {old.map((r) => (
              <ResourceRow key={r.id} r={r} cfg={cfg} />
            ))}
          </ul>
        </details>
      )}

      <details className="mt-4">
        <summary className={`${btn("subtle", "sm")} list-none`}>+ Agregar ubicación</summary>
        <Form action={addResource} reset className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <input type="hidden" name="project" value={projectId} />
          <input name="label" required placeholder="Nombre corto" className={inputClass} />
          <Select name="kind" options={cfg.options("resource_kind")} defaultValue="folder" />
          <input
            name="path"
            required
            placeholder="D:\ruta\a\la\carpeta   o   https://…"
            className={`${inputClass} font-mono text-[13px] sm:col-span-2`}
          />
          <input
            name="purpose"
            placeholder="¿Qué hay aquí y para qué? — esta línea es la que te salva en 3 semanas"
            className={`${inputClass} sm:col-span-2`}
          />
          <Select name="state" options={cfg.options("resource_state")} defaultValue="active" />
          <button type="submit" className={btn("primary")}>
            Agregar
          </button>
        </Form>
      </details>
    </div>
  );
}
