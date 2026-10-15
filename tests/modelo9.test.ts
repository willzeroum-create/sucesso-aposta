import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  categoriaPT,
  emptyRequester,
  emptyVehicle,
  homologationFields,
  modelo9Missing,
  normalizarDataMatricula,
  paisOrigemValido,
  tipoPT,
} from "../src/lib/modelo9";
import { normalizeImportExtraction, normalizeRequesterExtraction } from "../src/server/ai/documents";
import { fillModelo9 } from "../src/server/modelo9";

test("Modelo 9: categoria, tipo, data e país", () => {
  assert.equal(categoriaPT({ grossWeightKg: "1.880", seats: "5", euCategory: "M1" }), "Ligeiro");
  assert.equal(categoriaPT({ grossWeightKg: "3600", seats: "3", euCategory: "N2" }), "Pesado");
  assert.equal(categoriaPT({ grossWeightKg: "", seats: "16", euCategory: "M2" }), "Pesado");
  assert.equal(categoriaPT({ grossWeightKg: "", seats: "", euCategory: "n1" }), "Ligeiro");
  assert.equal(tipoPT({ purpose: "", euCategory: "M1" }), "Passageiros");
  assert.equal(tipoPT({ purpose: "mercadorias", euCategory: "M1" }), "Mercadorias");
  assert.equal(normalizarDataMatricula("15.03.2012"), "2012-03-15");
  assert.equal(normalizarDataMatricula("20190823"), "2019-08-23");
  assert.equal(normalizarDataMatricula("31/02/2019"), "");
  assert.equal(paisOrigemValido("Portugal"), "");
  assert.equal(paisOrigemValido("Países Baixos"), "Países Baixos");
});

test("Modelo 9: leitura do livrete estrangeiro e do requerente", () => {
  const p = normalizeImportExtraction({
    documentos: ["livrete_estrangeiro", "coc"],
    legivel: true,
    problema: "",
    resumo: "Kentekenbewijs NL",
    dados: {
      marca: "Volkswagen", modelo: "Polo", versao: "1.0 TSI", variante: "AW", vin: "wvwzzzaw1kxy00001", matricula_origem: "10-sjk-9",
      data_primeira_matricula: "23.08.2019", pais_origem: "Países Baixos", homologacao: "e1*2007/46*0291*13", categoria: "m1",
      finalidade: "", cor: "Zwart", num_motor: "", combustivel: "Gasolina", num_cilindros: "3", cilindrada: "999 cm3",
      distancia_eixos: "2.564", peso_bruto: "1.660 kg", tara: "1155", lotacao: "5", co2: "108",
    },
  });
  assert.equal(p.fields.vin, "WVWZZZAW1KXY00001");
  assert.equal(p.fields.foreignPlate, "10-SJK-9");
  assert.equal(p.fields.firstRegistration, "2019-08-23");
  assert.equal(p.fields.category, "Ligeiro");
  assert.equal(p.fields.purpose, "Passageiros");
  assert.equal(p.fields.engineCc, "999");
  assert.equal(p.fields.wheelbaseMm, "2564");
  assert.equal(p.fields.grossWeightKg, "1660");
  assert.equal(p.fields.euCategory, "M1");
  assert.equal(p.fields.engineNumber, undefined, "campos vazios não sobrepõem o que já está escrito");

  const r = normalizeRequesterExtraction({
    documentos: ["certidao_permanente"],
    legivel: true,
    problema: "",
    resumo: "",
    dados: { tipo: "Empresa", nome: "Sucesso Prudente,  Unipessoal Lda", nif: "514 904 372", num_documento: "x", codigo_certidao: "1234-5678-9012", morada: "Rua Marechal Gomes da Costa", codigo_postal: "1685901", localidade: "Famões", email: "", telefone: "" },
  });
  assert.equal(r.fields.kind, "empresa");
  assert.equal(r.fields.nif, "514904372");
  assert.equal(r.fields.docNumber, undefined);
  assert.equal(r.fields.certCode, "1234-5678-9012");
  assert.equal(r.fields.postalCode, "1685-901");
});

test("Modelo 9: obrigatórios, homologação e PDF", async () => {
  const requester = { ...emptyRequester("empresa"), name: "Sucesso Prudente, Unipessoal Lda", nif: "514904372", certCode: "1234-5678-9012", address: "Rua Marechal Gomes da Costa, Vivenda VJP", postalCode: "1685-901", city: "Famões", email: "apostapromissoracar@gmail.com", phone: "960346671" };
  const vehicle = {
    ...emptyVehicle(),
    make: "Volkswagen", model: "Polo", vin: "WVWZZZAW1KXY00001", foreignPlate: "10-SJK-9", firstRegistration: "2019-08-23", originCountry: "Países Baixos",
    homologation: "e1*2007/46*0291*13", euCategory: "M1", category: "Ligeiro", purpose: "Passageiros", color: "Preto", fuel: "Gasolina", cylinders: "3",
    engineCc: "999", wheelbaseMm: "2564", grossWeightKg: "1660", tareKg: "1155", seats: "5", co2: "108", variant: "AW", version: "1.0 TSI",
  };
  assert.deepEqual(modelo9Missing(requester, vehicle), []);
  assert.ok(modelo9Missing({ ...requester, kind: "particular" }, vehicle).includes("Nº do documento de identificação"));
  assert.ok(modelo9Missing(requester, { ...vehicle, foreignPlate: "" }).includes("Matrícula estrangeira"));
  const h = homologationFields({ ...requester, kind: "particular", name: "Ana Maria Silva" }, vehicle);
  assert.equal(h[0].value, "Ana");
  assert.equal(h[1].value, "Maria Silva");

  const pdf = await fillModelo9(requester, vehicle);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  // Nome muito comprido e letras fora do alfabeto latino não podem partir a geração.
  const long = await fillModelo9({ ...requester, kind: "particular", name: "Łukasz Grzegorz Brzęczyszczykiewicz de Oliveira e Albuquerque Santos", docNumber: "12345678 9 ZZ1" }, vehicle);
  assert.equal(long.subarray(0, 5).toString(), "%PDF-");
  mkdirSync("tests/output", { recursive: true });
  writeFileSync("tests/output/modelo9-exemplo.pdf", pdf);
  writeFileSync("tests/output/modelo9-particular.pdf", long);
});
