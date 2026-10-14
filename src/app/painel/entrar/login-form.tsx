"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { login } from "../_actions/auth";
import { Alert, Spinner } from "@/components/painel/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="a-form" style={{ gap: 14 }}>
      <input type="hidden" name="next" value={next} />
      <div className="a-field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="a-field">
        <label htmlFor="password">Palavra-passe</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state && !state.ok && <Alert kind="danger">{state.error}</Alert>}
      <button className="a-btn a-btn-primary" disabled={pending} style={{ minHeight: 44 }}>
        {pending ? <Spinner /> : <LogIn size={17} />} Entrar
      </button>
      <p className="muted" style={{ fontSize: 13 }}>
        Esqueceu-se da palavra-passe? Peça ao administrador do painel para a repor.
      </p>
    </form>
  );
}
