import type { Entry, Quote } from "@/lib/types";
import { requirePB } from "@/lib/pb.server";
import { alive } from "@/lib/filters";
import { clpOf, formatCLPShort } from "@/lib/money";
import { YO_GROUPS } from "@/lib/nav";
import { Chip, Group, Row } from "@/components/ui";
import { LogoutRow } from "@/components/AccountRows";

export const metadata = { title: "Yo · Proyectos" };

/**
 * Everything that is not the daily loop. Six destinations became one tab, and
 * the grouping is the only signal about what belongs with what — there are no
 * section headings, because a stack of labels is the wall of options this
 * screen exists to replace.
 */
export default async function YoPage() {
  const pb = await requirePB();
  const user = pb.authStore.record as { email?: string; name?: string } | null;

  const [receivables, pendingQuotes] = await Promise.all([
    pb.collection("entries").getFullList<Entry>({
      filter: alive('direction = "income" && (status = "invoiced" || status = "committed")'),
      fields: "amount,amount_clp,currency,fx_rate",
    }),
    pb
      .collection("quotes")
      .getList<Quote>(1, 1, { filter: alive('status = "pending"'), fields: "id" }),
  ]);

  const receivableTotal = receivables.reduce((s, e) => s + clpOf(e), 0);

  return (
    <>
      <header className="mb-6 px-1">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">
          {user?.name || "Yo"}
        </h1>
        <p className="mt-1 truncate text-[15px] text-faint">{user?.email}</p>
      </header>

      {/* Two numbers worth a glance, and each one is a way in. */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Chip
          href="/finanzas"
          icon="▲"
          tone={receivableTotal > 0 ? "warn" : "neutral"}
          value={formatCLPShort(receivableTotal)}
          label="por cobrar"
        />
        <Chip
          href="/presupuestos"
          icon="▧"
          tone={pendingQuotes.totalItems > 0 ? "accent" : "neutral"}
          value={pendingQuotes.totalItems}
          label={pendingQuotes.totalItems === 1 ? "presupuesto enviado" : "presupuestos enviados"}
        />
      </div>

      {YO_GROUPS.map((group) => (
        <Group key={group[0].href}>
          {group.map((item) => (
            <Row key={item.href} href={item.href} icon={item.icon} label={item.label} />
          ))}
        </Group>
      ))}

      <Group>
        <a href="/_/" target="_blank" rel="noreferrer" className="block">
          <Row icon="▤" label="Admin PocketBase" hint="Esquema y datos crudos" chevron />
        </a>
        <LogoutRow />
      </Group>
    </>
  );
}
