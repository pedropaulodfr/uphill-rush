# Serra Turbo — guia de continuidade para IAs

Este documento resume tudo o que já foi feito no jogo, como o código está organizado e quais cuidados tomar ao continuar o trabalho. Leia antes de alterar qualquer arquivo.

## 1. O que é o jogo

**Serra Turbo** é um jogo 2D de motocross para navegador, feito em HTML, CSS e JavaScript puro (sem frameworks e sem imagens externas). O jogador leva a moto até a bandeira de chegada de cada fase, dentro do tempo, sem bater a cabeça no chão.

- O jogo foi inspirado na jogabilidade de *Uphill Rush*, mas **não copia** nome, personagens, arte, fases nem visual. Todo o cenário, a moto e o piloto são desenhados por código e são originais. Mantenha isso em qualquer mudança.
- O repositório se chama `uphill-rush`, mas o nome do jogo é **Serra Turbo**.
- Textos da interface e comentários do código estão em **português do Brasil**.

### Controles

| Tecla | Ação |
|---|---|
| ↑ / W | Acelerar |
| ↓ / S | Frear; parado, vira ré |
| ← / A | Inclinar para trás (empinar) |
| → / D | Inclinar para frente |
| Espaço (ou Shift esquerdo) | Turbo |
| P / Esc | Pausar |
| M | Som liga/desliga |

Em telas de toque aparecem botões na tela (◀ ▶ T ▼ ▲).

### Regras

- 6 fases, 4 vidas, tempo limite por fase.
- Estrelas (+100), cápsulas de turbo (+50 e +1 barra), checkpoints (+200) em 33% e 66% da pista.
- Mortais no ar: +500 × (número de voltas)². Saltos acima de 0,75 s também pontuam.
- Ao terminar a fase: bônus de tempo (10 por segundo restante) e +1000 se pegar todas as estrelas.
- Queda: perde uma vida e renasce no trecho mais plano até 320 px antes do último checkpoint.
- Tempo esgotado: perde uma vida e o tempo reinicia.

## 2. Como rodar

Não há build. Basta servir a pasta por HTTP (os scripts são arquivos separados, então abrir pelo `file://` pode não carregar tudo em alguns navegadores):

```bash
python -m http.server 8765
```

Depois abra `http://localhost:8765`.

Atenção ao **cache do navegador**: depois de editar um `.js`, use Ctrl+F5. Nos testes automatizados, recarregue os arquivos com `fetch(arquivo, {cache: 'reload'})` antes de `location.reload()`.

### Sobre o `index.html`

O `index.html` **não tem** `<!doctype html>`, `<html>`, `<head>` nem a meta `viewport`. Isso é proposital: o jogo também é publicado como *Artifact* no claude.ai, que já embrulha a página com essas partes. Para hospedar como site comum (ex.: GitHub Pages), vale adicionar `<!doctype html>` e `<meta name="viewport" content="width=device-width, initial-scale=1">`; sem isso o jogo funciona, mas o navegador entra em modo de compatibilidade e, no celular, a tela pode abrir afastada.

A única dependência externa é a fonte do Google Fonts (Lilita One e Nunito). Sem internet, o jogo usa fontes de reserva.

## 3. Estrutura dos arquivos

```
index.html        HUD, telas e botões de toque; carrega os scripts na ordem certa
style.css         visual do HUD, das telas (cards), da seleção de fases e dos botões de toque
js/physics.js     física da moto (separada do desenho)
js/sprites.js     paletas dos ambientes e geração procedural de sprites, texturas e faixas de fundo
js/particles.js   sistema de partículas com pool fixo
js/scenery.js     desenho do céu, parallax, terreno, itens, primeiro plano, clima e efeitos de tela
js/bike.js        desenho da moto e do piloto (só lê o estado da física)
js/game.js        regras, fases, terreno, câmera, HUD, telas, entrada, áudio e laço principal
```

**Ordem de carregamento** (no fim do `index.html`): `physics.js`, `sprites.js`, `particles.js`, `scenery.js`, `bike.js`, `game.js`. Todos os módulos se registram no objeto global `window.Serra` (`Serra.Physics`, `Serra.util`, `Serra.ART`, `Serra.Assets`, `Serra.Particles`, `Serra.Scenery`, `Serra.BikeRenderer`). O `game.js` é uma IIFE e não expõe nada além do gancho de testes `window.__serra`.

## 4. Laço principal e resolução

- A lógica roda em **960×540** (constantes `W`, `H`). O palco (`#stage`) é escalado por CSS para caber na janela, e o canvas ganha até 2× mais pixels para ficar nítido (`fit()` e `renderScale` em `game.js`). Nunca mude a resolução lógica sem revisar tudo.
- **Passo fixo**: a física avança sempre em passos de `DT = 1/120 s` (função `advance(dt)` em `game.js`). Cada passo tem 8 subpassos dentro de `physics.js`.
- **Interpolação**: o desenho e a câmera usam `vb`, uma vista interpolada da moto entre os dois últimos passos (`Serra.Physics.view(bike, acc / DT)`). A lógica do jogo sempre usa `bike`, nunca `vb`.
- Ordem por quadro (`frame`): `advance(dt)` → atualiza `vb` → câmera → efeitos visuais → `render()` → HUD → áudio.
- Estados do jogo (`game.state`): `loading`, `menu`, `intro`, `play`, `crash`, `pause`, `done`, `over`. A física roda em `play` e `crash`.

## 5. Física (`js/physics.js`)

Implementação própria, sem biblioteca, com partículas e restrições resolvidas por posição (XPBD), em subpassos.

### Modelo

- **Partículas**: roda traseira, roda dianteira, chassi traseiro, chassi dianteiro, pivô (embaixo do motor) e piloto (tronco). Cada uma tem massa e raio de colisão.
- **Corpo rígido**: chassi traseiro, chassi dianteiro, pivô e piloto ficam ligados por restrições rígidas.
- **Suspensão**: cada roda fica presa ao pivô por um braço rígido (balança), e por isso sobe em arco. Uma mola liga a roda ao chassi. A rigidez interna da mola é calculada a partir da rigidez desejada **na roda** (`rearRate`, `frontRate`). Há batentes de fim de curso que absorvem o choque, e o retorno é mais amortecido que a compressão (`reboundRatio`).
- **Cabeça**: é um ponto derivado do referencial do chassi, sem massa própria (`bike.H`). Serve para detectar queda e para o desenho.
- **Motor**: a força cai linearmente até `maxSpeed`. A tração na roda traseira é limitada por `tireGrip × carga na roda`; quando passa do limite, a roda patina.
- **Freio**: dividido 40% atrás / 60% na frente. Parado, o freio vira ré, limitada por `reverseMaxSpeed`. Descendo de ré mais rápido que o limite, o freio segura.
- **Resistências**: rolamento (fração da carga) e arrasto do ar proporcional a v².
- **Controle**: inclinar aplica aceleração angular pura (não empurra o centro de massa). No ar a aceleração é `airTorque`; no chão, `groundTorque` (transferência de peso). O giro gerado pelo jogador é limitado por `maxSpin`, e no ar o giro perde força com `airDamping`.
- **Contatos**: todas as partículas colidem com o terreno. As rodas têm quique baixo; as partes do corpo têm atrito de Coulomb ao raspar no chão.
- **Queda** (`crashCheck`): cabeça no chão, corpo do piloto no chão, impacto de roda acima de `hardLanding`, ou pouso com a moto mais torta que `badLandingAngle` em relação ao chão e impacto acima de `badLandingSpeed`.

### API

```js
Serra.Physics.createBike(x, T)          // cria a moto apoiada no terreno T na posição x
Serra.Physics.step(bike, input, dt, T)  // input = { throttle, brake, lean (-1..1), turbo }
Serra.Physics.crashCheck(bike)          // 'cabeça' | 'corpo' | 'impacto' | 'pouso' | null
Serra.Physics.view(bike, alpha)         // vista interpolada para desenho/câmera
Serra.Physics.nearest(T, x, y, r)       // distância assinada ao terreno + normal (objeto reaproveitado!)
Serra.Physics.groundY(T, x)
```

O terreno `T` precisa de `{ ys: Float32Array, n, SEG }` (altura a cada `SEG` px; y cresce para baixo).

Campos da moto usados pelo resto do jogo: `R`, `F`, `H` (com `x, y, px, py`, sendo `px/py` a posição do passo anterior), `gR`/`gF` (rodas no chão), `vt` (velocidade da roda traseira em px por passo, usada pelo som), `speed` (px/s), `spinR`/`spinF`, `susp`/`suspR`/`suspF` (compressão 0..1), `omega`, `airT`, `airRot`, `airVy`, `lastA`, `touchdown`, `landingMismatch`.

### Parâmetros ajustáveis (`PHYS`, no topo do arquivo)

| Grupo | Parâmetros | Valores atuais |
|---|---|---|
| Geral | `gravity`, `substeps`, `wheelRadius` | 1500 px/s², 8, 17 px |
| Massas | `mass.{wheelR, wheelF, chassisRear, chassisFront, pivot, rider}` | 1.0, 0.8, 2.0, 1.4, 1.2, 2.6 |
| Geometria | `geometry.*` (px, origem entre os eixos) | rodas em ±32; cabeça em (-6, -54) |
| Suspensão | `rearRate`, `frontRate`, `rearDamping`, `frontDamping`, `reboundRatio`, `travel`, `topOut` | 1100, 850, 66, 54, 2.2, 14, 2 |
| Motor | `accel`, `maxSpeed`, `turboAccel`, `turboMaxSpeed`, `reverseAccel`, `reverseMaxSpeed`, `airTurboAccel` | 1250, 1150, 1600, 1650, 320, 240, 140 |
| Chão e ar | `brakeDecel`, `tireGrip`, `rollingResistance`, `airDrag`, `bodyFriction`, `restitution`, `bodyRestitution` | 1700, 1.25, 0.018, 0.00016, 0.55, 0.04, 0.12 |
| Controle | `airTorque`, `groundTorque`, `maxSpin`, `airDamping` | 12.5, 8.5, 7.5, 0.65 |
| Queda | `headRadius`, `riderRadius`, `hardLanding`, `badLandingAngle`, `badLandingSpeed` | 10, 9, 1900, 1.1 rad, 520 |

Comportamento medido com esses valores (terreno plano): 0→300 px/s em 0,28 s, 0→600 em 0,72 s, 0→900 em 1,8 s; velocidade máxima ≈ 984 px/s; frenagem de 984 a 0 em 0,63 s e 301 px; suspensão assenta ≈ 37% do curso em repouso. Quedas de 600 e 1200 px são absorvidas; de 2000 px derrubam.

**Determinismo**: com as mesmas teclas, o resultado é idêntico em qualquer FPS (testado em 30, 60, 144, 240 e FPS irregular). A única aleatoriedade (`Math.random`) está nas partículas e no balanço do piloto em queda, que não afetam a física.

## 6. Fases e terreno (`game.js`)

O terreno de cada fase é gerado por `buildLevel(idx)` a partir de uma semente (`rng(seed)`): uma subida geral proporcional a `diff`, a soma de três senoides (colinas) e rampas com uma queda logo depois. O início e o fim da pista são planos (envelope `env`).

```js
const LEVELS = [
  { name: 'Campos Verdes',      theme: 'green',   seed: 1337, length: 8000,  diff: 0.55, time: 120, stars: 8,  turbos: 3 },
  { name: 'Floresta de Outono', theme: 'autumn',  seed: 2024, length: 9000,  diff: 0.68, time: 135, stars: 8,  turbos: 3 },
  { name: 'Cânion Seco',        theme: 'canyon',  seed: 4242, length: 10000, diff: 0.8,  time: 150, stars: 8,  turbos: 3 },
  { name: 'Pico Nevado',        theme: 'snow',    seed: 9001, length: 12000, diff: 1.05, time: 180, stars: 8,  turbos: 4,
    rampScale: 0.75, dropScale: 2.2, maxGrade: 0.8, maxDown: 0.55, hillScale: 0.75 },
  { name: 'Vale Vulcânico',     theme: 'volcano', seed: 6661, length: 12500, diff: 1.12, time: 190, stars: 10, turbos: 4,
    rampScale: 0.78, dropScale: 2.2, maxGrade: 0.8, maxDown: 0.75 },
  { name: 'Serra ao Luar',      theme: 'night',   seed: 7777, length: 13500, diff: 1.18, time: 205, stars: 10, turbos: 5,
    rampScale: 0.75, dropScale: 2.2, maxGrade: 0.82, maxDown: 0.42, hillScale: 0.9 },
];
```

Ajustes opcionais por fase (sem eles, a fase é gerada exatamente como antes):

| Ajuste | Efeito |
|---|---|
| `rampScale` | multiplica a altura das rampas |
| `dropScale` | alonga a descida logo depois de cada rampa |
| `maxGrade` | limita a inclinação das subidas (px de altura por px) |
| `maxDown` | limita a inclinação das descidas; um penhasco vira uma rampa longa |
| `hillScale` | suaviza o sobe-e-desce das colinas sem mudar o desnível total |

Cuidado: a sequência de chamadas a `r()` dentro de `buildLevel` define a pista inteira. Não insira nem remova chamadas a `r()` antes da geração de rampas, estrelas e turbos, senão as fases mudam. Mudar só o conteúdo de `THEMES[...].deco` não altera a pista.

Cada fase guarda `stars`, `turbos`, `cps` (checkpoints), `decor` (vegetação), `finishX` e uma referência `groundY`.

### Dificuldade medida

A dificuldade foi calibrada com dois pilotos automáticos (ver seção 10). Resultado atual:

| Fase | Intermediário | Experiente |
|---|---|---|
| 1 | 10 s, 0 quedas | 10 s, 0 |
| 2 | 12 s, 0 | 12 s, 0 |
| 3 | 15 s, 0 | 14 s, 0 |
| 4 | 23 s, 1 | 17 s, 0 |
| 5 | 29 s, 2 | 19 s, 0 |
| 6 | 44 s, 4 | 19 s, 0 |

Os números servem para comparar fases entre si; uma pessoa joga mais devagar. Os resultados são muito sensíveis aos ajustes (ex.: `rampScale` 0,72 → 0 quedas; 0,85 → 14 quedas na fase 5).

## 7. Gráficos

Toda a arte é gerada por código na hora do carregamento, uma vez por ambiente, e fica em cache (`Serra.Assets.build(tema)` → `Serra.Assets.get(tema)`). Os ambientes são carregados sob demanda ao entrar na fase, com barra de progresso.

### Ambientes (`Serra.ART` em `sprites.js`)

`green`, `autumn`, `canyon`, `snow`, `volcano`, `night`. Cada um define céu, sol (ou lua, com `night: true`), faixas de montanha (`far`, `mid`), linha de árvores, colinas, cores do solo e da grama, folhas, rochas, plantas de primeiro plano, cor da poeira e, quando houver, `weather` (`snow`, `leaves`, `embers`, `fireflies`), `tint` (filtro de cor multiplicativo) e `vignette` (intensidade da vinheta).

Opções das faixas de montanha:

- `mountainStrip`: picos com ruído, estrias de rocha e luz pela inclinação (a divisa luz/sombra serpenteia pela encosta, para não formar uma linha vertical). Aceita `snow`/`snowLine`, `alpine` (neve só nas encostas suaves), `veg`/`vegLine` (mata nas partes baixas), `terrace`, `strata`, `peak` e `lava` (crateras e rios de lava desenhados por `drawLavaFlows`).
- `mesaStrip`: mesas e buttes do cânion, com camadas de rocha de espessuras irregulares.

As faixas têm 2048 px de largura e se repetem sem emenda (ruído periódico).

### Camadas de desenho (`scenery.js`, chamadas em `render()`)

1. Céu, sol ou lua e estrelas, nuvens (`drawSky`).
2. Montanhas distantes, montanhas intermediárias, linha de árvores e colinas, cada uma com velocidade de parallax própria (`drawLayers`).
3. Clima no fundo (`drawWeather(..., false)`).
4. Vegetação da pista (`drawTrackDecor`), terreno com textura, camadas de solo, pedras, raízes, grama ou neve e lava (`drawTerrain`), itens (`drawItems`), partículas de trás, moto, touceiras na borda (`drawTrackEdge`), partículas da frente.
5. Plantas desfocadas em primeiro plano (`drawForeground`), clima na frente, filtro de cor, reflexo do sol, linhas de velocidade do turbo e vinheta (`drawScreenFX`).

### Moto e piloto (`bike.js`)

- `BikeRenderer.draw(ctx, vb, groundY, opts)` desenha no referencial da linha entre as rodas, deslocando o chassi pela compressão real da suspensão (`b.susp`).
- O piloto tem articulações calculadas por cinemática inversa (`ik`), sempre com o joelho para a frente e o cotovelo para baixo. A pose depende de inclinação, salto, turbo e aterrissagem.
- O capacete é desenhado ~14 px acima do ponto de colisão da cabeça. Perto do chão, o piloto se encolhe em direção ao ponto de colisão (`vis.reach`), para o capacete nunca atravessar o terreno.
- Na queda, o piloto sai rolando (`vis.fly`), com colisão pela cabeça, quadril, mãos e pés (`TUMBLE_HULL`).

### Partículas (`particles.js`)

Pool fixo de 420 partículas, sem criar objetos durante o jogo: poeira, terra e grama levantadas pela roda (`roost`), derrapagem (`skid`), aterrissagem (`land`), fogo do turbo (`flame`), faíscas de itens (`burst`) e queda (`crash`).

## 8. Interface

- HUD em HTML/CSS (vidas como capacetes SVG, tempo, pontos, fase, minimapa em canvas, turbo, estrelas e barra de progresso com marcas de checkpoint). Só atualiza o DOM quando um valor muda (`hudCache`).
- Telas em um card (`showCard`): carregamento, menu, seleção de fases, introdução da fase, pausa, fim de fase, fim de jogo.
- **Progresso salvo no `localStorage`**: `serraTurbo.best` (recorde), `serraTurbo.unlocked` (fases liberadas; completar uma fase libera a próxima) e `serraTurbo.muted`. Todo acesso está protegido por `try/catch`.
- Áudio sintetizado com Web Audio (motor e efeitos), iniciado só depois da primeira interação.

## 9. Histórico do que foi feito

1. **Versão inicial**: jogo completo com física simples (3 pontos rígidos), 3 fases, HUD e telas.
2. **Reformulação visual**: arte procedural em camadas com parallax, terreno texturizado, moto e piloto detalhados, partículas, HUD novo e renderização em alta densidade. A física não foi alterada nesta etapa.
3. **Ajustes visuais**: mesas do cânion com camadas de rocha irregulares; fase de neve com montanhas alpinas, manto de neve, pingentes de gelo e neve caindo; céu mais claro e vinheta suave na neve; moto e piloto redesenhados; capacete sem atravessar o chão.
4. **Mais fases**: Floresta de Outono, Vale Vulcânico e Serra ao Luar, com seleção de fases e progresso salvo.
5. **Dificuldade**: ajustes opcionais de terreno por fase e calibração das fases 4, 5 e 6.
6. **Correções visuais**: lava das montanhas virou crateras e rios (antes parecia chuva); linha vertical de luz nas montanhas removida; transição neve/rocha sem pontilhado.
7. **Nova física**: o modelo de 3 pontos foi trocado por `physics.js` (suspensão real, tração limitada pela carga, curva de motor, arrasto v², giro com inércia, aterrissagens absorvidas, passo fixo e interpolação). Junto vieram a correção do nome do mortal (estava invertido) e o renascimento em trecho plano. Depois, a dificuldade das fases 5 e 6 foi recalibrada.

## 10. Como testar

O `game.js` expõe um gancho para testes no console (`window.__serra`):

```js
__serra.game          // estado (state, level, lives, score, time, turbo, ...)
__serra.keys          // { up, down, left, right, turbo } — pode ser escrito pelos testes
__serra.bike          // moto atual (física)
__serra.level         // fase atual (ys, n, SEG, groundY, stars, cps, finishX, ...)
__serra.levels        // lista de fases (pode ser alterada em memória para experimentar)
__serra.load(i)       // abre a fase i direto, em estado 'play' (o ambiente precisa estar gerado para desenhar)
__serra.sim(n)        // avança n passos de física + lógica, sem desenhar
__serra.step(n)       // avança n passos e desenha um quadro
__serra.advance(dt)   // mesmo caminho do laço principal (para testar FPS diferentes)
```

Dicas que funcionaram:

- Para testes rápidos, sobrescreva `window.requestAnimationFrame = () => 0` e use `sim`/`step`.
- Para conferir o visual de um ponto da pista, posicione `bike.R`, `bike.F` e `bike.H` (com `px/py` iguais a `x/y`), mude `game.state` para `'intro'` (congela a física) e chame `step(0)`.
- Para gerar um ambiente antes de abrir a fase direto: `await Serra.Assets.build('night')`.
- Os testes de física podem rodar fora do jogo, com terreno sintético: `{ ys: Float32Array, n, SEG: 16 }` passado para `createBike` e `step`.
- **Pilotos automáticos** usados para calibrar a dificuldade: a cada 6 passos, comparam o ângulo da moto (`atan2(F.y-R.y, F.x-R.x)`) com a inclinação do chão (no ar, com a do trecho à frente) e inclinam para corrigir; aceleram, soltam o acelerador antes de cristas (mudança de inclinação > 0,3 rad a mais de 620 px/s) e freiam acima de 760 px/s nesses pontos; usam turbo em subidas lentas. O **experiente** também antecipa o giro (prevê o ângulo 0,3 s à frente no ar). Durante o teste, fixe `game.lives = 999` e `game.time = 999`.
- Depois de testes que completam fases, apague `localStorage['serraTurbo.unlocked']`, para não deixar progresso falso no navegador.

Verificações recomendadas depois de mexer na física: moto parada não escorrega nem treme; nenhuma roda afunda no terreno; pousos não quicam; resultado igual com FPS diferentes; os dois pilotos automáticos completam as 6 fases.

## 11. Convenções

- Sem frameworks e sem imagens externas; arte sempre procedural e original.
- Comentários em português, curtos (no máximo 2 linhas), explicando o porquê, não o óbvio.
- Constantes de física ficam em `PHYS`; não espalhe números mágicos pelo `game.js`.
- Física não lê nada do desenho; o desenho não altera a física.
- Evite criar objetos por quadro nos trechos quentes (partículas, HUD).
- Preserve os IDs usados pelo `game.js` no `index.html` (`lives`, `time`, `timeBox`, `score`, `levelNum`, `levelName`, `minimap`, `turbo`, `stars`, `starCount`, `prog`, `progIcon`, `progTicks`, `toasts`, `bigmsg`, `overlay`, `card`, `btnMute`, `btnPause`, botões de toque).

## 12. Pendências e ideias

- **Não há teste com jogador humano**: todos os testes foram automáticos. A sensação de aceleração, suspensão e controle no ar deve ser avaliada jogando e ajustada em `PHYS`.
- Não existe uma referência de "hash" da nova física. Antes de mexer nela, registre uma simulação fixa (sequência de teclas → posições) para conferir depois.
- O jogo não tem obstáculos separados (pedras, troncos); as colisões são só com o terreno.
- GitHub Pages ainda não foi ativado; para isso, ajuste o `index.html` como descrito na seção 2.
- O desenho do chassi segue a linha entre as rodas, não o ângulo real do chassi da física; a diferença é pequena, mas um refino possível é desenhar o chassi pelo referencial `Cr → Cf`.
- Sem efeitos sonoros de aterrissagem e suspensão; o áudio é todo sintetizado.
