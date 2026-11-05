/** Pesos versionados para experimento (spec §7). Soma = 1. */
export const RANKING_VERSION = 'rk-2026-10-v1';
export const RANKING_WEIGHTS = Object.freeze({ fit: 0.35, availability: 0.20, reputation: 0.20, response: 0.10, distance: 0.10, completeness: 0.05 });

export interface RankingInput {
  fit: number;            // 0..1 adequação (espécie/serviço/porte)
  availability: number;   // 0..1
  ratingAvg: number | null; ratingCount: number;
  responseRate: number;   // 0..1 (respostas em prazo)
  distanceKm: number | null; radiusKm: number;
  completeness: number;   // 0..1
  cancellationRate?: number; // 0..1, penaliza reputação
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Nota bayesiana: evita favorecer 1 avaliação 5★. prior m=5 avaliações com média global C. */
export function bayesianRating(avg: number | null, count: number, priorMean = 4.2, priorWeight = 5): number {
  if (!avg || count <= 0) return priorMean;
  return (priorWeight * priorMean + count * avg) / (priorWeight + count);
}

export function reputationScore(avg: number | null, count: number, cancellationRate = 0): number {
  const base = (bayesianRating(avg, count) - 1) / 4; // 1..5 → 0..1
  return clamp01(base * (1 - clamp01(cancellationRate) * 0.5));
}

export function distanceScore(distanceKm: number | null, radiusKm: number): number {
  if (distanceKm == null) return 0.5; // sem localização precisa: neutro
  if (radiusKm <= 0) return 0.5;
  return clamp01(1 - distanceKm / radiusKm);
}

export function score(i: RankingInput): { total: number; parts: Record<keyof typeof RANKING_WEIGHTS, number> } {
  const parts = {
    fit: clamp01(i.fit), availability: clamp01(i.availability),
    reputation: reputationScore(i.ratingAvg, i.ratingCount, i.cancellationRate ?? 0),
    response: clamp01(i.responseRate), distance: distanceScore(i.distanceKm, i.radiusKm), completeness: clamp01(i.completeness),
  };
  let total = 0;
  for (const k of Object.keys(RANKING_WEIGHTS) as (keyof typeof RANKING_WEIGHTS)[]) total += RANKING_WEIGHTS[k] * parts[k];
  return { total: Math.round(total * 10_000) / 10_000, parts };
}

/** Texto curto "por que apareceu" (spec §7) — apenas fatores públicos, sem atributos sensíveis. */
export function whyAppeared(parts: Record<string, number>): string {
  const labels: Record<string, string> = { fit: 'combina com sua busca', availability: 'tem disponibilidade', reputation: 'boa reputação', response: 'responde rápido', distance: 'fica perto', completeness: 'perfil completo' };
  const top = Object.entries(parts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => labels[k]);
  return `Aparece porque ${top.join(' e ')}.`;
}
