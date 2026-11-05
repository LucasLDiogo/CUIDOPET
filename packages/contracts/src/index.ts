import { z } from 'zod';

/** Erro padronizado (RFC 9457-like) com código, campo, mensagem e correlation_id (spec §19). */
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  field: z.string().optional(),
  correlation_id: z.string(),
});
export type Problem = z.infer<typeof ProblemSchema>;

export const SPECIES = ['dog', 'cat'] as const;          // espécies habilitadas no piloto
export const CATEGORIES = ['hospedagem_domiciliar', 'creche_diurna', 'passeio', 'visita_domicilio', 'baba_pernoite', 'banho', 'tosa', 'banho_tosa'] as const;
export const SIZES = ['small', 'medium', 'large'] as const;

const isoDate = z.iso.datetime({ offset: true });

/** GET /v1/search/providers — UF + cidade (ID oficial IBGE) + serviço + animal; datas refinam elegibilidade. */
export const SearchQuerySchema = z.object({
  uf: z.string().length(2).transform((s) => s.toUpperCase()),
  city_ibge_id: z.coerce.number().int().positive(),
  service: z.enum(CATEGORIES),
  species: z.enum(['dog', 'cat', 'all']).default('all'),
  neighborhood_id: z.uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  pets: z.coerce.number().int().min(1).max(10).default(1),
  size: z.enum(SIZES).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
}).refine((q) => (q.from == null) === (q.to == null), { message: 'informe from e to juntos', path: ['to'] })
  .refine((q) => !q.from || !q.to || new Date(q.to) > new Date(q.from), { message: 'to deve ser posterior a from', path: ['to'] });
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const ServiceSummarySchema = z.object({
  listing_id: z.uuid(),
  category: z.enum(CATEGORIES),
  title: z.string(),
  price_cents: z.number().int().nonnegative(),
  price_unit: z.enum(['night', 'day', 'hour', 'walk', 'visit', 'service']),
  price_is_from: z.boolean(),
  price_variation_note: z.string().nullable(),
  species: z.array(z.enum(SPECIES)),
});

export const ProviderCardSchema = z.object({
  provider_id: z.uuid(),
  slug: z.string(),
  public_name: z.string(),
  bio_short: z.string().nullable(),
  photo_ref: z.string().nullable(),
  city: z.string(),
  neighborhood: z.string().nullable(),
  uf: z.string(),
  services: z.array(ServiceSummarySchema),
  rating_avg: z.number().min(1).max(5).nullable(),     // null ⇒ "Ainda sem avaliações" (nunca inventar 5★)
  rating_count: z.number().int().nonnegative(),
  badges: z.object({
    identity_verified: z.boolean(),
    identity_scope: z.string().nullable(),
    professional: z.boolean(),
  }),
  channels: z.object({ whatsapp: z.boolean(), external_site: z.boolean() }),   // só disponibilidade; contato sai por ação do tutor
  availability: z.enum(['available', 'unavailable', 'unknown']),
  sponsored: z.boolean(),
  is_demo: z.boolean(),
  ranking: z.object({ version: z.string(), score: z.number(), why: z.string(), impression_id: z.uuid() }),
});
export type ProviderCard = z.infer<typeof ProviderCardSchema>;

export const SearchResponseSchema = z.object({
  sponsored: z.array(ProviderCardSchema).max(2),       // até 2 espaços "Patrocinado", separados dos orgânicos
  results: z.array(ProviderCardSchema),
  next_cursor: z.string().nullable(),
  empty: z.object({
    message: z.string(),
    suggestions: z.array(z.object({ relax: z.enum(['dates', 'species', 'size', 'neighborhood']), would_return: z.number().int() })),
  }).nullable(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const ReviewPublicSchema = z.object({
  id: z.uuid(), scores: z.object({ communication: z.number(), punctuality: z.number(), care: z.number(), match: z.number() }),
  comment: z.string().nullable(), label: z.enum(['reserva_paga', 'externa_confirmada']), provider_reply: z.string().nullable(), created_at: z.string(),
});

export const ProviderProfileResponseSchema = z.object({
  provider: ProviderCardSchema.omit({ ranking: true, sponsored: true, availability: true }).extend({ bio: z.string().nullable() }),
  reviews: z.object({ items: z.array(ReviewPublicSchema), distribution: z.record(z.string(), z.number().int()) }),
});

export const AvailabilityQuerySchema = z.object({
  from: isoDate, to: isoDate, pets: z.coerce.number().int().min(1).max(10).default(1),
}).refine((q) => new Date(q.to) > new Date(q.from), { message: 'to deve ser posterior a from', path: ['to'] });

export const RegionsQuerySchema = z.object({ uf: z.string().length(2).transform((s) => s.toUpperCase()) });

/** Webhook de PSP (sandbox): corpo mínimo; o payload completo não é guardado além do necessário. */
export const SandboxWebhookSchema = z.object({
  event_id: z.string().min(3).max(100),
  type: z.string().min(3).max(60),
  payment_id: z.string().min(3).max(100),
  status: z.string().max(40).optional(),
});
export type SandboxWebhook = z.infer<typeof SandboxWebhookSchema>;

/** Campos que jamais podem aparecer em resposta pública (usado por testes de vazamento). */
export const FORBIDDEN_PUBLIC_KEYS = Object.freeze([
  'email', 'phone', 'professional_phone', 'document', 'cpf', 'cnpj', 'organization_id', 'responsible_user_id', 'tutor_id',
  'reviewer_id', 'resource_id', 'commercial_address', 'address', 'birth', 'bank', 'pix_key', 'auth_subject', 'full_name',
]);
