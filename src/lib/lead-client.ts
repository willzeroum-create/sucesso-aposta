import type { AcceptedLeadResponse, LeadInput } from "./contracts";

export type LeadFieldErrors = Partial<Record<keyof LeadInput, string>>;

const leadFields = new Set<keyof LeadInput>([
  "fullName",
  "email",
  "phone",
  "message",
  "intent",
  "vehicleId",
  "consent",
]);

export function validateLead(input: LeadInput): LeadFieldErrors {
  const errors: LeadFieldErrors = {};
  const name = input.fullName.trim();
  const email = input.email.trim();
  const message = input.message.trim();
  const phone = input.phone?.trim() ?? "";

  if (name.length < 2 || name.length > 120) {
    errors.fullName = "Indique o seu nome, entre 2 e 120 caracteres.";
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Indique um endereço de e-mail válido.";
  }
  if (
    phone &&
    (phone.length > 30 ||
      !/^[+\d\s().-]+$/.test(phone) ||
      !/^\d{7,15}$/.test(phone.replace(/\D/g, "")))
  ) {
    errors.phone =
      "Indique um telefone válido, incluindo o indicativo do país.";
  }
  if (message.length < 10 || message.length > 3000) {
    errors.message = "Escreva uma mensagem entre 10 e 3 000 caracteres.";
  }
  if (!["vehicle", "sourcing", "visit", "general"].includes(input.intent)) {
    errors.intent = "Escolha o motivo do seu contacto.";
  }
  if (input.intent === "vehicle" && !input.vehicleId?.trim()) {
    errors.vehicleId =
      "Selecione uma viatura na coleção ou escolha outro motivo.";
  }
  if (input.consent !== true) {
    errors.consent =
      "É necessário autorizar o tratamento dos dados para responder ao pedido.";
  }
  return errors;
}

export class LeadRequestError extends Error {
  fields: LeadFieldErrors;

  constructor(message: string, fields: LeadFieldErrors = {}) {
    super(message);
    this.name = "LeadRequestError";
    this.fields = fields;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFieldErrors(value: unknown): LeadFieldErrors {
  if (!isRecord(value)) return {};
  const fields: LeadFieldErrors = {};
  for (const [key, message] of Object.entries(value)) {
    if (
      leadFields.has(key as keyof LeadInput) &&
      typeof message === "string" &&
      message.trim()
    ) {
      fields[key as keyof LeadInput] = message;
    }
  }
  return fields;
}

/** Called only in remote mode. Demo interactions never reach this function. */
export async function submitLead(
  input: LeadInput,
): Promise<AcceptedLeadResponse> {
  const errors = validateLead(input);
  if (Object.keys(errors).length) {
    throw new LeadRequestError("Reveja os campos assinalados.", errors);
  }

  let response: Response;
  try {
    response = await fetch("/api/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new LeadRequestError(
      "Não foi possível confirmar o envio. Os dados continuam no formulário; tente novamente dentro de instantes.",
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    throw new LeadRequestError(
      error && typeof error.message === "string" && error.message.trim()
        ? error.message
        : "Não foi possível concluir o envio. Tente novamente dentro de instantes.",
      readFieldErrors(error?.fields),
    );
  }

  if (
    !isRecord(body) ||
    body.status !== "accepted" ||
    typeof body.leadId !== "string" ||
    !body.leadId.trim()
  ) {
    throw new LeadRequestError(
      "O serviço não confirmou a receção do pedido. Os dados continuam no formulário.",
    );
  }

  return { status: "accepted", leadId: body.leadId };
}
