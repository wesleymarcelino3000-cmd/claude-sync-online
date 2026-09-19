# Claude Sync Agent

Agente Windows que encontra automaticamente o projeto ShipFlow e envia presença para o painel Claude Sync.

## Requisitos

- Windows 10/11
- Node.js 20 ou superior
- Variável `SYNC_TOKEN` configurada na Vercel
- SQL de `supabase/agent-presence.sql` executado no Supabase

## Executar

No PowerShell:

```powershell
cd caminho\\claude-sync-online\\agent
$env:SYNC_TOKEN="COLOQUE_A_MESMA_CHAVE_DA_VERCEL"
$env:ACCOUNT="Claude normal"
node claude-sync-agent.mjs
```

O agente procura automaticamente `shipflow`, `shipflow-portal` e repositórios Git dentro do usuário do Windows. Ele envia somente status, branch, commit e nomes de arquivos modificados.
