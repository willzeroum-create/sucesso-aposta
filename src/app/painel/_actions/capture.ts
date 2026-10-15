"use server";

import { headers } from "next/headers";
import QRCode from "qrcode";
import type { ActionResult } from "@/lib/action-result";
import { createCaptureSession, type CaptureTarget } from "@/server/capture";
import { run } from "@/server/action";

/** Cria o link de uso único e o código QR para fotografar com o telemóvel. */
export async function startPhoneCapture(target: CaptureTarget): Promise<ActionResult<{ id: string; url: string; qrSvg: string; expiresAt: string }>> {
  return run(async () => {
    const { id, token, expiresAt } = await createCaptureSession(target);
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    const url = `${proto}://${host}/painel/foto/${token}`;
    const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#121513", light: "#ffffff" } });
    return { id, url, qrSvg, expiresAt: expiresAt.toISOString() };
  });
}
