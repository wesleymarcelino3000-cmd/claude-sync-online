import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const HOME = process.env.USERPROFILE || os.homedir();
const SYNC_URL = process.env.SYNC_URL || "https://claude-sync-online.vercel.app/api/agent/heartbeat";
const SYNC_TOKEN = process.env.SYNC_TOKEN;
const ACCOUNT = process.env.ACCOUNT || "Claude normal";
const INTERVAL = 15000;
const CONTEXT_DIR = ".claude-sync";
const CONTEXT_FILE = "contexto-atual.md";
const CLAUDE_MARKER = "CLAUDE SYNC — CONTINUIDADE AUTOMÁTICA";

if (!SYNC_TOKEN) {
  console.error("Defina SYNC_TOKEN antes de iniciar o agente.");
  process.exit(1);
}

const candidates = [
  process.cwd(),
  path.join(HOME, "shipflow"),
  path.join(HOME, "shipflow-portal"),
  path.join(HOME, "Documents", "shipflow"),
  path.join(HOME, "Desktop", "shipflow"),
];

function isProject(folder) {
  try {
    return fs.existsSync(path.join(folder, ".git")) && fs.existsSync(folder);
  } catch {
    return false;
  }
}

function findProject() {
  for (const folder of candidates) if (isProject(folder)) return folder;
  const roots = [HOME, path.join(HOME, "Documents"), path.join(HOME, "Desktop")];
  const skip = new Set(["AppData", "node_modules", ".git", "Windows", "Program Files"]);
  const queue = roots.map((folder) => ({ folder, depth: 0 }));
  while (queue.length) {
    const { folder, depth } = queue.shift();
    if (depth > 4) continue;
    let entries = [];
    try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || skip.has(entry.name)) continue;
      const next = path.join(folder, entry.name);
      if (isProject(next) && /shipflow/i.test(next)) return next;
      queue.push({ folder: next, depth: depth + 1 });
    }
  }
  return null;
}

function git(project, args) {
  try { return execFileSync("git", args, { cwd: project, encoding: "utf8", timeout: 5000 }).trim(); }
  catch { return ""; }
}

function readProjectSummary(project) {
  const files = ["CLAUDE.md", "README.md", "README.MD"];
  for (const file of files) {
    try {
      const text = fs.readFileSync(path.join(project, file), "utf8").trim();
      if (text) return text.replace(/\s+/g, " ").slice(0, 800);
    } catch {}
  }
  return "";
}

function claudeIsRunning() {
  try {
    const output = execFileSync("tasklist", ["/FO", "CSV", "/NH"], { encoding: "utf8", timeout: 5000 });
    return /claude|code/i.test(output);
  } catch {
    return false;
  }
}

async function send(data) {
  const response = await fetch(SYNC_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${SYNC_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Sincronização HTTP ${response.status}`);
}

function keepContinuityOutOfGit(project) {
  try {
    const excludePath = path.join(project, ".git", "info", "exclude");
    let exclude = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf8") : "";
    if (!exclude.split(/\r?\n/).includes(`${CONTEXT_DIR}/`)) {
      exclude = `${exclude.trimEnd()}\n${CONTEXT_DIR}/\n`;
      fs.writeFileSync(excludePath, exclude);
    }
  } catch {}
}

function ensureClaudeInstruction(project) {
  try {
    const claudePath = path.join(project, "CLAUDE.md");
    const instruction = `\n\n## ${CLAUDE_MARKER}\nAntes de iniciar uma tarefa, leia \`.claude-sync/contexto-atual.md\` para continuar o trabalho da outra conta. Esse arquivo é gerado automaticamente pelo Claude Sync.\n`;
    const current = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, "utf8") : "";
    if (!current.includes(CLAUDE_MARKER)) fs.writeFileSync(claudePath, current + instruction);
  } catch {}
}

function writeContinuityFile(project, data) {
  try {
    const directory = path.join(project, CONTEXT_DIR);
    fs.mkdirSync(directory, { recursive: true });
    const files = data.changed_files.length ? data.changed_files.map((file) => `- ${file}`).join("\n") : "- Nenhum arquivo alterado no momento.";
    const content = `# Contexto atual do projeto

> Gerado automaticamente pelo Claude Sync em ${new Date().toLocaleString("pt-BR")}.

## Projeto
- Nome: ${data.project_name}
- Conta que atualizou: ${data.account}
- Branch: ${data.branch || "não identificada"}

## Estado atual
${data.current_state}

## Última alteração
${data.last_change || "Nenhuma alteração registrada."}

## Próximo passo
${data.next_step}

## Arquivos alterados
${files}

## Instrução para a próxima conta
Leia este arquivo antes de começar. Continue a partir do estado descrito e atualize o projeto normalmente. O arquivo é apenas um resumo operacional; não contém tokens ou senhas.
`;
    fs.writeFileSync(path.join(directory, CONTEXT_FILE), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(content, "utf8")]));
    keepContinuityOutOfGit(project);
    ensureClaudeInstruction(project);
  } catch (error) {
    console.error(`Não foi possível escrever o contexto local: ${error.message}`);
  }
}

let lastActivity = Date.now();
let watchedProject = null;

function watch(project) {
  if (watchedProject === project) return;
  watchedProject = project;
  try {
    fs.watch(project, { recursive: true }, (_event, filename) => {
      if (filename && !/node_modules|\.git|\.claude-sync/i.test(filename)) lastActivity = Date.now();
    });
  } catch {}
}

async function heartbeat() {
  const project = findProject();
  if (!project) {
    console.log("Projeto ShipFlow não encontrado. Tentando novamente...");
    return;
  }

  watch(project);
  const changed = git(project, ["status", "--porcelain"])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((file) => !file.startsWith(`${CONTEXT_DIR}/`))
    .slice(0, 100);
  const branch = git(project, ["branch", "--show-current"]);
  const commit = git(project, ["rev-parse", "--short", "HEAD"]);
  const commitMessage = git(project, ["log", "-1", "--pretty=format:%h — %s"]);
  const recent = Date.now() - lastActivity < 120000;
  const status = claudeIsRunning() || recent ? "working" : "paused";
  const remote = git(project, ["config", "--get", "remote.origin.url"]);
  const projectName = path.basename(project);
  const projectSummary = readProjectSummary(project);
  const statusText = status === "working" ? "Em trabalho" : "Aguardando alterações";
  const currentState = `${statusText}; ${changed.length} arquivo(s) alterado(s); branch ${branch || "não identificada"}.`;
  const nextStep = changed.length
    ? "Revisar e concluir as alterações detectadas."
    : "Aguardar a próxima alteração no projeto.";

  const contextData = {
    project_name: projectName,
    account: ACCOUNT,
    branch,
    current_state: currentState,
    last_change: commitMessage || (recent ? "Alteração local detectada" : ""),
    next_step: nextStep,
    changed_files: changed,
  };
  writeContinuityFile(project, contextData);

  try {
    await send({
      agent_id: `${ACCOUNT}-${os.hostname()}`,
      account: ACCOUNT,
      project_name: projectName,
      repo_url: remote,
      branch,
      status,
      changed_files: changed,
      last_commit: commit,
      last_activity_at: new Date(lastActivity).toISOString(),
      project_context: {
        summary: projectSummary || undefined,
        current_state: currentState,
        last_change: contextData.last_change,
        changed_files: changed,
        next_step: nextStep,
        commit_sha: commit,
        updated_by: ACCOUNT,
      },
    });
    console.log(`[${new Date().toLocaleTimeString()}] ${status} — ${projectName} — ${changed.length} arquivo(s)`);
  } catch (error) {
    console.error(error.message);
  }
}

heartbeat();
setInterval(heartbeat, INTERVAL);
