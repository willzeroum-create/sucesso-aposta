/**
 * Testes das regras puras do backend: validações portuguesas, leads, leitura de documentos e termos.
 *   npm.cmd test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFileSync, mkdirSync } from "node:fs";
import { formatPlate, isPortuguesePlate, isValidNif, isValidVinFormat, normalizeDate, parseNumber, vinCheckDigitMatches, formatPostalCodePt } from "../src/lib/pt-validation";
import { validateLead } from "../src/lib/lead-client";
import { DEFAULT_TEMPLATES, fillPlaceholders } from "../src/lib/form-templates";
import { normalizePersonExtraction, normalizeVehicleExtraction, mapFuel } from "../src/server/ai/documents";
import { coerceLeadInput, normalizePhone } from "../src/server/leads";
import { publicationGaps } from "../src/server/public-catalog";
import { renderPdf } from "../src/server/forms";
import { extractJson } from "../src/server/ai/provider";
import { ALL_PERMISSIONS, DEFAULT_ROLES, isPermission } from "../src/server/auth/permissions";
import { hashPassword, passwordProblem, verifyPassword } from "../src/server/auth/password";
import { sniffMime } from "../src/server/storage";

test("NIF com dígito de controlo", () => {
  assert.equal(isValidNif("123456789"), true);
  assert.equal(isValidNif("123456780"), false);
  assert.equal(isValidNif("501442600"), true); // NIPC
  assert.equal(isValidNif("12345678"), false);
  assert.equal(isValidNif("400000000"), false);
});

test("matrículas portuguesas", () => {
  assert.equal(formatPlate("aa12bb"), "AA-12-BB");
  assert.equal(formatPlate("12-ab-34"), "12-AB-34");
  assert.equal(isPortuguesePlate("00-00-AA"), true);
  assert.equal(isPortuguesePlate("TL-429-X"), false);
  assert.equal(formatPlate("tl-429-x"), "TL-429-X");
});

test("VIN", () => {
  assert.equal(isValidVinFormat("WBA8E1C50JA123456"), true);
  assert.equal(isValidVinFormat("WBA8E1C50JA12345O"), false); // letra O
  assert.equal(isValidVinFormat("123"), false);
  assert.equal(vinCheckDigitMatches("1M8GDM9AXKP042788"), true); // exemplo clássico ISO 3779
});

test("datas e números", () => {
  assert.equal(normalizeDate("15.03.2012"), "2012-03-15");
  assert.equal(normalizeDate("2012-03-15"), "2012-03-15");
  assert.equal(normalizeDate("31/02/2020"), "");
  assert.equal(normalizeDate("20120315"), "2012-03-15");
  assert.equal(parseNumber("1.880 kg"), 1880);
  assert.equal(parseNumber("28.900"), 28900);
  assert.equal(parseNumber("1880,5"), 1880.5);
  assert.equal(formatPostalCodePt("1000123"), "1000-123");
});

test("pedido de contacto: as mesmas regras do formulário", () => {
  const ok = coerceLeadInput({ fullName: " Ana ", email: "ana@example.com", message: "Quero ver o carro.", intent: "visit", consent: true });
  assert.deepEqual(validateLead(ok), {});
  const bad = coerceLeadInput({ fullName: "A", email: "x", message: "curta", intent: "vehicle", consent: "true" });
  const errors = validateLead(bad);
  assert.ok(errors.fullName && errors.email && errors.message && errors.vehicleId && errors.consent);
  // tipos errados vindos do navegador não passam
  assert.equal(coerceLeadInput({ fullName: 123, consent: 1 }).consent, false);
  assert.equal(normalizePhone("912 345 678"), "+351912345678");
  assert.equal(normalizePhone("+44 20 7946 0000"), "+442079460000");
});

test("leitura de viatura: normalização da resposta da IA", () => {
  const p = normalizeVehicleExtraction({
    documentos: ["dua"],
    legivel: true,
    problema: "",
    resumo: "DUA de BMW",
    dados: { marca: "BMW", modelo: "320d", ano: "", data_primeira_matricula: "15.03.2019", matricula: "aa12bb", vin: "wba8e1c50ja123456", combustivel: "Gasóleo", potencia_kw: "140", cilindrada: "1.995", vendedor_nif: "123456780" },
  });
  assert.equal(p.fields.year, 2019);
  assert.equal(p.fields.plate, "AA-12-BB");
  assert.equal(p.fields.vin, "WBA8E1C50JA123456");
  assert.equal(p.fields.fuel, "diesel");
  assert.equal(p.fields.powerHp, 190);
  assert.equal(p.fields.engineCc, 1995);
  assert.ok(p.warnings.some((w) => w.includes("NIF")));
  assert.equal(mapFuel("Híbrido plug-in"), "hybrid");
});

test("leitura de pessoa: avisos de NIF, validade e morada", () => {
  const p = normalizePersonExtraction({
    documentos: ["cartao_cidadao"],
    legivel: true,
    problema: "",
    resumo: "CC",
    dados: { nome: "Ana  Silva", nif: "123 456 789", validade_documento: "01/01/2020", morada: "", codigo_postal: "", localidade: "" },
  });
  assert.equal(p.fields.fullName, "Ana Silva");
  assert.equal(p.fields.nif, "123456789");
  assert.ok(p.warnings.some((w) => w.includes("caducado")));
  assert.ok(p.warnings.some((w) => w.includes("morada")));
});

test("JSON da IA com texto à volta", () => {
  assert.deepEqual(extractJson('Aqui está:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(extractJson("sem json"), null);
});

test("publicação: campos obrigatórios do contrato Vehicle", () => {
  const base = { make: "BMW", model: "320d", version: "M Sport", year: 2019, mileageKm: 0, fuel: "diesel" as const, transmission: "automatic" as const, powerHp: 190, priceEur: 25000 };
  assert.deepEqual(publicationGaps(base, true), []);
  assert.deepEqual(publicationGaps({ ...base, priceEur: null, version: "" }, false), ["versão", "preço", "fotografia de capa"]);
});

test("permissões e funções base", () => {
  assert.ok(DEFAULT_ROLES.every((r) => r.permissions.every(isPermission)));
  assert.equal(DEFAULT_ROLES.find((r) => r.isSystem)!.permissions.length, ALL_PERMISSIONS.length);
  assert.ok(!DEFAULT_ROLES.find((r) => r.id === "role_sales")!.permissions.includes("users.manage"));
});

test("palavras-passe", async () => {
  const h = await hashPassword("Segura12345");
  assert.ok(await verifyPassword("Segura12345", h));
  assert.ok(!(await verifyPassword("errada12345", h)));
  assert.ok(passwordProblem("curta1"));
  assert.ok(passwordProblem("semalgarismos"));
  assert.equal(passwordProblem("boa-palavra-1"), null);
});

test("tipo real dos ficheiros (assinatura)", () => {
  assert.equal(sniffMime(Buffer.from("%PDF-1.7 xxxxxxxx")), "application/pdf");
  assert.equal(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "image/jpeg");
  assert.equal(sniffMime(Buffer.from("<svg onload=alert(1)></svg>")), null);
});

test("termos: preenchimento e PDF", async () => {
  const values = {
    "empresa.nome": "Sucesso Aposta, Lda.",
    "empresa.nipc": "501442600",
    "empresa.morada": "Rua Exemplo 1, 1000-001 Lisboa",
    "empresa.representante": "João Exemplo",
    "empresa.cargo": "Gerente",
    "cliente.nome": "Ana Silva",
    "cliente.nif": "123456789",
    "cliente.documento": "Cartão de Cidadão nº 12345678 9 ZZ1",
    "cliente.morada": "Avenida Teste 10, 4000-001 Porto",
    "viatura.marca": "BMW",
    "viatura.modelo": "330e Luxury Line",
    "viatura.matricula": "AA-12-BB",
    "viatura.vin": "WBA8E1C50JA123456",
    "viatura.primeira_matricula": "15/03/2018",
    "venda.preco": "28 900,00 €",
    "venda.data": "14/10/2026",
    "venda.hora": "18:30",
    "venda.local": "Lisboa",
    "venda.km_entrega": "64 500",
    "venda.observacoes": "Garantia de 18 meses. Entregue com 2 chaves.",
  };
  const text = fillPlaceholders(DEFAULT_TEMPLATES.termo_responsabilidade.body, values);
  assert.ok(text.includes("Ana Silva") && text.includes("18:30") && !text.includes("{{"));
  assert.ok(fillPlaceholders("{{cliente.carta}}", {}).includes("____"));
  const pdf = await renderPdf(DEFAULT_TEMPLATES.termo_responsabilidade, values, { reference: "TESTE", standName: "Sucesso Aposta" });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  mkdirSync("tests/output", { recursive: true });
  writeFileSync("tests/output/termo-exemplo.pdf", pdf);
});
