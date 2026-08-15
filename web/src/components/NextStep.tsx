import { setNextStep } from "@/lib/actions";
import { btn, cx } from "./ui";

/**
 * The if-then plan, rendered as a sentence you can type into.
 *
 * This is deliberately NOT a to-do field. Contingent "cuando X, entonces Y"
 * plans outperform plain goal intentions by a wide margin in meta-analysis,
 * because they hand initiation to an environmental cue instead of to a decision
 * you have to make in the moment. The form is always open — editing must cost
 * nothing, or it stops being written.
 */
export function NextStep({
  projectId,
  cue,
  step,
  compact = false,
}: {
  projectId: string;
  cue: string;
  step: string;
  compact?: boolean;
}) {
  const empty = !cue && !step;

  return (
    <form
      action={setNextStep}
      className={cx(
        "rounded-2xl px-4 py-4",
        empty ? "bg-row" : "bg-accent/10 ring-1 ring-inset ring-accent/25"
      )}
    >
      <input type="hidden" name="id" value={projectId} />

      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          Retomar
        </span>
        <button type="submit" className={btn("ghost", "sm")}>
          Guardar
        </button>
      </div>

      <div className="space-y-3 text-[17px] leading-relaxed">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="shrink-0 text-muted">Cuando</span>
          <input
            name="next_cue"
            defaultValue={cue}
            placeholder="llegue el lunes a la oficina… (o: sean las 9:00)"
            className="min-w-0 flex-1 border-b border-line2 bg-transparent pb-1 text-ink outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="shrink-0 text-muted">entonces</span>
          <input
            name="next_step"
            defaultValue={step}
            placeholder="abro el notebook 03 y corro el ajuste con la base nueva"
            className="min-w-0 flex-1 border-b border-line2 bg-transparent pb-1 text-ink outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
      </div>

      {!compact && (
        <p className="mt-3.5 text-[13px] leading-relaxed text-faint">
          Concreto y pequeño. El disparador puede ser una situación o una hora — el ensayo que
          comparó ambos no encontró diferencia. Lo que importa es que sea específico.
        </p>
      )}
    </form>
  );
}

/** Read-only one-liner for lists (dashboard, cartera). */
export function NextStepLine({ cue, step }: { cue: string; step: string }) {
  if (!step && !cue) {
    return <span className="mt-1 block text-[13px] text-faint">Sin siguiente paso definido</span>;
  }
  return (
    <span className="mt-1 block text-[13px] text-ink">
      {cue && <span className="text-muted">Cuando </span>}
      {cue}
      {cue && step && <span className="text-muted">, entonces </span>}
      {step}
    </span>
  );
}
