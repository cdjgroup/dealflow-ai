import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { checkCsrf } from "@/lib/api-guard";
import { listMcpClients, createMcpClient, toClientResponse } from "@/lib/data/mcp-clients";
import { MCP_SAFE_TOOLS } from "@/lib/constants/tools";
import { z } from "zod";

const ParameterConstraintSchema = z.object({
  param: z.string().min(1).max(64),
  pattern: z.string().min(1).max(200).refine(
    (p) => { try { new RegExp(p); return true; } catch { return false; } },
    { message: "Invalid regex pattern" }
  ),
  description: z.string().max(200).optional(),
});

const CreateClientSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  allowedTools: z
    .array(z.string())
    .optional()
    .refine(
      (tools) => !tools || tools.every((t) => MCP_SAFE_TOOLS.has(t)),
      { message: "allowedTools must only include MCP-safe tools" }
    ),
  trustTier: z.enum(["full", "standard", "restricted", "readonly"]).optional(),
  rateLimit: z.number().int().min(1).max(1000).optional(),
  parameterConstraints: z.record(
    z.array(ParameterConstraintSchema).max(5)
  ).refine((r) => Object.keys(r).length <= 10, {
    message: "Cannot constrain more than 10 tools",
  }).optional(),
});

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const clients = await listMcpClients(auth.userId);
  return NextResponse.json(clients.map(toClientResponse));
}

export async function POST(req: Request) {
  const csrf = checkCsrf(req);
  if (csrf) return csrf;

  const auth = await requireAuth();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { client, rawApiKey } = await createMcpClient(auth.userId, parsed.data);
  return NextResponse.json({ client: toClientResponse(client), rawApiKey }, { status: 201 });
}
