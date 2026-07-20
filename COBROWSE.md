# Navegador compartilhado ao vivo (Hyperbeam)

Isto liga o item "shared browser" da dock: você cola um link, e **todo mundo na
sala controla o mesmo navegador ao mesmo tempo** — clicar, rolar, digitar juntos,
pela internet. É o co-browsing de verdade que um iframe normal não consegue
fazer.

Isso usa o [Hyperbeam](https://hyperbeam.com), que roda um navegador na nuvem e
transmite pra sala. É a **única parte paga** do Nook. Todo o resto continua de
graça.

## O que já está pronto no código

- O item, o botão na dock, "trocar link" e "fechar sessão".
- A função serverless (`functions/api/cobrowse.js`) que cria e encerra a sessão.
  Ela guarda a chave do Hyperbeam **no servidor** — a chave nunca chega no
  navegador nem fica no repositório.
- Freios de custo: a sessão se encerra sozinha **3 minutos** depois que todo
  mundo sai (`OFFLINE_TIMEOUT` no arquivo da função), e o botão "fechar" mata a
  sessão na hora.

Falta só você criar a conta e colar a chave. Uns 10 minutos.

## Passo a passo

**1. Crie a conta e pegue a chave.**
Em [hyperbeam.com](https://hyperbeam.com), cria a conta e vai no dashboard pegar
a **API key** (fica em algo como Settings / API Keys). Guarda ela — é secreta.

**2. Coloque a chave na Cloudflare (não no código).**
No painel da Cloudflare Pages → seu projeto `nook` → **Settings → Environment
variables → Production**. Adiciona:

- `HYPERBEAM_API_KEY` = a chave que você pegou. **Marca como "secret"** (encrypt).

E, pra deixar só quem está na sala poder abrir sessão (protege o bolso de
abuso), adiciona também estas duas (os mesmos valores do Supabase que você já
usa, mas **sem** o prefixo `NEXT_PUBLIC_`):

- `SUPABASE_URL` = a URL do seu Supabase
- `SUPABASE_ANON_KEY` = a chave anon do Supabase

> Se você pular essas duas, o navegador compartilhado ainda funciona, mas
> qualquer um que abrir o site poderia disparar uma sessão. Com elas, só quem
> entrou na sala consegue. Recomendo colocar.

**3. Rode a migração do banco.**
No SQL Editor do Supabase, roda `supabase/migrations/0003_cobrowse.sql` (deixa o
banco aceitar o novo tipo de item).

**4. Re-deploya.**
Um `git push` (ou "Retry deployment" na Cloudflare) e pronto. As variáveis novas
entram no próximo build.

## Como usar

1. Na sala, clica no botão de **monitor** (shared browser) na dock.
2. Seleciona o item, cola um link, "abrir juntos".
3. A sessão sobe e todo mundo na sala passa a controlar o mesmo navegador.
4. "Trocar link" (o ícone de setas) troca o site sem abrir sessão nova à toa.
5. "Fechar" (o X) encerra a sessão — **use quando terminar, pra não gastar à
   toa.**

## Custo e como não tomar susto

- O Hyperbeam cobra **por hora de sessão ativa**, não assinatura fixa. Confere o
  preço atual no painel deles.
- Pro seu teto de ~R$50/mês, o que segura é: fechar a sessão quando acabar, e o
  timeout de 3 min que mata sessão abandonada. Se quiser ainda mais apertado,
  baixa o `OFFLINE_TIMEOUT` em `functions/api/cobrowse.js` (ex.: 60 segundos).
- Cada item "shared browser" aberto = uma sessão. Não deixa vários abertos.

## Detalhe importante

O navegador compartilhado é uma sessão **ao vivo**, não um objeto permanente.
Foto e bilhete ficam pra sempre; a sessão de co-browse encerra quando todo mundo
sai (ou no "fechar"). Quando isso acontece, o item mostra "sessão encerrada" com
um botão pra abrir de novo. Isso é da natureza da coisa, não é bug.

## Local

A função `/api/cobrowse` só existe no deploy da Cloudflare. Rodando `npm run dev`
local, o botão vai dizer que não está configurado — normal. Testa no site
publicado.
