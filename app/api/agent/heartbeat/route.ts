import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Heartbeat = {
  agent_id?: string;
  account?: "Claude normal" | "Claude Gateway";
  project_name?: string;
  repo_url?: string;
  branch?: string;
  status?: "working" | "paused" | "offline";
  changed_files?: string[];
  last_commit?: string;
  last_activity_at?: string;
};

export async function POST(request: Request) {
  const expected = process.env.AGENT_SYNC_TOKEN;
  const authorization = request.headers.get("authorization") || "";
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await request.json()) as Heartbeat;
  const agentId = body.agent_id?.trim();
  const account = body.account;
  if (!agentId || !account || !body.project_name) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Supabase do servidor não configurado" }, { status: 503 });
  }

  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const now = new Date().toISOString();
  const presence = {
    agent_id: agentId,
    account,
    project_name: body.project_name,
    repo_url: body.repo_url || "",
    branch: body.branch || "",
    status: body.status || "paused",
    changed_files: body.changed_files || [],
    files_count: body.changed_files?.length || 0,
    last_commit: body.last_commit || "",
    last_activity_at: body.last_activity_at || now,
    updated_at: now,
  };

  const { error: presenceError } = await supabase.from("agent_presence").upsert(presence);
  if (presenceError) return NextResponse.json({ error: presenceError.message }, { status: 500 });

  const sessionId = account === "Claude normal" ? "normal" : "gateway";
  const { error: sessionError } = await supabase.from("agent_sessions").upsert({
    id: sessionId,
    account,
    status: presence.status,
    task: `Projeto detectado: ${body.project_name}`,
    next_step: presence.files_count ? `${presence.files_count} arquivo(s) alterado(s)` : "Nenhuma alteração local detectada",
    files: presence.changed_files,
    updated_at: now,
  });
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  return NextResponse.json({ ok: true, updated_at: now });
}
