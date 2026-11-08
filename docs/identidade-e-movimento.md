# Cuidopê — identidade visual, imagens e movimento

## Marca
- **Logo**: vetorizada a partir da arte original (`IMAGEM/…21_44_38.png` ícone e `…21_43_45.png` logotipo) com potrace → `apps/web/src/components/brandPaths.ts`. Componentes: `BrandIcon` (com `badge` = selo branco de app), `Wordmark` (herda a cor do texto) e `Logo`.
- **Cores** (tokens em `src/index.css`): azul royal `#1838CC` (marca), amarelo coração `#FFD23F` (ação/destaque), tinta `#0B1640`, superfícies frias `#F5F7FD`/`#EEF1FB`. Tema escuro azul‑marinho `#070D26` com marca `#7790FF`.
- **Tipografia**: Fredoka (títulos, combina com o lettering arredondado da logo) e Nunito Sans (texto).
- **Ícones do app (PWA)**: `public/icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`.

## Imagens
| Arquivo (src/assets/img) | Origem |
|---|---|
| `hero-tutora*.webp`, `pet-thor`, `pet-mia` | foto da identidade (IMAGEM/…21_44_48.png) |
| `pessoa-*.webp` e `*-av.webp` | retratos da identidade (IMAGEM/…21_44_56.png), usados em Ana (tutora demo), Carla, Diego e Banho & Bossa |
| `cat-*.webp` (8 categorias) e `cena-*.webp` | geradas localmente com **FLUX schnell (GGUF) no ComfyUI**, script `IMAGEM/gerar_imagens_flux.py` |

Todas as pessoas e pets são fictícios (demo). Mapa de uso em `src/lib/media.ts` (prestador por *slug*, para valer igual no Supabase/Firebase). Para gerar de novo: suba o ComfyUI (`python main.py --lowvram`) e rode `python gerar_imagens_flux.py` (pula as que já existem; passe nomes para refazer só algumas).

## Movimento (GSAP 3.15 + @gsap/react)
- `src/components/Splash.tsx`: tela de abertura — selo entra, cão/gato aparecem, coração bate, nome é revelado, barra de carregamento e cortina azul sobe. Só sai quando o app carregou. Na 2ª abertura da sessão roda 2,4× mais rápida.
- `src/lib/motion.tsx`: `PageTransition` (troca de página + barra amarela no topo), `Reveal` (entrada em cascata ao rolar), `SplitHeading` (palavras sobem por máscara), `CountUp`, `burst` (corações ao favoritar), `pawConfetti` (patinhas ao concluir um pedido).
- Home: parallax da foto, cartões flutuantes, faixa “mais procurados” em movimento, carrossel com barras de progresso e swipe, linha do “Como funciona” desenhada pela rolagem.
- Regras: só `transform`/`opacity`; nada desloca na horizontal além da tela (teste de rolagem lateral no celular); **tudo desliga com `prefers-reduced-motion`**.

## Funcionalidades inspiradas em Petz/Petlove (adaptadas a serviços)
- Busca no cabeçalho, menu “Todos os serviços” com fotos, atalhos por espécie/serviço, “Mais buscados”.
- **Meu pet**: seletor no cabeçalho que personaliza a busca e a seção “Escolhidos para o Thor” na home.
- **Clube Patinhas** (`/clube` e `/conta/clube`): +10 por atendimento, +50 por avaliação, +30 por pacote; níveis Filhote/Companheiro/Melhor Amigo; resgates (demonstração).
- **Carteirinha de vacinação** em Meus pets, com status e atalho para vacina em casa.
- **Agendar de novo** nos atendimentos concluídos (recompra).
- Rodapé completo: benefícios, formas de pagamento, selos, instalar o app (PWA).
