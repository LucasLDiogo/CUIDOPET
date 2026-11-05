import type { SqlRunner } from '../migrate.ts';

/**
 * Dados de DEMONSTRAÇÃO — todos fictícios e marcados `is_demo = true`.
 * Nunca executar em produção (run.ts recusa se CUIDOPE_ENV=production).
 */
export interface DemoIds {
  regions: { passoFundo: string; centro: string; saoCristovao: string; portoAlegre: string; moinhos: string };
  users: Record<'ana' | 'bruno' | 'carla' | 'diego' | 'elisa' | 'moderadora', string>;
  orgs: Record<'carla' | 'diego' | 'elisa', string>;
  providers: Record<'carla' | 'diego' | 'elisa', string>;
  resources: Record<'carla' | 'diego' | 'elisa', string>;
  listings: Record<'carlaHospedagem' | 'carlaPasseio' | 'diegoPasseio' | 'elisaBanhoTosa', string>;
  pets: Record<'thor' | 'mia' | 'luna', string>;
}

async function one<T = string>(db: SqlRunner, sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params);
  return Object.values(r.rows[0])[0] as T;
}

export async function seedDemo(db: SqlRunner): Promise<DemoIds> {
  const region = (uf: string, ibge: number, name: string, kind: string, parent: string | null, lat: number, lng: number) =>
    one(db, `insert into public.regions(uf, city_ibge_id, name, kind, parent_id, approx_lat, approx_lng) values ($1,$2,$3,$4,$5,$6,$7) returning id`, [uf, ibge, name, kind, parent, lat, lng]);
  const passoFundo = await region('RS', 4314100, 'Passo Fundo', 'city', null, -28.26, -52.41);
  const centro = await region('RS', 4314100, 'Centro', 'neighborhood', passoFundo, -28.26, -52.41);
  const saoCristovao = await region('RS', 4314100, 'São Cristóvão', 'neighborhood', passoFundo, -28.25, -52.4);
  const portoAlegre = await region('RS', 4314902, 'Porto Alegre', 'city', null, -30.03, -51.23);
  const moinhos = await region('RS', 4314902, 'Moinhos de Vento', 'neighborhood', portoAlegre, -30.03, -51.2);

  // Habilitação no piloto: cães e gatos nas categorias suportadas, nas duas cidades.
  await db.exec(`insert into public.region_enablement(region_id, category_code, species_code)
    select r.id, c.code, s.code from public.regions r cross join public.service_categories c cross join public.species s
     where r.kind = 'city' and s.enabled_pilot`);

  const user = (sub: string, name: string, roles: string[]) =>
    one(db, `with u as (insert into public.users(auth_subject, display_name, adult_declared_at) values ($1,$2,now()) returning id),
                  r as (insert into public.user_roles(user_id, role) select u.id, x from u, unnest($3::text[]) x)
             select id from u`, [sub, name, roles]);
  const ana = await user('demo|ana', 'Ana (demo)', ['tutor']);
  const bruno = await user('demo|bruno', 'Bruno (demo)', ['tutor']);
  const carla = await user('demo|carla', 'Carla (demo)', ['tutor', 'provider']);
  const diego = await user('demo|diego', 'Diego (demo)', ['provider']);
  const elisa = await user('demo|elisa', 'Elisa (demo)', ['provider']);
  const moderadora = await user('demo|mod', 'Moderação (demo)', ['trust_safety', 'support']);

  const org = async (owner: string, name: string) => {
    const id = await one(db, `insert into public.organizations(owner_user_id, kind, display_name) values ($1,'PF',$2) returning id`, [owner, name]);
    await db.query(`insert into public.memberships(organization_id, user_id, member_role) values ($1,$2,'owner')`, [id, owner]);
    return id;
  };
  const orgCarla = await org(carla, 'Carla (demo)'); const orgDiego = await org(diego, 'Diego (demo)'); const orgElisa = await org(elisa, 'Elisa (demo)');

  const provider = async (orgId: string, user: string, slug: string, name: string, bio: string, city: string, hood: string | null, whatsapp: boolean) => {
    const id = await one(db, `insert into public.provider_profiles(organization_id, responsible_user_id, slug, public_name, bio, city_region_id, neighborhood_region_id, status, whatsapp_opt_in, is_demo, published_at)
      values ($1,$2,$3,$4,$5,$6,$7,'published',$8,true,now()) returning id`, [orgId, user, slug, name, bio, city, hood, whatsapp]);
    await db.query(`insert into public.verifications(provider_id, kind, status, scope, method, valid_until) values ($1,'identity','approved','Documento oficial conferido por verificador (demo)','demo', now() + interval '1 year')`, [id]);
    return id;
  };
  const pCarla = await provider(orgCarla, carla, 'carla-demo', 'Carla — hospedagem e passeios (demo)', 'Casa com quintal telado em Passo Fundo. Hospedagem domiciliar para cães e gatos, com rotina combinada antes. Perfil fictício para demonstração.', passoFundo, centro, true);
  const pDiego = await provider(orgDiego, diego, 'diego-demo', 'Diego — passeios (demo)', 'Passeios de 30 e 60 minutos para cães de pequeno e médio porte. Perfil fictício para demonstração.', passoFundo, saoCristovao, false);
  const pElisa = await provider(orgElisa, elisa, 'elisa-demo', 'Elisa — banho e tosa (demo)', 'Banho e tosa com hora marcada para cães e gatos. Perfil fictício para demonstração.', portoAlegre, moinhos, false);

  await db.query(`insert into public.subscriptions(organization_id, plan_code, status, current_period_end) values ($1,'profissional','active', now() + interval '20 days')`, [orgCarla]);
  // Métricas de DEMO (não derivam de avaliações reais).
  await db.query(`insert into public.provider_metrics(provider_id, rating_avg, rating_count, response_rate, completeness) values ($1,4.9,12,0.95,1),($2,4.6,5,0.8,0.9)`, [pCarla, pDiego]);
  await db.query(`insert into public.provider_metrics(provider_id, completeness) values ($1,0.8)`, [pElisa]);   // sem avaliações: nota nula

  const resource = (orgId: string, kind: string, name: string, cap: number) =>
    one(db, `insert into public.resources(organization_id, kind, name, capacity_units) values ($1,$2,$3,$4) returning id`, [orgId, kind, name, cap]);
  const rCarla = await resource(orgCarla, 'person', 'Carla (capacidade da casa)', 2);
  const rDiego = await resource(orgDiego, 'person', 'Diego', 1);
  const rElisa = await resource(orgElisa, 'person', 'Elisa (bancada)', 1);

  const listing = async (orgId: string, prov: string, res: string, cat: string, title: string, price: number, unit: string, place: string, species: string[], sizes = "{small,medium,large}") => {
    const id = await one(db, `insert into public.service_listings(organization_id, provider_id, resource_id, category_code, title, price_cents, price_unit, execution_place, accepted_sizes, status)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9::text[],'published') returning id`, [orgId, prov, res, cat, title, price, unit, place, sizes]);
    for (const s of species) await db.query(`insert into public.listing_species(listing_id, species_code) values ($1,$2)`, [id, s]);
    return id;
  };
  const lCarlaH = await listing(orgCarla, pCarla, rCarla, 'hospedagem_domiciliar', 'Hospedagem na casa da Carla', 12000, 'night', 'provider_home', ['dog', 'cat']);
  const lCarlaP = await listing(orgCarla, pCarla, rCarla, 'passeio', 'Passeio de 30 minutos', 3500, 'walk', 'tutor_home', ['dog']);
  const lDiegoP = await listing(orgDiego, pDiego, rDiego, 'passeio', 'Passeio de 60 minutos', 5000, 'walk', 'tutor_home', ['dog'], '{small,medium}');
  const lElisa = await listing(orgElisa, pElisa, rElisa, 'banho_tosa', 'Banho e tosa', 9000, 'service', 'establishment', ['dog', 'cat']);

  const pet = (tutor: string, name: string, species: string, size: string) =>
    one(db, `insert into public.pets(tutor_id, name, species_code, size, age_band) values ($1,$2,$3,$4,'adult') returning id`, [tutor, name, species, size]);
  const thor = await pet(ana, 'Thor', 'dog', 'medium'); const mia = await pet(ana, 'Mia', 'cat', 'small'); const luna = await pet(bruno, 'Luna', 'dog', 'large');
  await db.query(`insert into private.pet_care_plans(pet_id, version, routine, feeding, emergency_contact, vet_name) values ($1,1,'Passeio de manhã','Ração 2x ao dia','Ana (demo) — contato fictício','Clínica Exemplo (demo)')`, [thor]);

  return {
    regions: { passoFundo, centro, saoCristovao, portoAlegre, moinhos },
    users: { ana, bruno, carla, diego, elisa, moderadora },
    orgs: { carla: orgCarla, diego: orgDiego, elisa: orgElisa },
    providers: { carla: pCarla, diego: pDiego, elisa: pElisa },
    resources: { carla: rCarla, diego: rDiego, elisa: rElisa },
    listings: { carlaHospedagem: lCarlaH, carlaPasseio: lCarlaP, diegoPasseio: lDiegoP, elisaBanhoTosa: lElisa },
    pets: { thor, mia, luna },
  };
}
