import type { ReactNode } from "react";
import Link from "next/link";
import type { Tone } from "@/lib/labels";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- Group ---- */

/**
 * A rounded slab holding a short run of rows. Groups carry no heading of their
 * own by default: the separation between them is what says "different kind of
 * thing", and a stack of titled sections reintroduces exactly the wall of
 * options this design exists to remove. `title` is there for the data screens
 * that genuinely need a label, not for menus.
 */
export function Group({
  id,
  title,
  action,
  children,
  className,
}: {
  /** Ancla, para las fichas que llevan a la lista que las explica. */
  id?: string;
  title?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cx("scroll-mt-4", "mb-6", className)}>
      {(title || action) && (
        <header className="mb-2 flex items-end justify-between gap-3 px-1">
          {title && (
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {/* The 1px gaps between children are the page showing through — see the
          note in globals.css. `space-y-px` plus a bg is cheaper and more robust
          than divide-* once rows are links of differing height. */}
      <div className="overflow-hidden rounded-2xl bg-bg">
        <div className="space-y-px">{children}</div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Row ---- */

/* No rounding here on purpose: `Group` clips with overflow-hidden, so the corner
   radius survives a row being wrapped in a <button> or a <form>, which
   first:/last: selectors would not. Rows always live inside a Group. */
/**
 * `active:` no es decoración: en un teléfono no existe `hover`, así que sin él
 * tocar una fila no produce **ninguna** señal hasta que la pantalla siguiente
 * termina de pintarse. Ese silencio es lo que hace que uno vuelva a tocar, y
 * después otra vez, convencido de que la app se colgó.
 */
const ROW_BASE =
  "flex w-full flex-col bg-row px-4 text-left transition-colors touch-manipulation";
const ROW_PRESS = "hover:bg-pill/70 active:bg-pill";

/** The icon sits in its own squircle so rows line up whatever the glyph width. */
function RowIcon({ icon, tone }: { icon?: ReactNode; tone?: Tone }) {
  if (!icon) return null;
  const color = tone && tone !== "neutral" ? TONE_TEXT[tone] : "text-muted";
  return (
    <span
      className={cx(
        "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bg/55 text-[15px]",
        color
      )}
      aria-hidden
    >
      {icon}
    </span>
  );
}

export function Row({
  href,
  onPress,
  icon,
  iconTone,
  label,
  hint,
  value,
  badge,
  chevron,
  className,
  children,
  actions,
}: {
  href?: string;
  /** Para filas que hacen algo en la misma pantalla en vez de navegar. */
  onPress?: () => void;
  /** Controles propios (un botón, un formulario) que conviven con el enlace. */
  actions?: ReactNode;
  icon?: ReactNode;
  iconTone?: Tone;
  label: ReactNode;
  hint?: ReactNode;
  value?: ReactNode;
  badge?: ReactNode;
  chevron?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const showChevron = chevron ?? Boolean((href || onPress) && !actions);

  /**
   * Una fila con segunda línea se apila; una sin ella se mantiene en una.
   *
   * La segunda línea —el plan «cuando… entonces…», la barra de urgencia— vivía
   * dentro de la columna del título, o sea compartiendo el ancho con la fecha,
   * las insignias y el chevrón. En un teléfono de 390 px eso no era estrecho:
   * era roto. Un workspace con dos insignias dejaba la columna en unos 60 px, y
   * ahí "Ensayos de laboratorio" se leía "En…" y el plan bajaba a una palabra
   * por línea.
   *
   * Apilando, el texto siempre tiene el ancho de la fila y las insignias pasan
   * abajo, donde además pueden ser tres sin apretar nada. El título recupera de
   * paso la línea entera.
   */
  const stacked = Boolean(children);

  const body = (
    <>
      <span className="flex w-full items-center gap-3.5">
        <RowIcon icon={icon} tone={iconTone} />
        <span className={cx("min-w-0 flex-1", stacked ? "pt-3.5" : "py-3.5")}>
          <span className="block truncate text-[17px] font-semibold leading-tight">{label}</span>
          {hint && <span className="mt-1 block truncate text-[13px] text-faint">{hint}</span>}
        </span>
        {value && <span className="shrink-0 text-[15px] tabular-nums text-muted">{value}</span>}
        {!stacked && badge}
        {showChevron && (
          <span className="shrink-0 text-[17px] leading-none text-faint" aria-hidden>
            ›
          </span>
        )}
      </span>

      {stacked && (
        // Alineado con el título cuando hay ícono: la sangría es el ancho del
        // ícono más su separación.
        <span className={cx("block w-full pb-3.5", Boolean(icon) && "pl-[3.375rem]")}>
          {children}
          {badge && (
            <span className="mt-2 flex flex-wrap items-center gap-1.5">{badge}</span>
          )}
        </span>
      )}
    </>
  );

  /**
   * Una fila que navega **y** tiene un botón propio.
   *
   * No se puede meter un `<button>` dentro de un `<a>`: es HTML inválido y el
   * navegador hace lo que quiere con el toque. Por eso el enlace se estira
   * invisible sobre toda la fila y los controles van por encima. Es lo que
   * permite que la fila de un cobro lleve a su detalle sin perder el botón de
   * «marcar pagado» que vive en ella.
   */
  if (href && actions) {
    return (
      <div className={cx(ROW_BASE, ROW_PRESS, "relative", className)}>
        <Link
          href={href}
          className="absolute inset-0 z-0"
          aria-label={typeof label === "string" ? label : undefined}
        />
        <span className="pointer-events-none relative z-10 flex w-full flex-col">{body}</span>
        <span className="relative z-10 -mt-1 flex justify-end pb-3">{actions}</span>
      </div>
    );
  }

  if (href) {
    return (
      <Link href={href} className={cx(ROW_BASE, ROW_PRESS, className)}>
        {body}
      </Link>
    );
  }
  if (onPress) {
    return (
      <button type="button" onClick={onPress} className={cx(ROW_BASE, ROW_PRESS, className)}>
        {body}
      </button>
    );
  }
  return <div className={cx(ROW_BASE, className)}>{body}</div>;
}

/* ----------------------------------------------------------------- Chip ---- */

/**
 * The quick-action pills. They exist to put one number and one tap where the
 * eye lands first; anything that needs explaining belongs in a row instead.
 */
export function Chip({
  href,
  icon,
  label,
  value,
  tone = "neutral",
  className,
}: {
  href?: string;
  icon?: ReactNode;
  label?: ReactNode;
  value: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const cls = cx(
    "flex items-center gap-2.5 rounded-full bg-panel2 px-4 py-3 transition-colors touch-manipulation",
    href && "hover:bg-pill active:bg-line2",
    className
  );
  const body = (
    <>
      {icon && (
        <span className={cx("shrink-0 text-[15px]", TONE_TEXT[tone])} aria-hidden>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold tabular-nums leading-tight">
          {value}
        </span>
        {label && <span className="mt-0.5 block truncate text-[12px] text-faint">{label}</span>}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ---------------------------------------------------------------- Card ----- */

/** A plain slab for content that is not a list of rows: forms, charts, prose. */
export function Card({
  id,
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  id?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section id={id} className={cx("scroll-mt-4 overflow-hidden rounded-2xl bg-row", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-4 pb-1 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-1 text-[13px] text-faint">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cx("px-4 py-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/* --------------------------------------------------------------- Badge ----- */

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted",
  accent: "text-accent",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-pill text-muted",
  accent: "bg-accent/15 text-accent",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
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
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none whitespace-nowrap",
        TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- Button ----- */

export function btn(
  variant: "primary" | "ghost" | "danger" | "subtle" = "subtle",
  size: "sm" | "md" = "md"
): string {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-all touch-manipulation active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none cursor-pointer";
  const sizes = size === "sm" ? "px-3.5 py-2 text-[13px]" : "px-5 py-2.5 text-[15px]";
  const variants = {
    primary: "bg-accent text-bg hover:bg-accent/85",
    subtle: "bg-pill text-ink hover:bg-line2",
    ghost: "text-muted hover:bg-pill hover:text-ink",
    danger: "bg-bad/15 text-bad hover:bg-bad/25",
  }[variant];
  return cx(base, sizes, variants);
}

/* --------------------------------------------------------------- Forms ----- */

export const inputClass =
  "w-full rounded-xl border border-transparent bg-panel2 px-3.5 py-3 text-[15px] text-ink placeholder:text-faint outline-none focus:border-accent/60 focus:bg-row";

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
      <span className="mb-1.5 block text-[13px] font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] text-faint">{hint}</span>}
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

/* --------------------------------------------------------------- Misc ------ */

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl bg-row/60 px-4 py-8 text-center text-[15px] text-faint">{children}</p>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  onPress,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  href?: string;
  /** Una ficha que actúa acá mismo — desplazar a la lista que la explica. */
  onPress?: () => void;
}) {
  const body = (
    <>
      <div className="text-[13px] font-medium text-faint">{label}</div>
      <div className={cx("mt-1 text-[26px] font-bold tabular-nums leading-none", TONE_TEXT[tone])}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[12px] text-faint">{hint}</div>}
    </>
  );
  const cls = cx(
    "block rounded-2xl bg-row px-4 py-4 text-left",
    (href || onPress) && "transition-colors touch-manipulation hover:bg-pill/70 active:bg-pill"
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  if (onPress) {
    return (
      <button type="button" onClick={onPress} className={cx(cls, "w-full")}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
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
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-faint">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
