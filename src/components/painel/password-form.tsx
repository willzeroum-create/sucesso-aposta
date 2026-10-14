"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/app/painel/_actions/auth";
import { Alert, Spinner } from "./ui";

export function PasswordForm({ first = false }: { first?: boolean }) {
  const [state, action, pending] = useActionState(changePassword, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && first) router.replace("/painel");
  }, [state, first, router]);
  const err = state && !state.ok ? state.fields ?? {} : {};
  return (
    <form action={action} className="a-form" style={{ gap: 14, maxWidth: 420 }}>
      <div className="a-field">
        <label htmlFor="pw-current">{first ? "Palavra-passe temporária" : "Palavra-passe atual"}</label>
        <input id="pw-current" name="current" type="password" autoComplete="current-password" required aria-invalid={Boolean(err.current)} />
        {err.current && <span className="a-error">{err.current}</span>}
      </div>
      <div className="a-field">
        <label htmlFor="pw-next">Nova palavra-passe</label>
        <input id="pw-next" name="next" type="password" autoComplete="new-password" required minLength={10} aria-invalid={Boolean(err.next)} />
        <span className={err.next ? "a-error" : "a-hint"}>{err.next ?? "Pelo menos 10 caracteres, com letras e algarismos."}</span>
      </div>
      <div className="a-field">
        <label htmlFor="pw-confirm">Repetir a nova palavra-passe</label>
        <input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required aria-invalid={Boolean(err.confirm)} />
        {err.confirm && <span className="a-error">{err.confirm}</span>}
      </div>
      {state && !state.ok && <Alert kind="danger">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.message}</Alert>}
      <div>
        <button className="a-btn a-btn-primary" disabled={pending}>
          {pending && <Spinner />} Guardar palavra-passe
        </button>
      </div>
    </form>
  );
}
