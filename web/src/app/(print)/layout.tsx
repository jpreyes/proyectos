import { requirePB } from "@/lib/pb.server";

/**
 * Las vistas imprimibles viven fuera de `(app)`: sin barra lateral, sin captura,
 * sin navegación. Lo que se ve en pantalla es exactamente lo que sale en el PDF,
 * que es la única forma de que imprimir no dé sorpresas.
 *
 * La sesión se exige igual — es el mismo dato de siempre, solo que en blanco.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requirePB();
  return <div className="min-h-screen bg-neutral-200 py-6 print:bg-white print:py-0">{children}</div>;
}
