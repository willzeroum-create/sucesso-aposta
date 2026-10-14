"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, LoaderCircle, X } from "lucide-react";
import type { LeadInput } from "@/lib/contracts";
import {
  LeadRequestError,
  submitLead,
  validateLead,
  type LeadFieldErrors,
} from "@/lib/lead-client";

type InquiryFormProps = {
  source: "demo" | "remote";
  selectedVehicle?: { id: string; name: string };
  onClearVehicle?: () => void;
};

type Feedback = { kind: "success" | "error" | "demo"; message: string } | null;

export function InquiryForm({
  source,
  selectedVehicle,
  onClearVehicle,
}: InquiryFormProps) {
  const prefix = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<LeadFieldErrors>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [intent, setIntent] = useState<LeadInput["intent"]>(
    selectedVehicle ? "vehicle" : "sourcing",
  );

  useEffect(() => {
    setIntent((current) =>
      selectedVehicle ? "vehicle" : current === "vehicle" ? "general" : current,
    );
    setErrors((current) => ({
      ...current,
      vehicleId: undefined,
      intent: undefined,
    }));
    setFeedback(null);
  }, [selectedVehicle?.id]);

  useEffect(() => {
    setFeedback(null);
  }, [source]);

  function fieldDescription(field: keyof LeadInput) {
    return errors[field] ? `${prefix}-${field}-error` : undefined;
  }

  function clearFieldError(field: keyof LeadInput) {
    setErrors((current) =>
      current[field] ? { ...current, [field]: undefined } : current,
    );
    setFeedback(null);
  }

  function showErrors(nextErrors: LeadFieldErrors) {
    setErrors(nextErrors);
    const firstField = Object.keys(nextErrors)[0];
    if (firstField) {
      const focusField = firstField === "vehicleId" ? "intent" : firstField;
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>(`[name="${focusField}"]`)
          ?.focus(),
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const phone = String(data.get("phone") ?? "").trim();
    const input: LeadInput = {
      fullName: String(data.get("fullName") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      ...(phone ? { phone } : {}),
      message: String(data.get("message") ?? "").trim(),
      intent,
      ...(selectedVehicle ? { vehicleId: selectedVehicle.id } : {}),
      consent: data.get("consent") === "on",
    };
    const nextErrors = validateLead(input);
    setFeedback(null);
    if (Object.keys(nextErrors).length) {
      showErrors(nextErrors);
      setFeedback({
        kind: "error",
        message: "Reveja os campos assinalados para continuar.",
      });
      return;
    }
    setErrors({});

    if (source === "demo") {
      setFeedback({
        kind: "demo",
        message:
          "Demonstração concluída. O pedido não foi enviado nem guardado.",
      });
      return;
    }

    submitting.current = true;
    setPending(true);
    try {
      await submitLead(input);
      form.reset();
      setFeedback({
        kind: "success",
        message: "Pedido recebido. Obrigado pelo seu contacto.",
      });
    } catch (error) {
      if (error instanceof LeadRequestError) {
        showErrors(error.fields);
        setFeedback({ kind: "error", message: error.message });
      } else {
        setFeedback({
          kind: "error",
          message:
            "Não foi possível confirmar o envio. Os dados continuam no formulário.",
        });
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form
      ref={formRef}
      className="inquiry-form"
      onSubmit={handleSubmit}
      noValidate
      aria-busy={pending}
    >
      {selectedVehicle && (
        <div className="selected-vehicle">
          <span>
            Viatura selecionada <strong>{selectedVehicle.name}</strong>
          </span>
          {onClearVehicle && (
            <button
              type="button"
              onClick={onClearVehicle}
              aria-label="Remover viatura selecionada"
              disabled={pending}
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor={`${prefix}-fullName`}>
            O seu nome <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${prefix}-fullName`}
            name="fullName"
            autoComplete="name"
            placeholder="Nome completo"
            required
            maxLength={120}
            disabled={pending}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={fieldDescription("fullName")}
            onChange={() => clearFieldError("fullName")}
          />
          {errors.fullName && (
            <p className="field-error" id={fieldDescription("fullName")}>
              {errors.fullName}
            </p>
          )}
        </div>
        <div className="form-field">
          <label htmlFor={`${prefix}-email`}>
            E-mail <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${prefix}-email`}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="nome@exemplo.pt"
            required
            maxLength={254}
            disabled={pending}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={fieldDescription("email")}
            onChange={() => clearFieldError("email")}
          />
          {errors.email && (
            <p className="field-error" id={fieldDescription("email")}>
              {errors.email}
            </p>
          )}
        </div>
        <div className="form-field">
          <label htmlFor={`${prefix}-phone`}>
            Telefone <span>(opcional)</span>
          </label>
          <input
            id={`${prefix}-phone`}
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+351 900 000 000"
            maxLength={30}
            disabled={pending}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={fieldDescription("phone")}
            onChange={() => clearFieldError("phone")}
          />
          {errors.phone && (
            <p className="field-error" id={fieldDescription("phone")}>
              {errors.phone}
            </p>
          )}
        </div>
        <div className="form-field">
          <label htmlFor={`${prefix}-intent`}>
            Como podemos ajudar? <span aria-hidden="true">*</span>
          </label>
          <select
            id={`${prefix}-intent`}
            name="intent"
            value={intent}
            required
            disabled={pending}
            aria-invalid={Boolean(errors.intent || errors.vehicleId)}
            aria-describedby={
              fieldDescription("intent") ?? fieldDescription("vehicleId")
            }
            onChange={(event) => {
              setIntent(event.target.value as LeadInput["intent"]);
              clearFieldError("intent");
              clearFieldError("vehicleId");
            }}
          >
            {selectedVehicle && (
              <option value="vehicle">Saber mais sobre esta viatura</option>
            )}
            <option value="sourcing">Encontrar a minha próxima viatura</option>
            <option value="visit">Pedir uma visita</option>
            <option value="general">Outro assunto</option>
          </select>
          {errors.intent && (
            <p className="field-error" id={fieldDescription("intent")}>
              {errors.intent}
            </p>
          )}
          {errors.vehicleId && (
            <p className="field-error" id={fieldDescription("vehicleId")}>
              {errors.vehicleId}
            </p>
          )}
        </div>
        <div className="form-field full-width">
          <label htmlFor={`${prefix}-message`}>
            Conte-nos o que procura <span aria-hidden="true">*</span>
          </label>
          <textarea
            id={`${prefix}-message`}
            name="message"
            rows={4}
            placeholder="Uma marca, um modelo, uma ideia. Começamos por aí."
            required
            minLength={10}
            maxLength={3000}
            disabled={pending}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={fieldDescription("message")}
            onChange={() => clearFieldError("message")}
          />
          {errors.message && (
            <p className="field-error" id={fieldDescription("message")}>
              {errors.message}
            </p>
          )}
        </div>
      </div>
      <div className="form-consent">
        <input
          id={`${prefix}-consent`}
          name="consent"
          type="checkbox"
          required
          disabled={pending}
          aria-invalid={Boolean(errors.consent)}
          aria-describedby={fieldDescription("consent")}
          onChange={() => clearFieldError("consent")}
        />
        <label htmlFor={`${prefix}-consent`}>
          Autorizo o tratamento dos dados que forneci para responder a este
          pedido. <span aria-hidden="true">*</span>
        </label>
      </div>
      {errors.consent && (
        <p className="field-error" id={fieldDescription("consent")}>
          {errors.consent}
        </p>
      )}
      <p className="form-note">
        * Campos obrigatórios.{" "}
        {source === "demo"
          ? "Modo de demonstração: este formulário simula o pedido. Nenhum dado será enviado ou guardado."
          : "Os seus dados serão utilizados para dar seguimento a este pedido."}
      </p>
      <div className="form-submit">
        <button
          type="submit"
          className="button button-primary"
          disabled={pending}
        >
          {pending
            ? "A enviar pedido…"
            : source === "demo"
              ? "Experimentar o pedido"
              : "Enviar pedido"}
          {pending ? (
            <LoaderCircle size={18} className="spin" aria-hidden="true" />
          ) : (
            <ArrowUpRight size={18} aria-hidden="true" />
          )}
        </button>
        <div
          className={`form-feedback${feedback ? ` is-${feedback.kind}` : ""}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {feedback && (
            <>
              {feedback.kind === "success" && (
                <Check size={17} aria-hidden="true" />
              )}
              <span>{feedback.message}</span>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
