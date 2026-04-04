import { NextRequest } from "next/server";
import {
  getPromptTemplate,
  setPromptTemplate,
  DEFAULT_PROMPT_TEMPLATE,
} from "@/lib/prompt-store";

// GET /api/admin/prompt — read current template
export async function GET() {
  return Response.json({
    template: getPromptTemplate(),
    default: DEFAULT_PROMPT_TEMPLATE,
  });
}

// PUT /api/admin/prompt — update template
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { template } = body;

  if (typeof template !== "string" || template.trim().length === 0) {
    return Response.json(
      { error: "template must be a non-empty string" },
      { status: 400 }
    );
  }

  setPromptTemplate(template);
  return Response.json({ ok: true, template });
}
