"use client";

import { useState } from "react";
import { cx } from "./ui";

/**
 * A browser served from a remote origin cannot open file:// links — clicking a
 * local path can never launch Explorer. Copying it is the honest alternative.
 */
export function CopyButton({
  value,
  className,
  label = "Copiar",
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // clipboard API needs a secure context; fall back to a selection prompt
      window.prompt("Copia la ruta:", value);
      return;
    }
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={value}
      className={cx(
        "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
        done ? "bg-ok/15 text-ok" : "bg-pill text-muted hover:text-ink",
        className
      )}
    >
      {done ? "copiado" : label}
    </button>
  );
}
