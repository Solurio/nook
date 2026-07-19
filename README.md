# nook

Uma sala pequena na internet. Você abre, joga umas fotos na parede, cola bilhetes,
bota uma música pra tocar, e manda o link pra alguém. Quem entra vê tudo do jeito
que você deixou, e vê acontecer ao vivo.

Foi feito por saudade do Here.fm.

## O que dá pra fazer lá dentro

Uma sala é uma tela infinita. Você arrasta, gira e redimensiona qualquer coisa
que colocar nela, e tudo fica salvo onde você largou.

- **Fotos** — arrasta do desktop, cola do clipboard (Ctrl+V) ou joga uma URL.
  Tem quatro molduras: lisa, com sombra, polaroid e adesivo.
- **Bilhetes** e **texto grande** — dois cliques pra escrever. O que você digita
  aparece pros outros enquanto digita.
- **Música e vídeo em sincronia** — cola um link do YouTube e todo mundo assiste
  junto. Quem der play, pausar ou arrastar a barra move o vídeo pra todo mundo.
  Tem fila, e um modo só-áudio pra quando é pra ser rádio de fundo.
- **Janelas** — um iframe pra qualquer site que aceite ser embedado.
- **Jogos** — velha, lig-4 e uma lousa de rabisco compartilhada. Nos dois
  primeiros dá pra "sentar" numa cadeira pra marcar de quem é a vez, ou deixar
  solto e qualquer um joga.
- **Decoração** — fundo sólido, degradê, ou uma imagem sua (esticada ou repetida
  em ladrilho, com controle de escurecimento).
- **Chat**, cursores com nome de todo mundo que está online, e reações que
  sobem na tela.

Atalhos: espaço arrasta a tela, Ctrl+scroll dá zoom, Delete apaga o que está
selecionado, Ctrl+D duplica, Ctrl+0 volta pro centro, Esc larga tudo.

## Como isso funciona

O único serviço de verdade é o Supabase, e ele faz três papéis ao mesmo tempo:
banco (Postgres), tempo real, e storage das imagens que você sobe. Isso é de
propósito — dá pra ter persistência e tempo real sem manter servidor nenhum
rodando, e cabe folgado no plano gratuito pra um punhado de pessoas.

O tempo real é dividido em duas faixas, porque as duas coisas têm exigências
opostas:

- **Coisas que precisam sobreviver** (um item criado, movido pro lugar final,
  uma mensagem, o estado de um jogo) vão pro Postgres. O Supabase reemite essas
  mudanças via `postgres_changes` pra todo mundo na sala. É mais lento, mas quem
  chegar depois vê exatamente o mesmo que os outros — não existe estado que só
  vive na memória de alguém.
- **Coisas descartáveis** (posição do cursor, o item enquanto ainda está sendo
  arrastado, o traço do rabisco em andamento) vão por `broadcast`, que não toca
  no banco. São dezenas de mensagens por segundo que não têm valor nenhum cinco
  segundos depois, e gravar isso só queimaria cota.

Na prática você arrasta uma foto: durante o arrasto os outros veem ela deslizar
por broadcast; quando você solta, uma linha do Postgres é atualizada e essa
é a versão que fica. Se alguém entrar no meio do arrasto, pega a posição final.

Vídeo sincronizado não fica mandando "estou no segundo 43" de tempo em tempo.
O que fica salvo é um par: a posição do vídeo e o instante em que ela foi
medida. Cada cliente extrapola dali sozinho, e a cada segundo e meio compara
com o próprio player — se a diferença passar de 1,4s, corrige. Isso segura a
sincronia mesmo com gente entrando e saindo, e sobrevive a uma aba que ficou
em segundo plano.

### Stack

Next.js 16 (App Router) com React 19, TypeScript, Tailwind v4 e Zustand pro
estado da sala. Supabase pro resto. Deploy na Vercel.

### Permissões

A sala é *unlisted*, não secreta: o link é a chave. Quem tem o link entra e
mexe. Se você quiser congelar, o dono da sala tem um cadeado no topo — com ele
fechado, só o dono edita, e o resto vira somente leitura. Isso é aplicado por
RLS no Postgres, não só escondendo botão na interface.

Ninguém cria conta. Na primeira visita o Supabase emite uma sessão anônima e
o apelido/cor ficam no localStorage.

## Rodando

Precisa de Node 20+ e de um projeto Supabase (o plano gratuito serve).

**1. Crie o projeto no Supabase.** Em [supabase.com](https://supabase.com),
crie um projeto novo. Escolha a região mais perto de vocês, isso mexe direto na
latência do tempo real.

**2. Rode a migração.** Abra o SQL Editor do projeto, cole o conteúdo de
`supabase/migrations/0001_init.sql` e execute. Isso cria as tabelas, as
policies de RLS, liga a replicação de tempo real e cria o bucket de imagens.

**3. Ligue o login anônimo.** Em *Authentication → Sign In / Providers*,
habilite **Anonymous sign-ins**. Sem isso ninguém consegue entrar, porque toda
escrita depende de ter uma sessão.

**4. Configure as chaves.**

```bash
cp .env.example .env.local
```

Preencha com a URL do projeto e a chave anon/publishable (ficam em
*Project Settings → API*). São chaves públicas, podem ir pro navegador — quem
protege os dados é o RLS.

**5. Suba.**

```bash
npm install
npm run dev
```

Abre em `http://localhost:3000`.

### Publicando

Importe o repositório na Vercel, coloque as mesmas duas variáveis de ambiente
em *Settings → Environment Variables*, e faz deploy. Não precisa de mais nada:
não tem servidor de socket, não tem cron, não tem worker.

O plano gratuito do Supabase dá 500MB de banco, 1GB de storage, 200 conexões
simultâneas de tempo real e 2 milhões de mensagens por mês. Pra três pessoas
isso não chega nem perto de encostar no teto. O que acaba primeiro, se acabar,
é o storage — cada imagem que vocês sobem fica lá pra sempre.

Um detalhe do plano gratuito: projetos Supabase sem nenhum acesso por uma
semana entram em pausa e precisam ser reativados no painel. Se a sala for
ficar meses parada, vale saber disso antes de mandar o link pra alguém.

## Comandos

```bash
npm run dev        # desenvolvimento
npm run build      # build de produção
npm run test       # testes da lógica pura (jogos, parsers, sincronia)
npm run check      # typecheck + lint + testes
```

Os testes cobrem o que dá pra testar sem navegador: detecção de vitória nos
jogos, o parser de links do YouTube, a projeção do playhead e a normalização de
slug. O resto (arrastar, o player, a sincronia de verdade entre duas abas) é
teste na mão, com duas janelas abertas lado a lado.

## Coisas que ficaram de fora

- Dois traços desenhados no mesmo instante na lousa: o último a salvar ganha, e
  o outro se perde. Com três pessoas é raro e barato de aceitar.
- Não tem histórico nem desfazer que atravesse sessões. Apagou, foi.
- Sites que mandam `X-Frame-Options: DENY` não abrem na janela de iframe. Não
  tem jeito pelo lado do cliente; por isso todo embed tem um botão de abrir
  numa aba nova.
