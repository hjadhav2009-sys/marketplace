import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sanitizePublicActionError } from "@/src/lib/import-jobs/safe-error";
import { DATA_ACTION_KINDS, previewDataAction, type DataActionKind, type DataActionScope } from "@/src/lib/data-management/service";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "OWNER") return NextResponse.json({ error: "Owner authorization is required." }, { status: 403 });
  try {
    const body = await request.json() as { actionKind?: unknown; scope?: unknown };
    if (typeof body.actionKind !== "string" || !DATA_ACTION_KINDS.includes(body.actionKind as DataActionKind) || !body.scope || typeof body.scope !== "object" || Array.isArray(body.scope)) {
      return NextResponse.json({ error: "Invalid preview request." }, { status: 400 });
    }
    const preview = await previewDataAction(user.id, body.actionKind as DataActionKind, body.scope as DataActionScope);
    return NextResponse.json({
      actionKind: preview.actionKind,
      accountId: preview.accountId,
      typedPhrase: preview.typedPhrase,
      blockers: preview.blockers,
      counts: preview.counts,
      bytes: preview.bytes,
      warnings: preview.warnings
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizePublicActionError(error, "The preview failed safely.") }, { status: 400 });
  }
}
