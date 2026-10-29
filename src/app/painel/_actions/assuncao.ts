"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { ASSUNCAO_TEMPLATE, ASSUNCAO_TITLE, assuncaoValues, type Outorgante } from "@/lib/assuncao";
import { isIsoDate } from "@/lib/cobrancas";
import { assuncaoDocx } from "@/server/assuncao-docx";
import { STAND_PARTY_KEY } from "@/server/assuncao";
import { docxToPdf, pdfName } from "@/server/docx-pdf";
import { DOCX_MIME } from "@/server/docx-template";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { newId } from "@/server/ids";
import { writeSetting } from "@/server/settings";
import { storeGenerated } from "@/server/storage";
import { run, UserError } from "@/server/action";

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`).default("");
const money = (label: string) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number({ message: `${label}: número inválido.` }).positive(`${label} tem de ser maior do que zero.`).max(10_000_000, `${label} demasiado alto.`).nullable(),
  );
const party = z.object({
  empresa: z.boolean(),
  nome: z.string().trim().min(2, "Indique o nome.").max(200),
  nif: text(20),
  morada: text(300),
  representante: text(160),
  representanteNif: text(20),
});

const assuncaoSchema = z.object({
  company: z.enum(["rent", "sale"]),
  standSide: z.enum(["primeiro", "segundo"]),
  primeiro: party,
  segundo: party,
  viatura: z.string().trim().min(2, "Indique a viatura.").max(160),
  matricula: text(20),
  entidade: text(120),
  prestacao: money("A prestação"),
  numPrestacoes: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int("Use um número inteiro.").min(1).max(600).nullable()),
  divida: money("O valor em dívida"),
  primeiraData: z.string().default("").refine((v) => !v || isIsoDate(v), "Data inválida."),
  iuc: money("O IUC"),
  penal: money("A cláusula penal"),
  avalista: text(160),
  avalistaNif: text(20),
  avalistaMorada: text(300),
  local: text(80),
  data: z.string().refine(isIsoDate, "Indique a data."),
});

export type AssuncaoRequest = z.input<typeof assuncaoSchema>;

/** Gera o Word do Contrato de assunção de responsabilidade de uma venda a prestações. */
export async function generateAssumptionContract(chargeId: string, raw: AssuncaoRequest): Promise<ActionResult<{ id: string; url: string; name: string }>> {
  return run(async () => {
    const user = await assertPermission("billing.manage");
    const { company, standSide, ...d } = assuncaoSchema.parse(raw);
    if (!d.prestacao) throw new UserError("Indique o valor da prestação mensal.", { prestacao: "Indique o valor da prestação." });
    const [c] = await db
      .select({ customerId: schema.chargeContracts.customerId, vehicleId: schema.chargeContracts.vehicleId })
      .from(schema.chargeContracts)
      .where(eq(schema.chargeContracts.id, chargeId))
      .limit(1);
    if (!c) throw new UserError("Venda a prestações não encontrada.");

    const docx = await assuncaoDocx(d);
    const name = `${ASSUNCAO_TITLE} - ${d[standSide === "primeiro" ? "segundo" : "primeiro"].nome}`.replace(/[\\/:*?"<>|]/g, "") + ".docx";
    // Entrega-se em PDF (o stand não tem o Office); o Word fica só se a conversão falhar.
    const pdf = await docxToPdf(docx).catch((e) => (console.error("Word → PDF falhou:", e), null));
    const stored = pdf ? await storeGenerated(pdf, "application/pdf", pdfName(name), user.id) : await storeGenerated(docx, DOCX_MIME, name, user.id);
    const id = newId("frm");
    await db.insert(schema.generatedForms).values({
      id,
      template: ASSUNCAO_TEMPLATE,
      customerId: c.customerId,
      vehicleId: c.vehicleId,
      data: assuncaoValues(d, chargeId),
      fileId: stored.id,
      createdBy: user.id,
    });

    // O representante do stand fica guardado para o próximo contrato.
    const stand = d[standSide];
    const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, STAND_PARTY_KEY)).limit(1);
    const saved = (row?.value ?? {}) as Record<string, Partial<Outorgante>>;
    await writeSetting(
      STAND_PARTY_KEY,
      { ...saved, [company]: { nome: stand.nome, nif: stand.nif, morada: stand.morada, representante: stand.representante, representanteNif: stand.representanteNif } },
      user.id,
    );

    await audit(user, {
      action: "form.generate",
      entityType: "customer",
      entityId: c.customerId,
      summary: `Gerou "${ASSUNCAO_TITLE}" — ${d.viatura}${d.matricula ? ` ${d.matricula}` : ""}`,
    });
    revalidatePath(`/painel/cobrancas/${chargeId}`);
    revalidatePath(`/painel/clientes/${c.customerId}`);
    if (c.vehicleId) revalidatePath(`/painel/viaturas/${c.vehicleId}`);
    return { id, url: `/api/admin/files/${stored.id}`, name: pdf ? pdfName(name) : name };
  }, "Contrato gerado.");
}
