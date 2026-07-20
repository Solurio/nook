# Colocando o Nook no ar

O site é exportado como um monte de arquivos estáticos (`out/`), sem servidor.
Isso quer dizer que dá pra hospedar em qualquer lugar que sirva arquivo estático,
de graça, e o link funciona pra sempre sem ninguém precisar rodar nada. Seus
amigos só digitam o endereço.

O repositório continua **privado**. Nenhum segredo mora nele: as duas variáveis
de ambiente ficam no painel do host, não no código. A chave `anon` do Supabase é
pública por natureza (vai embutida no JavaScript de qualquer jeito) e quem
protege os dados é o RLS, não o segredo dela.

Antes de qualquer coisa, rode as migrações do banco (veja o README): sem a tabela
`strokes` da migração `0002`, o desenho na sala não salva.

## Opção A — Cloudflare Pages (recomendada)

De graça, repo privado, e um domínio fixo tipo `nook.pages.dev`.

1. Em [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** →
   **Create** → **Pages** → **Connect to Git**. Autorize e escolha o repo
   `Solurio/nook`.
2. Nas configurações de build:
   - **Framework preset:** Next.js (Static HTML Export). Se não tiver esse preset,
     use "None" e preencha à mão.
   - **Build command:** `npm run build`
   - **Build output directory:** `out`
3. Em **Environment variables** (Production), adicione as duas:
   - `NEXT_PUBLIC_SUPABASE_URL` = a URL do seu projeto Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = a chave anon/publishable
4. **Save and Deploy.**

Pronto. Cada `git push` na branch `main` faz um deploy novo sozinho. O endereço
é o `nook.pages.dev` (ou o nome que você escolher).

## Opção B — Vercel

Também de graça e com repo privado. O domínio sai como `nook-xxxx.vercel.app`.

1. Em [vercel.com/new](https://vercel.com/new), importe o repo `Solurio/nook`.
2. A Vercel detecta Next.js. Não precisa mexer no build; o `output: "export"` do
   `next.config.ts` faz ela servir os arquivos estáticos.
3. Em **Environment Variables**, adicione `NEXT_PUBLIC_SUPABASE_URL` e
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. **Deploy.**

## Sobre "privado"

O *endereço* do site é acessível por qualquer um que o tenha — não dá pra deixar
a página em si trancada num plano gratuito. Mas isso não vaza nada: a página é só
a casca do app. O que importa são as **salas**, e cada sala tem um slug
impossível de adivinhar (tipo `cocoa-willow-7fk2`) protegido por RLS no banco.
Ninguém entra numa sala sem o link dela. É o mesmo modelo do Here.fm: o link é a
chave.

Se um dia quiser trancar de vez, o dono da sala tem o cadeado no topo — com ele
fechado, só o dono edita.

## Domínio próprio (opcional)

Tanto a Cloudflare quanto a Vercel deixam apontar um domínio seu de graça
(você só paga o registro do domínio, se quiser um). Nas duas é em
**Custom domains** dentro do projeto.

## Rodando local pra desenvolver

```bash
cp .env.example .env.local   # e preencha as duas chaves
npm install
npm run dev                  # http://localhost:3000
```
