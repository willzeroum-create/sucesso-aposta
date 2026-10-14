/**
 * Pesquisa de características pelo número de quadro (VIN) ou pela matrícula holandesa.
 *
 * Fontes, por ordem:
 *  1. vindecoder.eu (opcional, pago) — ficha técnica europeia completa. VINDECODER_EU_API_KEY + _SECRET.
 *  2. NHTSA vPIC (gratuito, sem chave) — bom para marca/modelo/ano/motor; dados europeus por vezes parciais.
 *  3. Tabela WMI local — fabricante e país a partir dos 3 primeiros caracteres (sempre disponível).
 *  RDW (Países Baixos, gratuito) — por matrícula NL; muito usado em importações.
 * O resultado é uma proposta: só preenche campos vazios e a pessoa confirma.
 */
import "server-only";
import { createHash } from "node:crypto";
import { isValidVinFormat, normalizeDate, normalizeVin, vinCheckDigitMatches } from "@/lib/pt-validation";
import { mapFuel } from "@/server/ai/documents";

export interface VinFields {
  make?: string;
  model?: string;
  version?: string;
  year?: number;
  fuel?: "petrol" | "diesel" | "hybrid" | "electric";
  transmission?: "automatic" | "manual";
  engineCc?: number;
  powerHp?: number;
  doors?: number;
  seats?: number;
  color?: string;
  grossWeightKg?: number;
  tareKg?: number;
  co2?: number;
  firstRegistration?: string;
  vehicleType?: string;
  category?: "coupe" | "saloon" | "suv" | "estate";
}

export interface VinLookupResult {
  vin: string;
  formatValid: boolean;
  checkDigitOk: boolean;
  manufacturer: string | null;
  country: string | null;
  sources: { name: string; ok: boolean; message?: string }[];
  fields: VinFields;
}

/* ── WMI (World Manufacturer Identifier) ── */

const WMI: Record<string, string> = {
  WBA: "BMW", WBS: "BMW M", WBY: "BMW i", WMW: "MINI", WDD: "Mercedes-Benz", WDB: "Mercedes-Benz", W1K: "Mercedes-Benz",
  W1N: "Mercedes-Benz", WDC: "Mercedes-Benz", W1V: "Mercedes-Benz", WVW: "Volkswagen", WV1: "Volkswagen Comerciais",
  WV2: "Volkswagen Comerciais", WAU: "Audi", WUA: "Audi Sport", WP0: "Porsche", WP1: "Porsche", WF0: "Ford (Alemanha)",
  W0L: "Opel", W0V: "Opel", TMB: "Škoda", VSS: "SEAT", VSK: "Nissan (Espanha)", VF1: "Renault", VF3: "Peugeot",
  VF7: "Citroën", VR3: "Peugeot", VR7: "Citroën", VR1: "DS", UU1: "Dacia", ZFA: "Fiat", ZAR: "Alfa Romeo",
  ZFF: "Ferrari", ZHW: "Lamborghini", ZAM: "Maserati", ZLA: "Lancia", YV1: "Volvo", YV4: "Volvo", LYV: "Volvo (China)",
  SAL: "Land Rover", SAJ: "Jaguar", SCC: "Lotus", SCB: "Bentley", SCA: "Rolls-Royce", SFZ: "McLaren", JTD: "Toyota",
  JTN: "Toyota", JTM: "Toyota", SB1: "Toyota (Reino Unido)", NMT: "Toyota (Turquia)", JN1: "Nissan", SJN: "Nissan (Reino Unido)",
  JHM: "Honda", SHH: "Honda (Reino Unido)", JMZ: "Mazda", JMB: "Mitsubishi", JS2: "Suzuki", TSM: "Suzuki (Hungria)",
  KMH: "Hyundai", TMA: "Hyundai (Chéquia)", NLH: "Hyundai (Turquia)", KNA: "Kia", U5Y: "Kia (Eslováquia)", KNE: "Kia",
  "5YJ": "Tesla", LRW: "Tesla (China)", XP7: "Tesla (Alemanha)", LSJ: "MG", LVS: "Ford (China)", YS3: "Saab",
  VNK: "Toyota (França)", TRU: "Audi (Hungria)", WMA: "MAN", "1FA": "Ford (EUA)", "1G1": "Chevrolet", "2T1": "Toyota (Canadá)",
};

const REGIONS: [RegExp, string][] = [
  [/^W/, "Alemanha"], [/^V[F-R]/, "França"], [/^V[S-W]/, "Espanha"], [/^Z/, "Itália"], [/^S[A-M]/, "Reino Unido"],
  [/^Y[S-W]/, "Suécia"], [/^T[J-P]/, "Chéquia"], [/^T[R-V]/, "Hungria"], [/^U[5-7]/, "Eslováquia"], [/^J/, "Japão"],
  [/^K[L-R]/, "Coreia do Sul"], [/^L/, "China"], [/^[1-5]/, "América do Norte"], [/^N[L-R]/, "Turquia"], [/^X[L-R]/, "Países Baixos"],
];

function wmiInfo(vin: string): { manufacturer: string | null; country: string | null } {
  const manufacturer = WMI[vin.slice(0, 3)] ?? null;
  const country = REGIONS.find(([re]) => re.test(vin))?.[1] ?? null;
  return { manufacturer, country };
}

const int = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

function bodyToCategory(body: string): VinFields["category"] {
  const b = body.toLowerCase();
  if (/suv|sport utility|crossover|multipurpose|mpv|terreno/.test(b)) return "suv";
  if (/wagon|estate|kombi|touring|carrinha|stationwagen|break/.test(b)) return "estate";
  if (/coupe|coupé|convertible|cabrio|roadster|spider/.test(b)) return "coupe";
  if (/sedan|saloon|hatchback|berlina|liftback/.test(b)) return "saloon";
  return undefined;
}

/* ── NHTSA vPIC ── */

async function fromNhtsa(vin: string): Promise<VinFields> {
  const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { Results?: Record<string, string>[] };
  const r = body.Results?.[0];
  if (!r) throw new Error("sem resultados");
  const f: VinFields = {};
  if (r.Make) f.make = titleCase(r.Make);
  if (r.Model) f.model = r.Model;
  const version = [r.Series, r.Trim].filter(Boolean).join(" ");
  if (version) f.version = version;
  const year = int(r.ModelYear);
  if (year && year > 1980) f.year = year;
  const fuel = mapFuel([r.FuelTypePrimary, r.ElectrificationLevel].filter(Boolean).join(" "));
  if (fuel) f.fuel = fuel;
  if (/automatic|cvt|dct|dual.clutch/i.test(r.TransmissionStyle ?? "")) f.transmission = "automatic";
  else if (/manual/i.test(r.TransmissionStyle ?? "")) f.transmission = "manual";
  const cc = int(r.DisplacementCC);
  if (cc) f.engineCc = cc;
  const hp = int(r.EngineHP);
  if (hp) f.powerHp = Math.round(hp * 1.01387); // hp (SAE) → cv (DIN)
  const doors = int(r.Doors);
  if (doors) f.doors = doors;
  const seats = int(r.Seats);
  if (seats) f.seats = seats;
  if (r.BodyClass) {
    f.vehicleType = r.BodyClass;
    const cat = bodyToCategory(r.BodyClass);
    if (cat) f.category = cat;
  }
  if (!f.make && !f.model) throw new Error(r.ErrorText?.split(";")[0] || "VIN não reconhecido");
  return f;
}

function titleCase(s: string): string {
  if (s.length <= 3) return s.toUpperCase();
  return s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
}

/* ── vindecoder.eu (opcional) ── */

export function vindecoderConfigured(): boolean {
  return Boolean(process.env.VINDECODER_EU_API_KEY && process.env.VINDECODER_EU_SECRET);
}

async function fromVindecoderEu(vin: string): Promise<VinFields> {
  const key = process.env.VINDECODER_EU_API_KEY!;
  const secret = process.env.VINDECODER_EU_SECRET!;
  const id = "decode";
  const control = createHash("sha1").update(`${vin}|${id}|${key}|${secret}`).digest("hex").slice(0, 10);
  const res = await fetch(`https://api.vindecoder.eu/3.2/${key}/${control}/decode/${vin}.json`, {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { decode?: { label: string; value: unknown }[]; error?: boolean; message?: string };
  if (body.error || !body.decode) throw new Error(body.message || "sem dados");
  const get = (label: string) => body.decode!.find((d) => d.label === label)?.value;
  const f: VinFields = {};
  const s = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");
  if (s(get("Make"))) f.make = s(get("Make"));
  if (s(get("Model"))) f.model = s(get("Model"));
  const version = s(get("Trim")) || s(get("Version"));
  if (version) f.version = version;
  const year = int(get("Model Year"));
  if (year) f.year = year;
  const fuel = mapFuel(s(get("Fuel Type - Primary")) || s(get("Fuel Type")));
  if (fuel) f.fuel = fuel;
  const trans = s(get("Transmission"));
  if (/auto/i.test(trans)) f.transmission = "automatic";
  else if (/manual/i.test(trans)) f.transmission = "manual";
  const cc = int(get("Engine Displacement (ccm)"));
  if (cc) f.engineCc = cc;
  const hp = int(get("Engine Power (HP)"));
  const kw = int(get("Engine Power (kW)"));
  if (hp) f.powerHp = hp;
  else if (kw) f.powerHp = Math.round(kw * 1.35962);
  const doors = int(get("Number of Doors"));
  if (doors) f.doors = doors;
  const seats = int(get("Number of Seats"));
  if (seats) f.seats = seats;
  const co2 = int(get("CO2 Emission (g/km)"));
  if (co2) f.co2 = co2;
  const gross = int(get("Max Weight (kg)") ?? get("Permitted trailer load with brakes (kg)"));
  if (gross) f.grossWeightKg = gross;
  const body2 = s(get("Body"));
  if (body2) {
    f.vehicleType = body2;
    const cat = bodyToCategory(body2);
    if (cat) f.category = cat;
  }
  return f;
}

export async function lookupVin(input: string): Promise<VinLookupResult> {
  const vin = normalizeVin(input);
  const formatValid = isValidVinFormat(vin);
  const result: VinLookupResult = {
    vin,
    formatValid,
    checkDigitOk: formatValid && vinCheckDigitMatches(vin),
    ...wmiInfo(vin),
    sources: [],
    fields: {},
  };
  if (!formatValid) return result;

  const merge = (f: VinFields) => {
    for (const [k, v] of Object.entries(f)) {
      if (v !== undefined && v !== "" && (result.fields as Record<string, unknown>)[k] === undefined)
        (result.fields as Record<string, unknown>)[k] = v;
    }
  };

  if (vindecoderConfigured()) {
    try {
      merge(await fromVindecoderEu(vin));
      result.sources.push({ name: "vindecoder.eu", ok: true });
    } catch (e) {
      result.sources.push({ name: "vindecoder.eu", ok: false, message: e instanceof Error ? e.message : "erro" });
    }
  }
  try {
    merge(await fromNhtsa(vin));
    result.sources.push({ name: "NHTSA vPIC", ok: true });
  } catch (e) {
    result.sources.push({ name: "NHTSA vPIC", ok: false, message: e instanceof Error ? e.message : "erro" });
  }
  if (!result.fields.make && result.manufacturer) result.fields.make = result.manufacturer.replace(/\s*\(.*\)$/, "");
  return result;
}

/* ── RDW (Países Baixos), por matrícula holandesa ── */

export async function lookupDutchPlate(plate: string): Promise<{ ok: boolean; fields: VinFields; message?: string }> {
  const kenteken = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{6}$/.test(kenteken)) return { ok: false, fields: {}, message: "Matrícula holandesa inválida (6 caracteres)." };
  try {
    const [baseRes, fuelRes] = await Promise.all([
      fetch(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${kenteken}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" }),
      fetch(`https://opendata.rdw.nl/resource/8ys7-d773.json?kenteken=${kenteken}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" }),
    ]);
    const base = ((await baseRes.json()) as Record<string, string>[])[0];
    if (!base) return { ok: false, fields: {}, message: "Matrícula não encontrada no RDW." };
    const fuels = fuelRes.ok ? ((await fuelRes.json()) as Record<string, string>[]) : [];
    const f: VinFields = {};
    if (base.merk) f.make = titleCase(base.merk);
    if (base.handelsbenaming) f.model = base.handelsbenaming.replace(new RegExp(`^${base.merk}\\s*`, "i"), "");
    const first = normalizeDate(base.datum_eerste_toelating);
    if (first) {
      f.firstRegistration = first;
      f.year = Number(first.slice(0, 4));
    }
    const cc = int(base.cilinderinhoud);
    if (cc) f.engineCc = cc;
    const seats = int(base.aantal_zitplaatsen);
    if (seats) f.seats = seats;
    const doors = int(base.aantal_deuren);
    if (doors) f.doors = doors;
    const gross = int(base.toegestane_maximum_massa_voertuig);
    if (gross) f.grossWeightKg = gross;
    const tare = int(base.massa_rijklaar ?? base.massa_ledig_voertuig);
    if (tare) f.tareKg = tare;
    const colors: Record<string, string> = { WIT: "Branco", ZWART: "Preto", GRIJS: "Cinzento", BLAUW: "Azul", ROOD: "Vermelho", GROEN: "Verde", BRUIN: "Castanho", GEEL: "Amarelo", ORANJE: "Laranja", BEIGE: "Bege", PAARS: "Roxo", CREME: "Creme" };
    if (base.eerste_kleur) f.color = colors[base.eerste_kleur] ?? titleCase(base.eerste_kleur);
    if (base.inrichting) {
      f.vehicleType = `${base.voertuigsoort ?? ""} ${base.inrichting}`.trim();
      const cat = bodyToCategory(base.inrichting);
      if (cat) f.category = cat;
    }
    const fuelNames = fuels.map((x) => x.brandstof_omschrijving ?? "").join(" ");
    if (fuels.length > 1 && /elektr/i.test(fuelNames)) f.fuel = "hybrid";
    else {
      const map: Record<string, VinFields["fuel"]> = { Benzine: "petrol", Diesel: "diesel", Elektriciteit: "electric" };
      if (fuels[0]?.brandstof_omschrijving) f.fuel = map[fuels[0].brandstof_omschrijving];
    }
    const kw = Math.max(0, ...fuels.map((x) => int(x.nettomaximumvermogen) ?? 0));
    if (kw) f.powerHp = Math.round(kw * 1.35962);
    const co2 = int(fuels[0]?.co2_uitstoot_gecombineerd);
    if (co2) f.co2 = co2;
    return { ok: true, fields: f };
  } catch {
    return { ok: false, fields: {}, message: "O RDW não respondeu. Tente de novo." };
  }
}
