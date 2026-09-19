import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const HOME = process.env.USERPROFILE || os.homedir();
const SYNC_URL = process.env.SYNC_URL || "https://claude-sync-online.vercel.app/api/agent/heartbeat";
const SYNC_TOKEN = process.env.SYNC_TOKEN;
const ACCOUNT = process.env.ACCOUNT || "Claude normal";
const INTERVAL = 15000;

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

let lastActivity = Date.now();
let watchedProject = null;

function watch(project) {
  if (watchedProject === project) return;
  watchedProject = project;
  try {
    fs.watch(project, { recursive: true }, (_event, filename) => {
      if (filename && !/node_modules|\.git/i.test(filename)) lastActivity = Date.now();
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
  const changed = git(project, ["status", "--porcelain"]).split("\n").filter(Boolean).map((line) => line.slice(3)).slice(0, 100);
  const branch = git(project, ["branch", "--show-current"]);
  const commit = git(project, ["rev-parse", "--short", "HEAD"]);
  const recent = Date.now() - lastActivity < 120000;
  const status = claudeIsRunning() || recent ? "working" : "paused";
  const remote = git(project, ["config", "--get", "remote.origin.url"]);
  const projectName = path.basename(project);
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
    });
    console.log(`[${new Date().toLocaleTimeString()}] ${status} — ${projectName} — ${changed.length} arquivo(s)`);
  } catch (error) {
    console.error(error.message);
  }
}

heartbeat();
setInterval(heartbeat, INTERVAL);
