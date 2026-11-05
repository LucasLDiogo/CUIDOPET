// CORS restrito: só as origens listadas em ALLOWED_ORIGINS (separadas por vírgula) recebem os cabeçalhos.
// Ex.: ALLOWED_ORIGINS="https://cuidope.app,https://www.cuidope.app,http://localhost:5173"

const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

export function isOriginAllowed(origin: string | null): boolean {
  return !!origin && allowed.includes(origin.replace(/\/$/, ''));
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const base: Record<string, string> = { Vary: 'Origin' };
  if (!isOriginAllowed(origin)) return base;
  return {
    ...base,
    'Access-Control-Allow-Origin': origin!,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '600',
  };
}

/** Responde o preflight. Origem fora da lista → 403 sem cabeçalhos CORS. */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  if (!isOriginAllowed(req.headers.get('origin'))) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
