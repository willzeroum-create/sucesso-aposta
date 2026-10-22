import { test } from "node:test";
import assert from "node:assert/strict";
import { eurosPorExtenso, integerWords, parseEuros } from "../src/lib/extenso";

test("inteiros por extenso", () => {
  assert.equal(integerWords(0), "zero");
  assert.equal(integerWords(16), "dezasseis");
  assert.equal(integerWords(21), "vinte e um");
  assert.equal(integerWords(100), "cem");
  assert.equal(integerWords(101), "cento e um");
  assert.equal(integerWords(123), "cento e vinte e três");
  assert.equal(integerWords(1000), "mil");
  assert.equal(integerWords(1100), "mil e cem");
  assert.equal(integerWords(1500), "mil e quinhentos");
  assert.equal(integerWords(1020), "mil e vinte");
  assert.equal(integerWords(1250), "mil duzentos e cinquenta");
  assert.equal(integerWords(2310), "dois mil trezentos e dez");
  assert.equal(integerWords(15000), "quinze mil");
  assert.equal(integerWords(115600), "cento e quinze mil e seiscentos");
  assert.equal(integerWords(1_000_000), "um milhão");
  assert.equal(integerWords(2_500_000), "dois milhões e quinhentos mil");
});

test("euros por extenso", () => {
  assert.equal(eurosPorExtenso(1), "um euro");
  assert.equal(eurosPorExtenso(5000), "cinco mil euros");
  assert.equal(eurosPorExtenso(12750), "doze mil setecentos e cinquenta euros");
  assert.equal(eurosPorExtenso(1250.5), "mil duzentos e cinquenta euros e cinquenta cêntimos");
  assert.equal(eurosPorExtenso(0.01), "um cêntimo");
  assert.equal(eurosPorExtenso(1_000_000), "um milhão de euros");
});

test("ler valores em euros", () => {
  assert.equal(parseEuros("5000"), 5000);
  assert.equal(parseEuros("5 000,50 €"), 5000.5);
  assert.equal(parseEuros("5.000,50"), 5000.5);
  assert.equal(parseEuros("5.000"), 5000);
  assert.equal(parseEuros("1250.5"), 1250.5);
  assert.equal(parseEuros(""), null);
  assert.equal(parseEuros("abc"), null);
});
