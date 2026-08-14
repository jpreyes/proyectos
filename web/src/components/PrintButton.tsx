"use client";

import { btn } from "./ui";

/**
 * Uno de los pocos componentes que de verdad necesita el navegador: no hay
 * forma de abrir el diálogo de impresión sin JavaScript. Si estuviera apagado,
 * queda igual el Ctrl+P de siempre — el documento ya está renderizado.
 */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={btn("primary", "sm")}>
      Imprimir / Guardar PDF
    </button>
  );
}
