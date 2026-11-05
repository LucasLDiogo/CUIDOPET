import type { Category, City } from '../../domain/types';

export const CATEGORIES: Category[] = [
  { id: 'passeio', label: 'Passeio', short: 'Passeios', description: 'Dog walkers que passeiam com seu cão no bairro, com rota e tempo combinados.' },
  { id: 'pet_sitter', label: 'Pet sitter', short: 'Cuidador em casa', description: 'Visitas na sua casa para alimentar, brincar, dar remédio e fazer companhia.' },
  { id: 'hospedagem', label: 'Pet house', short: 'Hospedagem', description: 'Hospedagem domiciliar ou hotelzinho enquanto você viaja.' },
  { id: 'creche', label: 'Creche', short: 'Day care', description: 'Diárias de creche com socialização e gasto de energia.' },
  { id: 'banho_tosa', label: 'Banho e tosa', short: 'Banho e tosa', description: 'Banho, tosa, hidratação e higiene com hora marcada.' },
  { id: 'petshop', label: 'Pet shop', short: 'Pet shop', description: 'Lojas com serviços, táxi dog e cuidados rápidos.' },
  { id: 'adestramento', label: 'Adestramento', short: 'Adestramento', description: 'Aulas de obediência, comportamento e socialização.' },
  { id: 'vet_domicilio', label: 'Veterinário em casa', short: 'Vet em casa', description: 'Consultas, vacinas e coleta de exames sem tirar o pet de casa.' },
];

export const CITIES: City[] = [
  { id: 'passo-fundo-rs', name: 'Passo Fundo', uf: 'RS', ibge: 4314100, center: { lat: -28.2620, lng: -52.4083 },
    neighborhoods: ['Centro', 'Vila Rodrigues', 'São Cristóvão', 'Boqueirão', 'Petrópolis', 'Vera Cruz', 'Lucas Araújo', 'Annes', 'Vila Luiza', 'Cidade Nova'] },
  { id: 'porto-alegre-rs', name: 'Porto Alegre', uf: 'RS', ibge: 4314902, center: { lat: -30.0346, lng: -51.2177 },
    neighborhoods: ['Moinhos de Vento', 'Bom Fim', 'Menino Deus', 'Petrópolis', 'Cidade Baixa', 'Tristeza', 'Auxiliadora', 'Rio Branco'] },
  { id: 'caxias-do-sul-rs', name: 'Caxias do Sul', uf: 'RS', ibge: 4305108, center: { lat: -29.1678, lng: -51.1794 },
    neighborhoods: ['Centro', 'Exposição', 'São Pelegrino', 'Madureira', 'Panazzolo'] },
  { id: 'santa-maria-rs', name: 'Santa Maria', uf: 'RS', ibge: 4316907, center: { lat: -29.6868, lng: -53.8149 },
    neighborhoods: ['Centro', 'Camobi', 'Nossa Senhora de Lourdes', 'Dores'] },
  { id: 'florianopolis-sc', name: 'Florianópolis', uf: 'SC', ibge: 4205407, center: { lat: -27.5949, lng: -48.5482 },
    neighborhoods: ['Centro', 'Trindade', 'Lagoa da Conceição', 'Campeche', 'Itacorubi'] },
];

export const SIZE_LABEL = { mini: 'Mini (até 4 kg)', pequeno: 'Pequeno (até 10 kg)', medio: 'Médio (até 25 kg)', grande: 'Grande (até 45 kg)', gigante: 'Gigante (45 kg+)' } as const;
export const SIZE_SHORT = { mini: 'Mini', pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande', gigante: 'Gigante' } as const;
export const SPECIES_LABEL = { cao: 'Cães', gato: 'Gatos' } as const;
export const UNIT_LABEL = { passeio: 'passeio', hora: 'hora', diaria: 'diária', servico: 'serviço', visita: 'visita', mes: 'mês' } as const;
export const POLICY_LABEL = {
  flexivel: 'Flexível — cancelamento grátis até 24 h antes',
  moderada: 'Moderada — grátis até 48 h; depois, 50% do valor',
  rigida: 'Rígida — grátis até 7 dias; depois, sem reembolso',
} as const;

export const catLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const cityName = (id: string) => { const c = CITIES.find((x) => x.id === id); return c ? `${c.name}/${c.uf}` : id; };
