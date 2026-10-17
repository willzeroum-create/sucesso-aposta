import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { defaultIssuer, docTypeFrom, emptyParty, registrationMissing } from "../src/lib/registo";
import { normalizeRequesterExtraction } from "../src/server/ai/documents";
import { fillRegistration, splitAddress } from "../src/server/registo-pdf";

const buyer = {
  ...emptyParty("particular"),
  name: "Ana Maria da Silva Santos",
  nif: "123456789",
  docType: "cc" as const,
  docNumber: "12345678 9 ZZ1",
  docIssuer: "República Portuguesa",
  docExpiry: "2031-05-12",
  address: "Avenida da Liberdade 10, 2º Esq., Edifício Central, Bloco B",
  postalCode: "1250-001",
  city: "Lisboa",
  email: "ana.santos@example.com",
};
const seller = {
  ...emptyParty("empresa"),
  name: "Sucesso Prudente, Unipessoal Lda",
  nif: "514904372",
  certCode: "1234-5678-9012",
  address: "Rua Marechal Gomes da Costa, Vivenda VJP",
  postalCode: "1685-901",
  city: "Famões",
};
const vehicle = { plate: "AA-12-BB", make: "BMW", model: "330e", vin: "WBA8E1C50JA123456" };

test("registo: documentos, morada e campos obrigatórios", () => {
  assert.deepEqual(docTypeFrom("Cartão de Cidadão"), { docType: "cc", docTypeOther: "" });
  assert.deepEqual(docTypeFrom("Título de Residência"), { docType: "outro", docTypeOther: "Título de Residência" });
  assert.equal(defaultIssuer({ docType: "cc", docTypeOther: "" }), "República Portuguesa");
  assert.equal(defaultIssuer({ docType: "outro", docTypeOther: "Título de Residência" }), "AIMA");
  const [l1, l2] = splitAddress(buyer.address);
  assert.ok(l1.length <= 46 && `${l1} ${l2}` === buyer.address);
  assert.deepEqual(registrationMissing(buyer, seller, vehicle, "2026-10-17"), []);
  const missing = registrationMissing({ ...buyer, docNumber: "" }, { ...seller, name: "" }, { ...vehicle, vin: "" }, "");
  assert.ok(missing.includes("Comprador: nº do documento"));
  assert.ok(missing.includes("Vendedor: nome / firma"));
  assert.ok(missing.includes("Viatura: nº de quadro (vin)"));
  assert.ok(missing.includes("Data da venda"));
});

test("registo: leitura do documento traz tipo, emissor e validade", () => {
  const r = normalizeRequesterExtraction({
    documentos: ["titulo_residencia"],
    legivel: true,
    problema: "",
    resumo: "",
    dados: { tipo: "particular", nome: "João Pereira", nif: "123456789", tipo_documento: "Título de Residência", num_documento: "Y1234567", entidade_emissora: "AIMA", validade_documento: "15/03/2029", codigo_certidao: "", morada: "Rua A 1", codigo_postal: "2700-001", localidade: "Amadora", email: "", telefone: "" },
  });
  assert.equal(r.fields.kind, "particular");
  assert.equal(r.fields.docType, "outro");
  assert.equal(r.fields.docTypeOther, "Título de Residência");
  assert.equal(r.fields.docIssuer, "AIMA");
  assert.equal(r.fields.docExpiry, "2029-03-15");
});

test("registo: comprador no Q3, vendedor no Q4, declaração e assinaturas", async () => {
  const pdf = await fillRegistration({ buyer, seller, vehicle, contractDate: "2026-10-17" });
  const form = (await PDFDocument.load(pdf)).getForm();
  const t = (n: string) => form.getTextField(n).getText() ?? "";
  assert.equal(t("Matricula Q1"), "AA-12-BB");
  assert.equal(t("Quadro N Q1"), "WBA8E1C50JA123456");
  assert.equal(form.getRadioGroup("Registo Propriedade(1).p0").getSelected(), "Declaracao");
  assert.equal(t("Nome - firma Q3"), "ANA MARIA DA SILVA SANTOS");
  assert.equal(t("NIFNIPC 1 Q3"), "123456789");
  assert.equal(t("N identificacao 1 Q3"), "123456789ZZ1");
  assert.equal(form.getRadioGroup("Q3 bcc").getSelected(), "cc");
  assert.equal(t("cod postal 1Q3"), "1250");
  assert.equal(t("Email Q3"), "ana.santos@example.com");
  assert.equal(t("Nome - firma Q4"), "SUCESSO PRUDENTE, UNIPESSOAL LDA");
  assert.equal(t("NIFNIPC Q4"), "514904372");
  assert.equal(t("Outro Q4"), "CERTIDÃO 1234-5678-9012");
  assert.equal(form.getRadioGroup("Q7 1").getSelected(), "1");
  assert.equal(`${t("data dia Q7")}/${t("data mes Q7")}/${t("data ano Q7")}`, "17/10/2026");
  assert.equal(t("N Identificacao 1 Q9"), "123456789ZZ1");
  assert.equal(t("Entidade emissora 1 Q9"), "REPÚBLICA PORTUGUESA");
  assert.equal(t("Assinatura 1 Q9"), "", "a assinatura é à mão");
  assert.equal(t("N Identificacao 2 Q9"), "", "empresa: o representante preenche");
  mkdirSync("tests/output", { recursive: true });
  writeFileSync("tests/output/requerimento-registo-exemplo.pdf", pdf);
});
