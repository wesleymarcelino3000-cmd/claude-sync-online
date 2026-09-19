# Claude Sync Online

Painel online para acompanhar Claude normal e Claude Gateway no projeto ShipFlow.

## O que o painel sincroniza

- Login seguro pelo GitHub.
- Status e tarefa atual das duas contas.
- Histórico de atividades em tempo real.
- Memória central do projeto: resumo, estado atual, arquivos alterados, problemas, próximo passo e commit.
- Dados persistidos no Supabase para a próxima conta continuar sem perder contexto.

## Configuração

1. Crie um projeto no Supabase.
2. Execute `supabase/schema.sql`.
3. Execute `supabase/project-context.sql`.
4. Configure as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
5. Execute `npm install` e `npm run dev`.

O GitHub permanece como fonte oficial do código; o Supabase guarda o contexto operacional e o histórico.
