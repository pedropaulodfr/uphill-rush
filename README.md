# Serra Turbo

Jogo 2D de motocross para navegador, feito em HTML, CSS e JavaScript puro. Leve a moto até a bandeira de chegada de cada fase, dentro do tempo, sem bater o capacete no chão.

## 🎮 [Jogar agora](https://pedropaulodfr.github.io/uphill-rush/)

https://pedropaulodfr.github.io/uphill-rush/

## Controles

| Tecla | Ação |
|---|---|
| ↑ / W | Acelerar |
| ↓ / S | Frear; parado, vira ré |
| ← / A | Inclinar para trás (empinar) |
| → / D | Inclinar para frente |
| Espaço | Turbo |
| P / Esc | Pausar |
| M | Som liga/desliga |

No celular aparecem botões de toque na tela.

## O jogo

- 6 fases com ambientes diferentes: campo, floresta de outono, cânion, neve, vulcão e serra à noite.
- Obstáculos em todas as fases: fendas (chegue rápido), túneis de teto baixo (entre devagar), troncos e costelas.
- Estrelas, cápsulas de turbo, checkpoints e pontos extras por mortais no ar.
- 4 vidas e tempo limite por fase.

## Rodar localmente

Não precisa instalar nada. Sirva a pasta com qualquer servidor estático, por exemplo:

```bash
python -m http.server 8765
```

e abra http://localhost:8765.

## Para quem vai continuar o projeto

O arquivo [AGENTS.md](AGENTS.md) explica a arquitetura, a física, a geração das fases, os obstáculos e como testar.

Inspirado na jogabilidade de *Uphill Rush*, mas com nome, arte, fases e visual originais, todos desenhados por código.
