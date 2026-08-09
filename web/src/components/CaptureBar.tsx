import Link from "next/link";
import { capture } from "@/lib/actions";
import { btn, cx, inputClass } from "./ui";

/**
 * Always on screen, one field, one click.
 *
 * Offloading only works if capture is cheaper than holding the thought. Any
 * extra decision here — which project, which type, which priority — and the
 * thought gets dropped instead. Sorting happens later, in /inbox.
 */
export function CaptureBar({ open }: { open: number }) {
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <form
        action={capture}
        className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 md:px-8"
      >
        <input
          name="text"
          required
          autoComplete="off"
          placeholder="Anota lo que no quieres perder…"
          className={cx(inputClass, "flex-1")}
        />
        <button type="submit" className={btn("primary", "sm")}>
          Capturar
        </button>
        <Link
          href="/inbox"
          className={cx(
            "shrink-0 rounded-md border px-2 py-1 text-xs transition-colors",
            open > 0
              ? "border-warn/40 bg-warn/10 text-warn hover:bg-warn/20"
              : "border-line2 bg-panel2 text-faint hover:text-ink"
          )}
          title="Bandeja"
        >
          Bandeja {open > 0 ? open : ""}
        </Link>
      </form>
    </div>
  );
}
