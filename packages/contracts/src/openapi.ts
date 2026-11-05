import { z } from 'zod';
import * as c from './index.ts';

const json = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'output' });
const problem = { description: 'Erro padronizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Problem' } } } };

export function buildOpenApi() {
  const q = (schema: z.ZodObject<any> | z.ZodType) => {
    const js: any = z.toJSONSchema(schema as any, { target: 'draft-2020-12', io: 'input' });
    const req = new Set<string>(js.required ?? []);
    return Object.entries<any>(js.properties ?? {}).map(([name, s]) => ({ name, in: 'query', required: req.has(name), schema: s }));
  };
  return {
    openapi: '3.1.0',
    info: { title: 'Cuidopê API', version: '0.1.0', description: 'Incremento 1: leitura pública (busca, perfil, disponibilidade, regiões) e webhooks. Rotas autenticadas entram no incremento 2 (ver docs/api/endpoints.md).' },
    servers: [{ url: '/v1' }],
    paths: {
      '/health': { get: { operationId: 'health', responses: { '200': { description: 'ok' } } } },
      '/regions': { get: { operationId: 'listRegions', parameters: q(c.RegionsQuerySchema), responses: { '200': { description: 'Cidades habilitadas da UF' }, '400': problem } } },
      '/search/providers': { get: { operationId: 'searchProviders', parameters: q(c.SearchQuerySchema), responses: { '200': { description: 'Resultados', content: { 'application/json': { schema: json(c.SearchResponseSchema) } } }, '400': problem } } },
      '/providers/{slug}': { get: { operationId: 'getProvider', parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Projeção pública', content: { 'application/json': { schema: json(c.ProviderProfileResponseSchema) } } }, '404': problem } } },
      '/listings/{id}/availability': { get: { operationId: 'getAvailability', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, ...q(c.AvailabilityQuerySchema)], responses: { '200': { description: '{ available: boolean }' }, '400': problem, '404': problem } } },
      '/webhooks/{provider}': { post: { operationId: 'receiveWebhook', description: 'Valida assinatura HMAC, persiste (deduplicado) e processa na sequência. Responde após persistência durável.', parameters: [{ name: 'provider', in: 'path', required: true, schema: { type: 'string', enum: ['sandbox'] } }, { name: 'x-signature', in: 'header', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: json(c.SandboxWebhookSchema) } } }, responses: { '200': { description: '{ received: true, duplicate: boolean }' }, '401': problem, '400': problem } } },
    },
    components: { schemas: { Problem: json(c.ProblemSchema) } },
  };
}
