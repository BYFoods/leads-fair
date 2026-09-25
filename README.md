# Fair Leads v2 — BY Foods

App para registar contactos em feiras: scan do cartão de visita com IA, email de follow-up enviado da caixa Microsoft 365 de cada comercial, relatório de abertura/clique/resposta, lembretes automáticos e criação do contacto + oportunidade no Odoo.

```
web/                      → a app (Netlify publica esta pasta)
supabase/migrations/      → SQL: 001 (original, NÃO correr), 002 (correr uma vez), 003 (agendamento)
supabase/functions/       → funções no servidor (Supabase Edge Functions)
  read-card               → lê o cartão com IA (Claude)
  send-email              → envia o email / lembrete pela conta Microsoft 365 do utilizador
  track                   → regista aberturas (imagem invisível) e cliques na brochura
  reminders               → de hora a hora: deteta respostas, envia lembretes, re-tenta Odoo
  odoo-sync               → cria/atualiza empresa, contacto e oportunidade no Odoo
```

**Os dados existentes não são tocados.** A migração 002 só acrescenta colunas/tabelas; nenhuma linha é apagada. Mesmo assim, antes de começar: Supabase → Table Editor → `leads` → Export → CSV (cópia de segurança).

A app funciona por fases: depois do passo 3 já tem a nova leitura de cartões e a equipa. Enquanto o Microsoft 365 (passo 5) não estiver ligado, o botão de email abre o Outlook como antes. Enquanto o Odoo (passo 6) não estiver ligado, simplesmente não sincroniza.

---

## 1. GitHub
1. Criar um repositório privado (ex.: `byfoods/fair-leads`) e enviar esta pasta para lá.
2. Em *Settings → Secrets and variables → Actions* criar:
   - `SUPABASE_ACCESS_TOKEN` — em supabase.com/dashboard/account/tokens (conta com acesso ao projeto)
   - `SUPABASE_PROJECT_REF` — `zmkgmebzeagtdxhdiyuo`

## 2. Alojamento da app
A app é só um conjunto de ficheiros estáticos (pasta `web/`), por isso pode ficar **no servidor do website da empresa** (recomendado) ou no Netlify. Os dados continuam no Supabase em qualquer dos casos.

### Opção recomendada — servidor da empresa (ex.: `https://leads.byfoodsglobal.com`)
1. No painel do alojamento (cPanel/Plesk…): criar o subdomínio `leads` com **HTTPS** (Let's Encrypt). HTTPS é obrigatório — sem ele o telemóvel não deixa usar a câmara.
2. Criar uma conta FTP limitada à pasta desse subdomínio.
3. No GitHub → *Settings → Secrets and variables → Actions*:
   - **Variables**: `FTP_SERVER` (ex.: `ftp.byfoodsglobal.com`), `FTP_DIR` (pasta do subdomínio, a terminar em `/`, ex.: `/public_html/leads/`)
   - **Secrets**: `FTP_USERNAME`, `FTP_PASSWORD`
4. Cada `git push` publica automaticamente (ação *Deploy app to web server*). Sem GitHub: basta copiar o conteúdo de `web/` por FTP.
5. Supabase → Authentication → URL Configuration: *Site URL* = `https://leads.byfoodsglobal.com`.

O `web/.htaccess` (servidores Apache) força HTTPS. Se o servidor for FTP simples sem FTPS, mudar `protocol: ftps` para `ftp` no ficheiro `.github/workflows/deploy-web-ftp.yml`.

### Alternativa — Netlify
Duas opções:
- **A (manter o endereço atual)** — quem é dono do site `crm-miguel-byfoods` abre *Site configuration → Build & deploy → Link repository*, escolhe o repositório, branch `main`, *publish directory* `web`, build command vazio. Deve também convidar os colegas (*Team → Members*, o plano grátis permite).
- **B (novo site na conta da empresa)** — *Add new site → Import from Git* → o repositório. O `netlify.toml` já diz para publicar `web`.

Depois disto, cada `git push` publica a app automaticamente.

## 3. Supabase — base de dados e utilizadores
1. **SQL Editor → New query** → colar `supabase/migrations/002_team_email_odoo.sql` → *Run*.
2. **Authentication → Sign In / Providers**: desligar *Allow new users to sign up* (só entra quem for convidado — importante, porque a equipa vê todos os leads).
3. **Authentication → URL Configuration**: *Site URL* = endereço da app (servidor da empresa ou Netlify).
   Depois correr também `supabase/migrations/004_source.sql` (regista se o lead veio de cartão, badge, QR ou manual).
4. **Authentication → Users → Invite user**: convidar cada comercial **com o email Microsoft 365 dele** (ex.: `nc@byfoodsglobal.com`). Recebem um link e escolhem a password na app.

## 4. Funções no servidor
1. **Edge Functions → Secrets** — adicionar `ANTHROPIC_API_KEY` (se ainda não existir; console.anthropic.com). Opcional: `OCR_MODEL` (por omissão `claude-sonnet-5`; para mais barato `claude-haiku-4-5-20251001`).
2. Fazer push para o GitHub → a ação *Deploy Supabase functions* publica as 5 funções (ou *Actions → Run workflow*).
   Alternativa local: `supabase functions deploy --project-ref zmkgmebzeagtdxhdiyuo`.

A partir daqui o scan usa IA (custo aproximado de 1 cêntimo por cartão).

## 5. Microsoft 365 — envio, aberturas, respostas (precisa do administrador de TI)
1. portal.azure.com → **Microsoft Entra ID → App registrations → New registration** → nome "Fair Leads", *single tenant*.
2. **API permissions → Add → Microsoft Graph → Application permissions**: `Mail.Send` e `Mail.ReadBasic.All` → **Grant admin consent**.
   - `Mail.ReadBasic.All` só lê remetente/data (não o conteúdo) e serve para detetar respostas.
3. **Certificates & secrets → New client secret** → copiar o *Value*.
4. Em Supabase → Edge Functions → Secrets: `MS_TENANT_ID`, `MS_CLIENT_ID` (Application ID), `MS_CLIENT_SECRET`.
5. **Recomendado (segurança):** limitar a app às caixas da equipa comercial com uma *Application Access Policy* no Exchange:
   ```powershell
   New-ApplicationAccessPolicy -AppId <MS_CLIENT_ID> -PolicyScopeGroupId comerciais@byfoodsglobal.com -AccessRight RestrictAccess -Description "Fair Leads"
   ```
6. Agendamento de hora a hora:
   - Secrets: `CRON_SECRET` = uma palavra-passe longa qualquer.
   - Database → Extensions: ligar `pg_cron` e `pg_net`.
   - SQL Editor: colar `supabase/migrations/003_schedule.sql`, substituir os dois valores `<<< >>>`, *Run*.

Como funciona: o email sai da caixa de quem carrega em enviar e fica nos *Itens Enviados*. A cada hora o sistema vê se o contacto respondeu (qualquer email dele depois do envio). Sem resposta ao fim de *N* dias (definido por cada um em Settings, por omissão 5 dias, máx. 2 lembretes), envia um lembrete "Re: …" — só em dias úteis, 9h–18h de Lisboa. Pode desligar-se por contacto ("auto-remind").

Sobre as aberturas: são aproximadas. O Apple Mail pode marcar como aberto sem a pessoa ter lido, e o Outlook às vezes bloqueia imagens. O **clique na brochura** e a **resposta** são os sinais fiáveis.

## 6. Odoo
1. No Odoo, com um utilizador que possa criar contactos e oportunidades no CRM: *Preferências → Segurança da conta → Nova chave API*.
2. Secrets no Supabase: `ODOO_URL` (ex.: `https://byfoods.odoo.com`), `ODOO_DB` (nome da base de dados), `ODOO_USER` (login desse utilizador), `ODOO_API_KEY`.
3. Opcional: em `web/config.js`, `ODOO_URL` para o selo "Odoo ✓" abrir a oportunidade.

Ao guardar um lead: procura/cria a **empresa**, procura (pelo email) ou cria o **contacto**, cria uma **oportunidade** no pipeline com a feira como etiqueta e o comercial como vendedor (se o email dele for um utilizador Odoo). Emails enviados, lembretes e respostas ficam como notas no histórico da oportunidade. Se falhar, aparece "Odoo ✗ retry" e o sistema tenta de novo de hora a hora.

Usa a API JSON-RPC (`/jsonrpc`), disponível no Odoo 14 a 19.

## Uso diário
- **Settings**: o seu nome, brochura, feira atual, dias para lembrete, textos do primeiro email e do lembrete em 5 línguas (EN/FR/ES/DE/PT).
- **📷 Card** → fotografar → confirmar campos → (+ Back side se houver verso) → *Save lead*. Com a caixa "Send the follow-up email" marcada, o email sai logo.
- **🪪 Badge** → fotografar o badge da feira: a IA lê nome, empresa, cargo e país impressos; se o QR do badge tiver contactos (vCard), esses dados têm prioridade. Muitos badges só têm um código interno da organização — fica nas notas.
- **▦ QR / e-contact** → abre a câmara e lê em direto QR codes de cartões digitais (vCard, MeCard), de ecrãs de telemóvel ou de badges. Se o QR for apenas um link (ex.: Linktree, perfil), fica nas notas.
- Os cartões em papel com QR também são aproveitados: os dados do QR são exatos e ganham ao que a IA lê.
- A lista mostra toda a equipa, quem scanou, e o estado: Not sent → Sent → Opened ×n → Brochure opened → Replied. Passe o rato no estado para ver datas.
- Filtros: só os meus, por estado, por língua. *Export CSV* exporta o que está filtrado.
