import type { ReactNode } from "react";
import type { Tone } from "@/lib/labels";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- Card ---- */

export function Card({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-lg border border-line bg-panel/70 backdrop-blur-[1px] overflow-hidden",
        className
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold tracking-wide">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cx("px-4 py-3", bodyClassName)}>{children}</div>
    </section>
  );
}

/* --------------------------------------------------------------- Badge ---- */

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-line2 text-muted bg-panel2",
  accent: "border-accent/40 text-accent bg-accent/10",
  ok: "border-ok/40 text-ok bg-ok/10",
  warn: "border-warn/40 text-warn bg-warn/10",
  bad: "border-bad/40 text-bad bg-bad/10",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- Button ---- */

export function btn(
  variant: "primary" | "ghost" | "danger" | "subtle" = "subtle",
  size: "sm" | "md" = "md"
): string {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer";
  const sizes = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-[13px]";
  const variants = {
    primary: "border-accent/50 bg-accent/15 text-accent hover:bg-accent/25",
    subtle: "border-line2 bg-panel2 text-ink hover:bg-line/60",
    ghost: "border-transparent text-muted hover:text-ink hover:bg-panel2",
    danger: "border-bad/40 bg-bad/10 text-bad hover:bg-bad/20",
  }[variant];
  return cx(base, sizes, variants);
}

/* --------------------------------------------------------------- Forms ---- */

export const inputClass =
  "w-full rounded-md border border-line2 bg-panel2 px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

export function Select({
  name,
  defaultValue,
  options,
  placeholder,
  required,
  className,
}: {
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      required={required}
      className={cx(inputClass, className)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* --------------------------------------------------------------- Misc ----- */

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-line py-6 text-center text-[13px] text-faint">
      {children}
    </p>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  const color = {
    neutral: "text-ink",
    accent: "text-accent",
    ok: "text-ok",
    warn: "text-warn",
    bad: "text-bad",
  }[tone];
  return (
    <div className="rounded-lg border border-line bg-panel/70 px-3.5 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className={cx("mt-1 text-xl font-semibold tabular-nums", color)}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
