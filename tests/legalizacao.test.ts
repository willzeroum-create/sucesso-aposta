import { test } from "node:test";
import assert from "node:assert/strict";
import { addWorkingDays, davDeadline, davMissing, davSections, registoDeadline, workingDaysUntil } from "../src/lib/legalizacao";
import { emptyRequester, emptyVehicle, type Modelo9Vehicle } from "../src/lib/modelo9";

test("dias úteis (segunda a sexta)", () => {
  assert.equal(addWorkingDays("2026-10-23", 1), "2026-10-26"); // sexta + 1 = segunda
  assert.equal(addWorkingDays("2026-10-19", 20), "2026-11-16");
  assert.equal(workingDaysUntil("2026-10-26", "2026-10-23"), 1);
  assert.equal(workingDaysUntil("2026-10-23", "2026-10-26"), -1);
  assert.equal(workingDaysUntil("2026-10-23", "2026-10-23"), 0);
});

test("prazo da DAV: 20 dias úteis desde a entrada", () => {
  assert.deepEqual(davDeadline(null, "modelo9", false), { state: "sem_data" });
  assert.deepEqual(davDeadline("2026-10-19", "modelo9", false, "2026-10-20"), { state: "ok", deadline: "2026-11-16", daysLeft: 19 });
  assert.equal(davDeadline("2026-10-19", "alfandega", false, "2026-11-12").state, "atencao");
  assert.equal(davDeadline("2026-10-19", "alfandega", false, "2026-11-17").state, "atrasado");
  assert.equal(davDeadline("2026-10-19", "alfandega", true, "2026-11-17").state, "submetida");
  assert.equal(davDeadline("2026-10-19", "registo", false, "2026-11-17").state, "submetida");
});

test("registo de propriedade: 60 dias a contar da matrícula", () => {
  assert.equal(registoDeadline("2026-10-01"), "2026-11-30");
  assert.equal(registoDeadline(""), null);
});

const golf = (over: Partial<Modelo9Vehicle> = {}): Modelo9Vehicle => ({
  ...emptyVehicle(),
  make: "Volkswagen", model: "Golf", vin: "WVWZZZAUZKW123456", foreignPlate: "XX-123-X", firstRegistration: "2019-03-15", originCountry: "Países Baixos",
  homologation: "e1*2007/46*0623", euCategory: "M1", category: "Ligeiro", purpose: "Passageiros", fuel: "Gasóleo", engineCc: "1968", seats: "5",
  grossWeightKg: "1880", tareKg: "1370", co2: "112",
  ...over,
});
const req = { ...emptyRequester("empresa"), name: "Sucesso Prudente, Unipessoal Lda", nif: "514904372", address: "Rua X", postalCode: "1685-901", city: "Famões" };
const casa = (sections: ReturnType<typeof davSections>, n: string) => sections.flatMap((s) => s.fields).find((f) => f.casa === n);

test("casas da DAV: códigos e dados do livrete", () => {
  const s = davSections(req, golf(), { entryType: "autotransportado", kmAtDav: "84000", sellerName: "AutoHaus", invoiceNumber: "F1", invoiceDate: "2026-10-01", purchasePrice: "12500.00" }, "2026-10-19");
  assert.equal(casa(s, "06a")?.value, "514904372");
  assert.equal(casa(s, "06")?.value, "NIF coletivo (empresa)");
  assert.equal(casa(s, "31")?.copy, "01");
  assert.equal(casa(s, "33")?.copy, "001");
  assert.equal(casa(s, "39")?.copy, "02");
  assert.equal(casa(s, "60")?.value, "15/03/2019");
  assert.equal(casa(s, "66")?.value, "19/10/2026");
  assert.equal(casa(s, "66a")?.value, "Autotransportado");
  assert.equal(casa(s, "DC08")?.copy, "1");
  assert.equal(casa(s, "DC21")?.copy, "2"); // autotransportado → via rodoviária
  assert.equal(casa(s, "DC14")?.value, "EUR");
  // gasóleo: pede partículas (51)
  assert.ok(davMissing(s).some((f) => f.casa === "51"));
});

test("casas da DAV: elétrico sem cilindrada nem CO₂", () => {
  const s = davSections(req, golf({ fuel: "Elétrico", engineCc: "", co2: "" }), {}, null);
  assert.equal(casa(s, "50")?.value, "0");
  assert.ok(!davMissing(s).some((f) => f.casa === "45" || f.casa === "50" || f.casa === "51"));
  assert.ok(davMissing(s).some((f) => f.casa === "66")); // sem data de entrada
});
