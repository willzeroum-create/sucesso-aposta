import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, allocatePayment, assemble, buildPlan, chargeMessage, inferInterval, summary, whatsappLink, type ContractRow } from "../src/lib/cobrancas";
import { costSummary } from "../src/lib/vehicle-costs";

const contract = (over: Partial<ContractRow> = {}): ContractRow => ({
  id: "c1",
  customerId: "u1",
  customerName: "Ana Silva",
  customerPhone: "912345678",
  secondCustomerId: null,
  secondCustomerName: null,
  vehicleId: null,
  make: "Peugeot",
  model: "308",
  color: "Branco",
  year: 2017,
  plate: "AA-00-BB",
  vin: "",
  deliveryDate: "2026-09-01",
  saleCents: 1_400_000,
  financedCents: 0,
  downCents: 200_000,
  debtCents: 1_200_000,
  notes: "",
  createdAt: new Date(),
  ...over,
});

test("cobranças: plano de prestações", () => {
  const plan = buildPlan(100_000, 3, "2026-01-31");
  assert.deepEqual(
    plan.map((p) => p.dueDate),
    ["2026-01-31", "2026-02-28", "2026-03-31"],
  );
  assert.equal(plan.reduce((s, p) => s + p.amountCents, 0), 100_000);
  assert.equal(plan[2].amountCents, 33_334);
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
  assert.deepEqual(buildPlan(0, 3, "2026-01-01"), []);
});

test("cobranças: plano a cada N dias", () => {
  const plan = buildPlan(90_000, 3, "2026-10-25", "15");
  assert.deepEqual(
    plan.map((p) => p.dueDate),
    ["2026-10-25", "2026-11-09", "2026-11-24"],
  );
  assert.equal(plan.reduce((s, p) => s + p.amountCents, 0), 90_000);
  assert.deepEqual(buildPlan(14_000, 2, "2026-12-28", "7").map((p) => p.dueDate), ["2026-12-28", "2027-01-04"]);
  assert.deepEqual(buildPlan(10_000, 2, "2026-01-01", "0"), []);
  assert.equal(inferInterval(["2026-10-01", "2026-10-15"]), "14");
  assert.equal(inferInterval(["2026-01-31", "2026-02-28"]), "mensal");
  assert.equal(inferInterval(["2026-01-31"]), null);
});

test("cobranças: estados, saldo e resumo", () => {
  const today = "2026-10-15";
  const inst = [
    { id: "p1", contractId: "c1", dueDate: "2026-09-15", amountCents: 400_000, note: "" },
    { id: "p2", contractId: "c1", dueDate: "2026-10-15", amountCents: 400_000, note: "" },
    { id: "p3", contractId: "c1", dueDate: "2026-11-15", amountCents: 400_000, note: "" },
  ];
  const pays = [{ id: "g1", contractId: "c1", installmentId: "p1", date: "2026-09-20", amountCents: 100_000, method: "dinheiro", note: "" }];
  const [c] = assemble([contract()], inst, pays, today);
  assert.equal(c.installments[0].status, "atrasada");
  assert.equal(c.installments[0].daysLate, 30);
  assert.equal(c.installments[0].open, 3000);
  assert.equal(c.installments[1].status, "hoje");
  assert.equal(c.installments[2].status, "pendente");
  assert.equal(c.status, "atrasado");
  assert.equal(c.balance, 11_000);
  const s = summary([c], pays, today);
  assert.equal(s.totals.late, 3000);
  assert.equal(s.totals.dueToday, 4000);
  assert.equal(s.totals.receivedMonth, 0);
  assert.equal(s.upcoming.length, 0);

  // Cobra-se a dívida (não a venda); tudo pago = quitado.
  const [paid] = assemble([contract({ id: "c2", saleCents: 500_000, downCents: 450_000, debtCents: 100_000 })], [], [{ id: "g2", contractId: "c2", installmentId: null, date: "2026-10-01", amountCents: 100_000, method: "mbway", note: "" }], today);
  assert.equal(paid.toCollect, 1000);
  assert.equal(paid.down, 4500);
  assert.equal(paid.status, "quitado");
  const [noPlan] = assemble([contract({ id: "c3" })], [], [], today);
  assert.equal(noPlan.status, "sem_plano");
  assert.equal(noPlan.unplanned, 12_000);
});

test("cobranças: pagamento distribuído pelas prestações", () => {
  const open = [
    { id: "b", dueDate: "2026-11-01", missingCents: 500 },
    { id: "a", dueDate: "2026-10-01", missingCents: 300 },
  ];
  assert.deepEqual(allocatePayment(open, 1000), [
    { installmentId: "a", cents: 300 },
    { installmentId: "b", cents: 500 },
    { installmentId: null, cents: 200 },
  ]);
  assert.deepEqual(allocatePayment(open, 400, "b"), [{ installmentId: "b", cents: 400 }]);
});

test("cobranças: mensagem e link do WhatsApp", () => {
  const text = chargeMessage("", { name: "Ana Silva", amount: 250, dueDate: "2026-10-15", vehicle: "Peugeot 308", daysLate: 0 });
  assert.ok(text.startsWith("Olá Ana,") && text.includes("15/10/2026") && text.includes("Peugeot 308"));
  assert.equal(whatsappLink("912 345 678", "x"), "https://wa.me/351912345678?text=x");
  assert.equal(whatsappLink("", "x"), null);
});

test("custos da viatura: total, margem e lucro", () => {
  const s = costSummary({ purchasePriceEur: 15_000, priceEur: 19_900, soldPriceEur: null }, [{ amountEur: 650 }, { amountEur: 1249.5 }]);
  assert.equal(s.costs, 1899.5);
  assert.equal(s.total, 16_899.5);
  assert.equal(s.expectedMargin, 3000.5);
  assert.equal(s.realProfit, null);
  assert.equal(costSummary({ purchasePriceEur: 10_000, priceEur: 12_000, soldPriceEur: 11_500 }, []).realProfit, 1500);
});

test("alugueres: dias e hora de Lisboa", async () => {
  const { lisbonDate, rentalDays, lisbonDateTime } = await import("../src/lib/rentals");
  // 22/10 17:00 (verão, UTC+1) → 29/10 17:00 (inverno, UTC+0): 7 dias, não 8.
  const start = lisbonDate("2026-10-22", "17:00");
  const end = lisbonDate("2026-10-29", "17:00");
  assert.equal(start.toISOString(), "2026-10-22T16:00:00.000Z");
  assert.equal(end.toISOString(), "2026-10-29T17:00:00.000Z");
  assert.equal(rentalDays(start, end), 7);
  assert.equal(rentalDays(lisbonDate("2026-11-01", "10:00"), lisbonDate("2026-11-01", "18:00")), 1);
  assert.equal(rentalDays(lisbonDate("2026-11-01", "10:00"), lisbonDate("2026-11-03", "15:00")), 3);
  assert.match(lisbonDateTime(start), /22\/10\/2026,? 17:00/);
});
