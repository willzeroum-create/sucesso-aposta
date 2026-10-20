import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDetail, parseListing } from "../src/server/partners/tampinha";

const card = (ref: string, slug: string, preco: number, sold: boolean) => `
<div class="result-item col-6 col-md-4 tt-col-item" data-marca="x" data-preco="${preco}">
  <a href="../viatura/${ref}/${slug}" class="tt-img">
    <div style="background:url(https://www.auto21.pt/tampinha/imagens_viaturas/${ref}/A.jpg)"></div>
    ${sold ? "<div class='tt-label-custom'>VENDIDO</div>" : ""}
  </a>
</div>`;

const detail = `
<html><head><script>var x = "Eur.";</script></head><body>
<h1>Peugeot 2008</h1>
<img src="https://www.auto21.pt/tampinha/imagens_viaturas/20/N1.jpg"><img src="https://www.auto21.pt/tampinha/imagens_viaturas/20/N2.jpg">
<img src="https://www.auto21.pt/tampinha/imagens_viaturas/20/N1.jpg"><img src="https://www.auto21.pt/tampinha/imagens_viaturas/99/OUTRO.jpg">
<h3>Equipamento</h3><ul><li>Apple CarPlay</li><li>C&acirc;mara de marcha-atr&aacute;s</li><li>Apple CarPlay</li></ul>
<h3>Dados Técnicos</h3><p>Potência CV</p><p>136 Cv</p>
<h3>Anotações</h3><p>Anúncio publicado por rotina informática, todos os dados carecem de confirmação junto da entidade vendedora.</p>
<p>19 900 Eur.</p>
<h3>Características</h3>
<p>Marca:</p><p>Peugeot</p><p>Modelo:</p><p>2008</p><p>Versão:</p><p>allure</p><p>Tipo:</p><p>SUV</p>
<p>Ano e Mês:</p><p>Out. 2020</p><p>Kms:</p><p>129111 Km</p><p>Combustivel:</p><p>Electrico</p>
<p>Cilindrada:</p><p>0 Cm3</p><p>Potencia:</p><p>136 Cv</p><p>Transmissão:</p><p>Automática</p>
<p>VIN:</p><p>VR3UKZKXZLJ814732</p><p>Matrícula:</p><p>AA-12-BB</p>
<p>+351 916 307 335</p>
</body></html>`;

test("parceiro: cartões da lista com preço e vendidos", () => {
  const list = parseListing(card("20", "peugeot-2008-2020", 19900, false) + card("38", "bmw-420-gran-coupe-2018", 23900, true) + card("20", "peugeot-2008-2020", 19900, false));
  assert.equal(list.length, 2, "sem repetidos");
  assert.deepEqual(list[0], { ref: "20", url: "https://tampinhacars.pt/viatura/20/peugeot-2008-2020", price: 19900, sold: false });
  assert.equal(list[1].sold, true);
  assert.equal(list[1].price, 23900);
});

test("parceiro: anúncio com características, equipamento e fotografias", () => {
  const c = parseDetail(detail, "20", "https://tampinhacars.pt/viatura/20/peugeot-2008-2020");
  assert.equal(c.make, "Peugeot");
  assert.equal(c.model, "2008");
  assert.equal(c.version, "Allure");
  assert.equal(c.year, 2020);
  assert.equal(c.mileageKm, 129111);
  assert.equal(c.fuel, "electric");
  assert.equal(c.transmission, "automatic");
  assert.equal(c.powerHp, 136);
  assert.equal(c.engineCc, null, "0 cm3 = sem cilindrada");
  assert.equal(c.priceEur, 19900);
  assert.equal(c.vin, "VR3UKZKXZLJ814732");
  assert.equal(c.plate, "AA-12-BB");
  assert.deepEqual(c.features, ["Apple CarPlay", "Câmara de marcha-atrás"]);
  assert.equal(c.notes, "", "o aviso genérico da plataforma não é descrição");
  assert.deepEqual(c.photos, ["https://www.auto21.pt/tampinha/imagens_viaturas/20/N1.jpg", "https://www.auto21.pt/tampinha/imagens_viaturas/20/N2.jpg"], "só as fotografias deste anúncio, sem repetidas");
});
