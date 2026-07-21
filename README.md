# nook

Uma sala pequena na internet. Você abre, joga umas fotos na parede, cola bilhetes,
bota uma música pra tocar, e manda o link pra alguém. Quem entra vê tudo do jeito
que você deixou, e vê acontecer ao vivo.

Foi feito por saudade do Here.fm.

## O que dá pra fazer lá dentro

Uma sala é uma tela infinita. Você arrasta, gira e redimensiona qualquer coisa
que colocar nela, e tudo fica salvo onde você largou.

- **Fotos e GIFs** — arrasta do desktop, cola do clipboard (Ctrl+V) ou joga uma
  URL. GIFs animam normalmente. Tem quatro molduras: lisa, com sombra, polaroid
  e adesivo.
- **Bilhetes** e **texto grande** — dois cliques pra escrever. O que você digita
  aparece pros outros enquanto digita.
- **Desenhar na sala** — um pincel que pinta direto na tela infinita, com
  paleta de cores, cor personalizada e espessura. Tem borracha (arrasta em cima
  de um traço pra apagar). Todo traço é compartilhado ao vivo e fica salvo.
- **Música e vídeo em sincronia** — cola um link do **YouTube**, um arquivo de
  áudio direto (**.mp3/.ogg/.wav/.m4a/...**) ou do **SoundCloud** e todo mundo
  ouve/assiste junto. Quem der play, pausar ou arrastar a barra move pra todo
  mundo. Como o navegador não deixa dar autoplay com som sem um clique, quem
  chega entra tocando **mudo** e em sincronia, e clica pra ativar o som. Tem
  fila e um modo só-áudio. (Cada tipo usa a API de controle do próprio provedor
  — por isso sincroniza de verdade. Spotify/Twitch/sites que não expõem controle
  livre vão pra janela de site ou pra transmissão de aba.)
- **Stickers/GIFs** — uma janela de busca de GIFs (Giphy) que solta o GIF na
  parede como objeto, igual o Here.fm. Precisa de uma chave gratuita do Giphy
  (veja abaixo); sem ela o resto do app funciona normal.
- **Janelas** — um iframe pra sites que aceitam ser embedados. Links de Twitch,
  Vimeo, SoundCloud e Spotify são convertidos automaticamente pro player certo.
- **Jogos** — xadrez, damas, velha, lig-4 e uma lousa de rabisco compartilhada
  (com pincel e borracha). Dá pra "sentar" numa cadeira pra marcar de quem é a
  vez, ou deixar solto e qualquer um joga. (O xadrez move as peças pelas regras
  de cada peça, mas não policia xeque/roque/en passant — vocês se acertam, como
  num tabuleiro de verdade.)
- **Decoração** — fundo sólido, degradê, ou uma imagem sua (esticada ou repetida
  em ladrilho, com controle de escurecimento).
- **Chat**, cursores com nome de todo mundo que está online, e reações que
  sobem na tela.

Quando alguém abre o link, primeiro escolhe um apelido e uma cor, e só então
entra na sala. O apelido fica salvo pra próxima vez.

Atalhos: `V` volta pro cursor, `B` pega o pincel, `E` a borracha, espaço arrasta
a tela, Ctrl+scroll dá zoom, Delete apaga o que está selecionado, Ctrl+D
duplica, Ctrl+0 volta pro centro, Esc larga tudo.

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
estado da sala. Supabase pro resto. É exportado como site estático
(`output: "export"`), então o app inteiro roda no navegador e hospeda em
qualquer lugar — a sala a abrir vem no parâmetro `?r=` do endereço
(`/r/?r=cocoa-willow-7fk2`), então não existe rota dinâmica pra um host estático
tropeçar.

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

**2. Rode as migrações.** Abra o SQL Editor do projeto e execute, em ordem, o
conteúdo de `supabase/migrations/0001_init.sql` e depois
`supabase/migrations/0002_strokes.sql`. A primeira cria as tabelas, as policies
de RLS, liga a replicação de tempo real e cria o bucket de imagens. A segunda
adiciona a tabela `strokes`, que guarda os desenhos feitos direto na sala — sem
ela, o pincel não salva. Rode também `0003_cobrowse.sql` e `0004_screencast.sql`
(liberam os tipos de item do navegador compartilhado e da transmissão de aba).

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

O site é exportado estático (`npm run build` gera a pasta `out/`), então sobe em
qualquer host de arquivo estático de graça, com o repositório continuando
privado. O passo a passo pra Cloudflare Pages e pra Vercel está em
[DEPLOY.md](DEPLOY.md). Não tem servidor de socket, nem cron, nem worker — o
Supabase faz tudo pelo navegador.

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

### Chaves de gif/sticker (opcional)

O painel de gifs/stickers busca em vários provedores ao mesmo tempo — se um não
tem o que você procurou, os outros preenchem. Configura pelo menos um:

- **Giphy** (gifs + stickers transparentes): chave gratuita em
  [developers.giphy.com](https://developers.giphy.com) → `NEXT_PUBLIC_GIPHY_KEY`.
- **Klipy** (gifs + stickers, tipo o Discord): chave em
  [partner.klipy.com](https://partner.klipy.com) → `NEXT_PUBLIC_KLIPY_KEY`.

Coloca no `.env.local` (local) ou nas variáveis de ambiente da Cloudflare
(deploy). Sem nenhuma chave, o painel só mostra um aviso e o resto funciona
normal. Obs.: se o Klipy bloquear a chamada direta do navegador (CORS), a busca
dele é ignorada em silêncio e o Giphy continua — nesse caso dá pra pôr um proxy
serverless depois.

## Transmitir uma aba ao vivo (WebRTC)

O item "transmitir uma aba" (botão de monitor com seta pra cima na dock) é o
jeito grátis e em tempo real de compartilhar um site/jogo/música com a sala:

- Quem clica em "escolher aba e transmitir" escolhe uma aba do **próprio
  navegador** (com os próprios logins) no seletor do navegador. Isso resolve o
  problema do YouTube/Spotify: como roda na aba da pessoa, os logins e o player
  funcionam.
- O vídeo e o som vão ao vivo, peer-to-peer (WebRTC), pra todo mundo na sala. A
  sinalização passa pelo canal do Supabase; nada de vídeo toca no banco.
- É um de cada vez, tipo fliperama: quem está "sentado" transmite; os outros
  veem. "Assumir" passa a vez (o anterior para sozinho).

Uma ressalva honesta: a conexão P2P usa só servidores **STUN** públicos, que
conectam a maioria das redes domésticas direto. Uma minoria de redes mais
fechadas precisa de um **TURN** (relay), que não é grátis de forma confiável. Se
a imagem não subir entre duas pessoas, é isso -- dá pra plugar um TURN (ex.:
Cloudflare Calls, Metered) depois. E o compartilhamento é da aba inteira: quem
transmite controla na aba real dele, os outros veem o vídeo dentro do app.

Diferença pro navegador compartilhado (Hyperbeam): ali **os dois controlam** o
mesmo navegador na nuvem (pago); aqui **um transmite** a própria aba e os outros
veem (grátis). Os dois convivem.

## Sobre "compartilhar um site" em tempo real

Dá pra colar um link e todo mundo ver a mesma janela, e dá pra **assistir junto**
com sincronia de verdade (YouTube, Twitch, Vimeo — play/pause/seek batem pra
todos). O que **não** dá pra fazer de graça é duas pessoas *controlarem o mesmo
site qualquer ao mesmo tempo* (rolar, clicar, digitar juntas num site de
terceiros). Isso é uma trava de segurança do navegador: a página não consegue
ler nem controlar o que acontece dentro de um iframe de outro domínio.

Apps que fazem isso (o próprio Here.fm) rodam um navegador **num servidor** e
transmitem os pixels por streaming.

Isso já está implementado como um item opcional ("shared browser" na dock),
usando o [Hyperbeam](https://hyperbeam.com) — é a única parte paga, e vem
desligada até você colar a sua chave. O passo a passo (com os freios de custo)
está em [COBROWSE.md](COBROWSE.md). Sem a chave, o resto do app funciona normal.

## Coisas que ficaram de fora

- Dois traços desenhados no mesmo instante (lousa ou parede): o último a salvar
  ganha. Com três pessoas é raro e barato de aceitar.
- Não tem histórico nem desfazer que atravesse sessões. Apagou, foi.
- Sites que mandam `X-Frame-Options: DENY` não abrem na janela de iframe. Não
  tem jeito pelo lado do cliente; por isso todo embed tem um botão de abrir
  numa aba nova.
