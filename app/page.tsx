"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Session = { id: string; account: string; status: string; task: string; next_step: string; files: string[]; updated_at: string };
type Event = { id: number; account: string; message: string; created_at: string };
type ProjectContext = {
  id: string;
  summary: string;
  current_state: string;
  last_change: string;
  changed_files: string[];
  blockers: string;
  next_step: string;
  commit_sha: string;
  updated_by: string;
  updated_at: string;
};

const defaultContext: ProjectContext = {
  id: "shipflow",
  summary: "Painel online para sincronizar o trabalho das contas Claude no projeto ShipFlow.",
  current_state: "Login GitHub funcionando; painel publicado na Vercel; Supabase conectado.",
  last_change: "",
  changed_files: [],
  blockers: "",
  next_step: "Registrar a próxima alteração antes de trocar de conta.",
  commit_sha: "",
  updated_by: "",
  updated_at: "",
};

const demoSessions: Session[] = [
  { id: "normal", account: "Claude normal", status: "working", task: "Aguardando conexão do projeto", next_step: "Conectar o repositório ShipFlow", files: [], updated_at: "" },
  { id: "gateway", account: "Claude Gateway", status: "offline", task: "Nenhuma tarefa em andamento", next_step: "—", files: [], updated_at: "" },
];

function getClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
}

export default function Home() {
  const client = useMemo(getClient, []);
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<unknown>(null);
  const [sessions, setSessions] = useState<Session[]>(demoSessions);
  const [events, setEvents] = useState<Event[]>([{ id: 1, account: "Sistema", message: "Painel pronto para conectar o projeto ShipFlow.", created_at: "" }]);
  const [context, setContext] = useState<ProjectContext>(defaultContext);
  const [task, setTask] = useState("");
  const [account, setAccount] = useState("Claude normal");
  const [notice, setNotice] = useState("Carregando conexão…");
  const [savingContext, setSavingContext] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!client) {
      setNotice("Modo demonstração — conecte o Supabase para usar online.");
      return;
    }
    const sb = client;
    let active = true;

    async function load() {
      const { data: auth } = await sb.auth.getSession();
      if (auth.session) setUser(auth.session.user);
      const [{ data: sd, error: se }, { data: ed, error: ee }, { data: cd, error: ce }] = await Promise.all([
        sb.from("agent_sessions").select("id,account,status,task,next_step,files,updated_at").order("updated_at", { ascending: false }),
        sb.from("activity_events").select("id,account,message,created_at").order("created_at", { ascending: false }).limit(30),
        sb.from("project_context").select("id,summary,current_state,last_change,changed_files,blockers,next_step,commit_sha,updated_by,updated_at").eq("id", "shipflow").maybeSingle(),
      ]);
      if (!active) return;
      if (se || ee) {
        setNotice(`Supabase conectado, mas faltam as tabelas ou a autorização${auth.session ? "." : " — entre com GitHub."}`);
      } else {
        if (sd?.length) setSessions(sd as Session[]);
        if (ed?.length) setEvents(ed as Event[]);
        if (!ce && cd) setContext({ ...defaultContext, ...(cd as ProjectContext) });
        setNotice(auth.session ? "Online e sincronizado" : "Supabase conectado — entre com GitHub");
      }
    }

    load();
    const { data: listener } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      load();
    });
    const channel = sb.channel("claude-sync-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_sessions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_context" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_events" }, load)
      .subscribe();

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      sb.removeChannel(channel);
    };
  }, [client]);

  async function signIn() {
    if (!client) {
      setNotice("Supabase não está conectado nesta publicação.");
      return;
    }
    const { error } = await client.auth.signInWithOAuth({ provider: "github", options: { redirectTo: window.location.origin } });
    if (error) setNotice(`Não foi possível abrir o GitHub: ${error.message}`);
  }

  async function saveContext() {
    if (client && !user) {
      setNotice("Entre com GitHub para salvar a memória do projeto.");
      return;
    }
    setSavingContext(true);
    const updated: ProjectContext = {
      ...context,
      id: "shipflow",
      updated_at: new Date().toISOString(),
      updated_by: "GitHub",
    };
    setContext(updated);
    if (client) {
      const { error } = await client.from("project_context").upsert(updated);
      if (error) {
        setNotice(`Erro ao salvar a memória: ${error.message}`);
        setSavingContext(false);
        return;
      }
      await client.from("activity_events").insert({ account: "Sistema", message: `memória do projeto atualizada: ${updated.next_step}` });
    }
    setNotice("Memória do projeto sincronizada na nuvem");
    setSavingContext(false);
  }

  async function startWork() {
    if (client && !user) {
      setNotice("Entre com GitHub para registrar atividades.");
      return;
    }
    const text = task.trim() || "Tarefa não informada";
    const id = account === "Claude normal" ? "normal" : "gateway";
    const updated: Session = { id, account, status: "working", task: text, next_step: "Atualizar a memória do projeto ao finalizar", files: [], updated_at: new Date().toISOString() };
    setSessions((old) => [...old.filter((item) => item.id !== id), updated]);
    setEvents((old) => [{ id: Date.now(), account, message: `iniciou: ${text}`, created_at: new Date().toISOString() }, ...old]);
    setTask("");
    if (client) {
      const { error } = await client.from("agent_sessions").upsert(updated);
      if (error) {
        setNotice(`Erro ao salvar atividade: ${error.message}`);
        return;
      }
      const event = await client.from("activity_events").insert({ account, message: `iniciou: ${text}` });
      if (event.error) {
        setNotice(`Atividade salva, mas o histórico falhou: ${event.error.message}`);
        return;
      }
      setNotice("Atividade sincronizada na internet");
    }
  }

  async function finishWork() {
    if (client && !user) {
      setNotice("Entre com GitHub para registrar atividades.");
      return;
    }
    const current = sessions.find((item) => item.account === account);
    if (!current) {
      setNotice("Nenhuma tarefa encontrada para finalizar.");
      return;
    }
    const updated = { ...current, status: "finished", next_step: "Atualizar a memória e passar para a próxima conta", updated_at: new Date().toISOString() };
    setSessions((old) => old.map((item) => item.id === current.id ? updated : item));
    if (client) {
      const result = await client.from("agent_sessions").upsert(updated);
      if (result.error) {
        setNotice(`Erro ao finalizar atividade: ${result.error.message}`);
        return;
      }
      await client.from("activity_events").insert({ account, message: `finalizou: ${current.task}` });
    }
    setNotice("Tarefa finalizada — atualize a memória antes de trocar de conta");
  }

  const activeCount = sessions.filter((item) => item.status === "working").length;
  const displayTime = (value: string) => value ? new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
  const updateFiles = (value: string) => setContext((old) => ({ ...old, changed_files: value.split("\n").map((item) => item.trim()).filter(Boolean) }));

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">↔</span><div><strong>Claude Sync</strong><span>painel online</span></div></div>
      <div className="top-actions"><span className="connection"><i />{notice}</span><button className="ghost" onClick={user ? () => client?.auth.signOut() : signIn}>{user ? "Sair" : "Entrar com GitHub"}</button></div>
    </header>
    <div className="content">
      <section className="welcome"><div><p className="eyebrow">PROJETO CONECTADO</p><h1>ShipFlow</h1><p className="sub">Acompanhe as duas contas e preserve o contexto do projeto na nuvem.</p></div><div className="pulse"><b>{activeCount}</b><span>conta{activeCount === 1 ? "" : "s"} trabalhando agora</span></div></section>
      <section className="cards">{sessions.map((item) => <article className="agent-card" key={item.id}><div className="card-head"><div className="avatar">{item.id === "normal" ? "N" : "G"}</div><div><h2>{item.account}</h2><span className={`status ${item.status}`}><i />{item.status === "working" ? "Trabalhando agora" : item.status === "finished" ? "Finalizou" : "Aguardando"}</span></div><span className="time">{mounted ? displayTime(item.updated_at) : "—"}</span></div><div className="task-box"><span>TAREFA ATUAL</span><strong>{item.task}</strong></div><div className="next"><span>Próximo passo</span><b>{item.next_step}</b></div>{item.files.length > 0 && <div className="files">{item.files.slice(0, 3).map((file) => <code key={file}>{file}</code>)}</div>}</article>)}</section>
      <section className="workspace"><div className="section-title"><div><p className="eyebrow">CONTROLE RÁPIDO</p><h2>Atualizar atividade</h2></div><span className="cloud-badge">● salvo na nuvem</span></div><div className="form-grid"><label>Qual conta está trabalhando<select value={account} onChange={(e) => setAccount(e.target.value)}><option>Claude normal</option><option>Claude Gateway</option></select></label><label className="wide">O que está sendo feito<input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Ex.: corrigindo integração com pedidos" /></label></div><div className="buttons"><button className="primary" onClick={startWork}>Iniciar / atualizar tarefa</button><button className="secondary" onClick={finishWork}>Finalizar tarefa</button></div></section>
      <section className="workspace memory"><div className="section-title"><div><p className="eyebrow">MEMÓRIA CENTRAL</p><h2>Contexto do projeto</h2></div><span className="cloud-badge">● compartilhado entre as contas</span></div><div className="form-grid"><label className="wide">Resumo do projeto<textarea value={context.summary} onChange={(e) => setContext({ ...context, summary: e.target.value })} /></label><label className="wide">Estado atual<textarea value={context.current_state} onChange={(e) => setContext({ ...context, current_state: e.target.value })} /></label><label>Última alteração<textarea value={context.last_change} onChange={(e) => setContext({ ...context, last_change: e.target.value })} /></label><label>Próximo passo<textarea value={context.next_step} onChange={(e) => setContext({ ...context, next_step: e.target.value })} /></label><label>Problemas pendentes<textarea value={context.blockers} onChange={(e) => setContext({ ...context, blockers: e.target.value })} /></label><label>Commit ou versão<textarea value={context.commit_sha} onChange={(e) => setContext({ ...context, commit_sha: e.target.value })} /></label><label className="wide">Arquivos alterados — um por linha<textarea value={context.changed_files.join("\n")} onChange={(e) => updateFiles(e.target.value)} /></label></div><div className="buttons"><button className="primary" onClick={saveContext} disabled={savingContext}>{savingContext ? "Salvando…" : "Salvar memória do projeto"}</button></div></section>
      <section className="activity"><div className="section-title"><div><p className="eyebrow">HISTÓRICO AO VIVO</p><h2>Últimas atividades</h2></div><span className="live"><i /> atualização em tempo real</span></div>{events.slice(0, 8).map((event) => <div className="event" key={event.id}><span className="event-dot" /><div><b>{event.account}</b><span>{event.message}</span></div><time>{mounted ? displayTime(event.created_at) : "—"}</time></div>)}</section>
    </div>
  </main>;
}
