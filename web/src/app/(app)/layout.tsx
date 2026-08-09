import { requirePB } from "@/lib/pb.server";
import { Nav } from "@/components/Nav";
import { CaptureBar } from "@/components/CaptureBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const pb = await requirePB();
  const user = pb.authStore.record as { email?: string; name?: string } | null;

  let open = 0;
  try {
    const res = await pb
      .collection("inbox")
      .getList(1, 1, { filter: 'deleted != true && status = "open"', fields: "id" });
    open = res.totalItems;
  } catch {
    // collection missing (pre-migration) -> just hide the counter
  }

  const label = user?.name || user?.email || "";

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-52 shrink-0 border-r border-line bg-panel/40 px-2 py-3 md:block">
        <Nav userLabel={label} />
      </aside>

      <div className="min-w-0 flex-1">
        <div className="border-b border-line bg-panel/40 px-3 py-2 md:hidden">
          <Nav userLabel={label} />
        </div>

        <CaptureBar open={open} />

        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
