"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowRight, MessageCircleQuestion, RotateCcw, SendHorizontal, X } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  text: string;
  links?: { href: string; label: string }[];
}

const STORAGE_KEY = "painel-ajuda";
const SUGGESTIONS = ["Onde dou entrada de um carro novo?", "Como faço uma declaração sem carro?", "Como começo a legalização de um carro importado?", "Como ponho um carro no site?"];

/** Negrito com **texto**; o resto fica como texto simples (nunca HTML vindo da IA). */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

/** Parágrafos e listas numeradas ou com marcas, como a IA as escreve. */
function Rich({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const ordered = line.match(/^\d+[.)]\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (ordered || bullet) {
      const isOrdered = Boolean(ordered);
      if (list && list.ordered !== isOrdered) flush();
      list ??= { ordered: isOrdered, items: [] };
      list.items.push((ordered ?? bullet)![1]);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

export function HelpAssistant({ firstName }: { firstName: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // A conversa sobrevive a recarregar a página (só neste separador).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
      if (Array.isArray(saved)) setMessages(saved.slice(-30));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {}
  }, [messages]);
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, messages, busy, error]);
  // No telemóvel não abre o teclado logo: primeiro vê as sugestões.
  useEffect(() => {
    if (open && window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function ask(question: string, base: Message[] = messages) {
    const text = question.trim();
    if (!text || busy) return;
    const next: Message[] = [...base, { role: "user", text }];
    setMessages(next);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ai/ajuda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, text }) => ({ role, text })),
          path,
          mobile: window.matchMedia("(max-width: 900px)").matches,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Não foi possível responder agora.");
      setMessages([...next, { role: "assistant", text: json.answer, links: json.links }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível responder agora.");
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    const last = messages.at(-1);
    if (last?.role === "user") ask(last.text, messages.slice(0, -1));
  }

  return (
    <>
      {open && (
        <section className="a-help" role="dialog" aria-label="Ajuda do painel">
          <header className="a-help-head">
            <span className="a-help-badge" aria-hidden="true">
              <MessageCircleQuestion size={18} />
            </span>
            <div>
              <strong>Ajuda do painel</strong>
              <span>Pergunte onde fazer qualquer coisa</span>
            </div>
            {messages.length > 0 && (
              <button type="button" className="a-icon-btn" onClick={() => (setMessages([]), setError(null))} aria-label="Começar nova conversa" title="Nova conversa" disabled={busy}>
                <RotateCcw size={17} />
              </button>
            )}
            <button type="button" className="a-icon-btn" onClick={() => setOpen(false)} aria-label="Fechar ajuda" title="Fechar">
              <X size={18} />
            </button>
          </header>

          <div className="a-help-body" aria-live="polite">
            <div className="a-help-msg is-bot">
              <p>Olá{firstName ? `, ${firstName}` : ""}! Diga o que precisa de fazer e eu indico o caminho no painel.</p>
            </div>
            {messages.length === 0 && (
              <div className="a-help-suggest">
                {SUGGESTIONS.map((s) => (
                  <button type="button" key={s} onClick={() => ask(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`a-help-msg ${m.role === "user" ? "is-me" : "is-bot"}`}>
                {m.role === "user" ? <p>{m.text}</p> : <Rich text={m.text} />}
                {m.links && m.links.length > 0 && (
                  <div className="a-help-links">
                    {m.links.map((l) => (
                      <Link key={l.href} href={l.href} onClick={() => window.matchMedia("(max-width: 900px)").matches && setOpen(false)}>
                        {l.label}
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="a-help-msg is-bot a-help-typing" aria-label="A escrever a resposta">
                <span />
                <span />
                <span />
              </div>
            )}
            {error && (
              <div className="a-help-error" role="alert">
                {error}
                <button type="button" className="a-btn a-btn-sm" onClick={retry}>
                  Tentar de novo
                </button>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="a-help-form"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
          >
            <label htmlFor="a-help-input" className="sr-only">
              A sua pergunta
            </label>
            <textarea
              id="a-help-input"
              ref={inputRef}
              rows={1}
              maxLength={800}
              placeholder="Ex.: onde registo um aluguer?"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
            />
            <button type="submit" className="a-help-send" disabled={busy || !draft.trim()} aria-label="Enviar pergunta">
              <SendHorizontal size={18} />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className="a-help-fab"
        data-open={open}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fechar ajuda" : "Abrir ajuda do painel"}
        aria-expanded={open}
        title={open ? "Fechar ajuda" : "Ajuda"}
      >
        {open ? <X size={22} /> : <MessageCircleQuestion size={24} />}
      </button>
    </>
  );
}
