import { NextResponse } from "next/server";
import { z } from "zod";
import { answerHelp } from "@/server/ai/help";
import { AuthError, getSessionUser } from "@/server/auth/session";
import { assertSameOrigin, jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { getSiteConfig } from "@/server/settings";
import { UserError } from "@/server/action";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(3000) }))
    .min(1)
    .max(30),
  path: z.string().max(200).regex(/^\/painel[\w/?=&.-]*$/).catch("/painel"),
  mobile: z.boolean().catch(false),
});

/** Ajuda do painel (botão flutuante): qualquer pessoa com sessão pode perguntar onde fazer as coisas. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new AuthError("A sua sessão terminou. Entre novamente.", 401);
    if (user.mustChangePassword) throw new AuthError("Defina uma nova palavra-passe antes de continuar.", 403);
    const { messages, path, mobile } = bodySchema.parse(await req.json());
    if (messages.at(-1)?.text.length && messages.at(-1)!.text.length > 800) throw new UserError("Pergunta demasiado longa. Escreva em poucas palavras.");
    const limit = await rateLimit(`help:${user.id}`, 60, 60 * 60 * 1000);
    if (!limit.ok) throw new UserError("Fez muitas perguntas na última hora. Tente daqui a pouco.");
    const site = await getSiteConfig();
    const result = await answerHelp(user, { messages, path, mobile, standName: site.name });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ ok: false, error: "Pedido inválido." }, { status: 400 });
    return jsonError(e);
  }
}
