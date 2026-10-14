"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { createUser, deleteRole, resetUserPassword, saveRole, updateUser } from "@/app/painel/_actions/team";
import { PERMISSION_GROUPS, PERMISSIONS, type Permission } from "@/server/auth/permissions";
import { dateTime } from "@/lib/labels";
import { Alert, Dialog, Spinner, useAction } from "./ui";

type Role = { id: string; name: string; description: string; permissions: string[]; isSystem: boolean; users: number };
type User = { id: string; name: string; email: string; roleId: string; active: boolean; lastLoginAt: string | null; locked: boolean };

export function TeamManager({ users, roles, meId, meIsAdmin }: { users: User[]; roles: Role[]; meId: string; meIsAdmin: boolean }) {
  const router = useRouter();
  const { pending, fields, run } = useAction();
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [secret, setSecret] = useState<{ name: string; password: string } | null>(null);
  const [roleEdit, setRoleEdit] = useState<Role | "new" | null>(null);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "—";

  async function submitUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (editing === "new") {
      const res = await run(() => createUser(form));
      if (res.ok) {
        setSecret({ name: String(form.get("name")), password: res.data.password });
        setEditing(null);
        router.refresh();
      }
    } else if (editing) {
      const res = await run(() => updateUser(editing.id, form));
      if (res.ok) {
        setEditing(null);
        router.refresh();
      }
    }
  }

  function openRole(r: Role | "new") {
    setRoleEdit(r);
    setPerms(new Set(r === "new" ? [] : r.permissions));
  }

  async function submitRole(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await run(() =>
      saveRole(roleEdit === "new" ? null : roleEdit!.id, { name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""), permissions: [...perms] }),
    );
    if (res.ok) {
      setRoleEdit(null);
      router.refresh();
    }
  }

  const u = editing && editing !== "new" ? editing : null;
  const r = roleEdit && roleEdit !== "new" ? roleEdit : null;

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Utilizadores</h2>
            <p>Cada pessoa tem a sua conta. As ações ficam registadas com o nome dela.</p>
          </div>
          <button type="button" className="a-btn a-btn-primary a-btn-sm" onClick={() => setEditing("new")}>
            <Plus size={15} /> Novo utilizador
          </button>
        </div>
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Função</th>
                <th className="hide-sm">Último acesso</th>
                <th>Estado</th>
                <th className="right">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((x) => (
                <tr key={x.id}>
                  <td>
                    <strong style={{ fontWeight: 600 }}>{x.name}</strong>
                    {x.id === meId && <span className="muted"> (você)</span>}
                    <div className="muted" style={{ fontSize: 13 }}>
                      {x.email}
                    </div>
                  </td>
                  <td>{roleName(x.roleId)}</td>
                  <td className="hide-sm muted num">{x.lastLoginAt ? dateTime(x.lastLoginAt) : "Nunca"}</td>
                  <td>
                    {!x.active ? <span className="a-pill neutral">Desativado</span> : x.locked ? <span className="a-pill danger">Bloqueado</span> : <span className="a-pill available">Ativo</span>}
                  </td>
                  <td className="right" style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="a-icon-btn" onClick={() => setEditing(x)} aria-label={`Editar ${x.name}`}>
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="a-icon-btn"
                      aria-label={`Repor palavra-passe de ${x.name}`}
                      title="Repor palavra-passe"
                      disabled={pending}
                      onClick={async () => {
                        if (!confirm(`Criar uma palavra-passe temporária para ${x.name}? As sessões abertas dessa pessoa terminam.`)) return;
                        const res = await run(() => resetUserPassword(x.id), { quiet: true });
                        if (res.ok) setSecret({ name: x.name, password: res.data.password });
                      }}
                    >
                      <KeyRound size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Funções e permissões</h2>
            <p>O administrador define o que cada função pode ver e fazer.</p>
          </div>
          <button type="button" className="a-btn a-btn-sm" onClick={() => openRole("new")}>
            <Plus size={15} /> Nova função
          </button>
        </div>
        <div className="a-table-wrap">
          <table className="a-table">
            <tbody>
              {roles.map((x) => (
                <tr key={x.id}>
                  <td>
                    <strong style={{ fontWeight: 600 }}>{x.name}</strong>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {x.description}
                    </div>
                  </td>
                  <td className="hide-sm muted" style={{ fontSize: 13 }}>
                    {x.isSystem ? "Acesso total" : `${x.permissions.length} permissões`}
                  </td>
                  <td className="muted num" style={{ fontSize: 13 }}>
                    {x.users} pessoa{x.users === 1 ? "" : "s"}
                  </td>
                  <td className="right" style={{ whiteSpace: "nowrap" }}>
                    {!x.isSystem && (
                      <>
                        <button type="button" className="a-icon-btn" onClick={() => openRole(x)} aria-label={`Editar função ${x.name}`}>
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="a-icon-btn"
                          aria-label={`Apagar função ${x.name}`}
                          disabled={pending || x.users > 0}
                          title={x.users > 0 ? "Há utilizadores com esta função" : "Apagar"}
                          onClick={async () => confirm(`Apagar a função ${x.name}?`) && (await run(() => deleteRole(x.id))).ok && router.refresh()}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={u ? `Editar ${u.name}` : "Novo utilizador"}>
        <form className="a-form" style={{ gap: 14 }} onSubmit={submitUser}>
          <div className="a-fields">
            <div className="a-field wide">
              <label htmlFor="u-name">Nome</label>
              <input id="u-name" name="name" defaultValue={u?.name} required />
              {fields.name && <span className="a-error">{fields.name}</span>}
            </div>
            <div className="a-field wide">
              <label htmlFor="u-email">E-mail (para entrar)</label>
              <input id="u-email" name="email" type="email" defaultValue={u?.email} required />
              {fields.email && <span className="a-error">{fields.email}</span>}
            </div>
            <div className="a-field wide">
              <label htmlFor="u-role">Função</label>
              <select id="u-role" name="roleId" defaultValue={u?.roleId ?? roles.find((x) => !x.isSystem)?.id}>
                {roles.filter((x) => meIsAdmin || !x.isSystem).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            {u && (
              <label className="a-check wide" style={{ gridColumn: "1 / -1" }}>
                {u.id === meId ? <input type="hidden" name="active" value="on" /> : null}
                <input type="checkbox" name={u.id === meId ? undefined : "active"} defaultChecked={u.active} disabled={u.id === meId} />
                Conta ativa (desativar termina as sessões e impede a entrada)
              </label>
            )}
          </div>
          {!u && <Alert kind="info">É criada uma palavra-passe temporária, mostrada uma única vez. A pessoa troca-a no primeiro acesso.</Alert>}
          <div className="a-actions">
            <button className="a-btn a-btn-primary" disabled={pending}>
              {pending && <Spinner />} {u ? "Guardar" : "Criar utilizador"}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={secret !== null} onClose={() => setSecret(null)} title="Palavra-passe temporária">
        <p>
          Entregue esta palavra-passe a <strong>{secret?.name}</strong> por um canal seguro. Não volta a ser mostrada.
        </p>
        <div className="a-secret">{secret?.password}</div>
        <div className="a-actions">
          <button type="button" className="a-btn" onClick={() => secret && navigator.clipboard?.writeText(secret.password)}>
            Copiar
          </button>
          <button type="button" className="a-btn a-btn-primary" onClick={() => setSecret(null)}>
            Já guardei
          </button>
        </div>
      </Dialog>

      <Dialog open={roleEdit !== null} onClose={() => setRoleEdit(null)} title={r ? `Função: ${r.name}` : "Nova função"} wide>
        <form className="a-form" style={{ gap: 16 }} onSubmit={submitRole}>
          <div className="a-fields">
            <div className="a-field">
              <label htmlFor="r-name">Nome</label>
              <input id="r-name" name="name" defaultValue={r?.name} required />
              {fields.name && <span className="a-error">{fields.name}</span>}
            </div>
            <div className="a-field" style={{ gridColumn: "span 2" }}>
              <label htmlFor="r-desc">Descrição</label>
              <input id="r-desc" name="description" defaultValue={r?.description} />
            </div>
          </div>
          <div className="a-perm-grid">
            {PERMISSION_GROUPS.map((g) => (
              <fieldset key={g.label}>
                <legend>{g.label}</legend>
                {g.items.map((p: Permission) => (
                  <label key={p} className="a-check">
                    <input
                      type="checkbox"
                      checked={perms.has(p)}
                      onChange={(e) => {
                        const next = new Set(perms);
                        if (e.target.checked) next.add(p);
                        else next.delete(p);
                        setPerms(next);
                      }}
                    />
                    {PERMISSIONS[p]}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          {r && r.users > 0 && <Alert kind="info">As alterações aplicam-se de imediato às {r.users} pessoa(s) com esta função.</Alert>}
          <div className="a-actions">
            <button className="a-btn a-btn-primary" disabled={pending}>
              {pending && <Spinner />} Guardar função
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
