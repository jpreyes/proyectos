import { requirePB } from "@/lib/pb.server";
import { Rail, TabBar } from "@/components/Tabs";
import { CaptureBar } from "@/components/CaptureBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const pb = await requirePB();

  let open = 0;
  try {
    const res = await pb
      .collection("inbox")
      .getList(1, 1, { filter: 'deleted != true && status = "open"', fields: "id" });
    open = res.totalItems;
  } catch {
    // collection missing (pre-migration) -> just hide the counter
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 px-3 py-4 md:block">
        <Rail open={open} />
      </aside>

      {/* One column at both widths. The old layout ran content to 72rem, which
          on a laptop produced four-column grids nobody reads across; the point
          of this app is a short scannable list, and that has a natural width. */}
      <main className="pb-tabbar mx-auto w-full min-w-0 max-w-3xl px-4 pt-5 md:px-8 md:pt-8">
        <CaptureBar open={open} />
        {children}
      </main>

      <TabBar open={open} />
    </div>
  );
}
