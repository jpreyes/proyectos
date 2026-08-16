"use client";

/**
 * El puente entre los formularios y las escrituras locales.
 *
 * Antes cada `<form action={serverAction}>` era una petición al servidor y la
 * página volvía a renderizarse con los datos nuevos. Ahora la escritura ocurre
 * en el dispositivo y la pantalla se actualiza sola porque lee de la réplica,
 * así que lo único que hace falta es interceptar el envío, armar el `FormData`
 * igual que antes y llamar a la acción.
 *
 * Se mantuvo el `FormData` a propósito: los campos ocultos que ya llevaban los
 * formularios siguen sirviendo, y las acciones no tuvieron que convertirse en
 * veinte estados controlados de React.
 */

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

/** Devolver una ruta equivale al viejo `redirect()`. */
export type Action = (fd: FormData) => Promise<string | void> | string | void;

export interface ActionOptions {
  /**
   * Vaciar el formulario al terminar. Lo necesitan los de "agregar": antes los
   * limpiaba el re-render del servidor, y sin eso el texto queda escrito y se
   * agrega dos veces.
   */
  reset?: boolean;
  /**
   * Acciones alternativas, elegidas por el `data-action` del botón que envió.
   * Reemplaza al `formAction` de los formularios con más de un botón.
   */
  alt?: Record<string, Action>;
  /** Confirmación antes de ejecutar. Para lo que borra de verdad. */
  confirm?: string;
}

export function useAction(action: Action, opts: ActionOptions = {}) {
  const router = useRouter();
  const busy = useRef(false);
  const { reset, alt, confirm } = opts;

  return useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy.current) return;

      // `currentTarget` deja de ser válido apenas se cede el hilo, así que el
      // formulario y el botón se capturan antes del primer await.
      const form = event.currentTarget;
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
      const key = submitter?.dataset?.action;
      const fn = (key && alt?.[key]) || action;

      if (confirm && !window.confirm(confirm)) return;

      const fd = new FormData(form);
      busy.current = true;
      try {
        const dest = await fn(fd);
        if (reset) form.reset();
        if (typeof dest === "string" && dest) router.push(dest);
      } finally {
        busy.current = false;
      }
    },
    [action, alt, confirm, reset, router]
  );
}

/**
 * Un `<form>` que escribe local. Se usa igual que el de antes — el atributo
 * `action` recibe la función — para que las pantallas no cambiaran de forma.
 */
export function Form({
  action,
  alt,
  reset,
  confirm,
  children,
  ...rest
}: ActionOptions & {
  action: Action;
  children?: React.ReactNode;
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit">) {
  const onSubmit = useAction(action, { reset, alt, confirm });
  return (
    <form onSubmit={onSubmit} {...rest}>
      {children}
    </form>
  );
}
