/**
 * Gerador DETERMINÍSTICO de dados de demonstração (todos fictícios, is_demo = true).
 * As datas são relativas ao momento da geração, então a demo sempre parece "de hoje".
 * Também é usado por scripts/gerar-seed-sql.mjs para popular o Supabase.
 */
import type {
  Booking, BookingStatus, CategoryId, Conversation, Customer, Message, PackagePurchase, Pet, PetSize,
  Provider, ProviderSettings, Review, Service, ServicePackage, Species, WaTemplate, BookingEvent,
} from '../../domain/types';
import { CITIES } from './catalog';

export interface DemoDB {
  version: number;
  seededAt: string;
  providers: Provider[];
  services: Service[];
  packages: ServicePackage[];
  reviews: Review[];
  customers: Customer[];
  pets: Pet[];
  bookings: Booking[];
  purchases: PackagePurchase[];
  conversations: Conversation[];
  messages: Message[];
  templates: WaTemplate[];
  settings: ProviderSettings[];
  favorites: Record<string, string[]>; // customerId -> providerIds
  seq: number;
}

export const DEMO_VERSION = 3;
export const MAIN_PROVIDER_ID = 'prv-carla';
export const MAIN_CUSTOMER_ID = 'cus-ana';

/* ---------- PRNG ---------- */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261104);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p: number) => rnd() < p;
const round5 = (cents: number) => Math.round(cents / 500) * 500;

/* ---------- tempo ---------- */
const DAY = 86400000;
function atDay(base: Date, dayOffset: number, hour: number, minute = 0) {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}
const iso = (d: Date) => d.toISOString();
const minutesAgo = (now: Date, m: number) => new Date(now.getTime() - m * 60000);

/* ---------- pessoas ---------- */
const FIRST = ['Ana', 'Bruno', 'Camila', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Leonardo', 'Mariana', 'Nicolas', 'Olívia', 'Pedro', 'Rafaela', 'Rodrigo', 'Sofia', 'Thiago', 'Valentina', 'Vinícius', 'Larissa', 'Gustavo', 'Patrícia', 'Marcos', 'Juliana', 'Rafael', 'Beatriz', 'Fernanda', 'Lucas', 'Tiago', 'Roberto', 'Aline', 'Caroline', 'Diego', 'Elisa', 'Fábio', 'Helena', 'Igor', 'Letícia', 'Maurício', 'Natália', 'Otávio', 'Priscila', 'Renata', 'Sabrina', 'Tatiane', 'Vanessa', 'William'];
const LAST = ['Ribeiro', 'Souza', 'Oliveira', 'Pereira', 'Lima', 'Carvalho', 'Ferreira', 'Rodrigues', 'Almeida', 'Costa', 'Gomes', 'Martins', 'Araújo', 'Barbosa', 'Rocha', 'Dias', 'Teixeira', 'Moraes', 'Zanella', 'Bortolini', 'Schmitt', 'Fontana', 'Dalla Rosa', 'Bertoldo', 'Tonial'];
const DOG_NAMES = ['Thor', 'Luna', 'Bob', 'Mel', 'Pipoca', 'Fred', 'Nina', 'Max', 'Lola', 'Zeus', 'Amora', 'Paçoca', 'Bento', 'Cacau', 'Toddy', 'Belinha', 'Simba', 'Mike', 'Kiara', 'Bidu', 'Chico', 'Malu', 'Duque', 'Pandora', 'Tobias'];
const CAT_NAMES = ['Mia', 'Frajola', 'Nala', 'Salém', 'Mingau', 'Lili', 'Tom', 'Pituca', 'Garfield', 'Jade', 'Felix', 'Cookie'];
const DOG_BREEDS: [string, PetSize][] = [['Golden Retriever', 'grande'], ['Labrador', 'grande'], ['Shih Tzu', 'pequeno'], ['Yorkshire', 'mini'], ['Border Collie', 'medio'], ['Spitz Alemão', 'mini'], ['Vira-lata (SRD)', 'medio'], ['Buldogue Francês', 'pequeno'], ['Beagle', 'medio'], ['Pastor Alemão', 'grande'], ['Lhasa Apso', 'pequeno'], ['Dachshund', 'pequeno'], ['Husky Siberiano', 'grande'], ['Poodle', 'pequeno'], ['Bernese', 'gigante'], ['Pug', 'pequeno']];
const CAT_BREEDS = ['SRD', 'Siamês', 'Persa', 'Maine Coon', 'Angorá', 'British Shorthair'];
const TEMPERAMENTS = ['Dócil e brincalhão', 'Ansioso com barulho de fogos', 'Muito sociável com outros cães', 'Tímido no começo, depois se solta', 'Cheio de energia, puxa a guia', 'Calmo, gosta de colo', 'Reativo a cães grandes — passear separado', 'Idoso, ritmo tranquilo'];
const CARE = ['Ração 2x ao dia (8h e 18h)', 'Toma antialérgico às 20h', 'Não pode comer frango', 'Usar peitoral, não coleira', 'Gosta de petisco de cenoura', 'Escovar após o banho', 'Água sempre fresca; bebe bastante', 'Evitar escadas (displasia leve)'];

const phoneFor = (ddd: string, i: number) => `+55${ddd}9${String(81000000 + ((i * 7919) % 18999999)).padStart(8, '0')}`;
const dddOf = (cityId: string) => (cityId.startsWith('porto') ? '51' : cityId.startsWith('caxias') ? '54' : cityId.startsWith('santa') ? '55' : cityId.startsWith('flor') ? '48' : '54');

/* ---------- prestadores ---------- */
type ProvSeed = {
  id: string; name: string; kind: Provider['kind']; cats: CategoryId[]; city: string; hood: string;
  tagline: string; bio: string; quality: number; reviews: number; years: number; plan: Provider['plan'];
  featured?: boolean; cats_only?: boolean; wa?: boolean; venue?: boolean; amenities: string[]; policy: Provider['cancellationPolicy'];
};

const PROVS: ProvSeed[] = [
  { id: MAIN_PROVIDER_ID, name: 'Casa da Carla Pet House', kind: 'autonomo', cats: ['hospedagem', 'creche', 'passeio', 'pet_sitter'], city: 'passo-fundo-rs', hood: 'Vila Rodrigues',
    tagline: 'Hospedagem domiciliar, creche e passeios com rotina de casa', quality: 4.92, reviews: 86, years: 7, plan: 'pro', featured: true, wa: true, venue: true, policy: 'moderada',
    amenities: ['Quintal telado 120 m²', 'Câmera para o tutor', 'Fotos diárias no WhatsApp', 'Sem gaiolas', 'Ar-condicionado no inverno', 'Área separada para gatos', 'Táxi dog'],
    bio: 'Sou a Carla, veterinária de formação e apaixonada por cães e gatos. Há 7 anos recebo pets na minha casa em Passo Fundo como se fossem da família: quintal telado, rotina de passeios, alimentação no horário do tutor e fotos todos os dias. Atendo no máximo 6 hóspedes por vez para garantir atenção individual. Antes da primeira hospedagem faço uma visita de adaptação gratuita.' },
  { id: 'prv-diego', name: 'Diego Passeios', kind: 'autonomo', cats: ['passeio'], city: 'passo-fundo-rs', hood: 'São Cristóvão', tagline: 'Passeios de 30 e 60 min com relatório de rota',
    quality: 4.71, reviews: 34, years: 4, plan: 'profissional', wa: true, policy: 'flexivel', amenities: ['Relatório com mapa da rota', 'Kit primeiros socorros', 'Água e saquinhos inclusos', 'Até 3 cães por grupo'],
    bio: 'Educador físico e dog walker. Passeios individuais ou em grupos pequenos (no máximo 3 cães compatíveis). Envio o trajeto e fotos ao final de cada passeio.' },
  { id: 'prv-bossa', name: 'Banho & Bossa Pet Shop', kind: 'empresa', cats: ['banho_tosa', 'petshop'], city: 'passo-fundo-rs', hood: 'Centro', tagline: 'Banho, tosa e estética com hora marcada no centro',
    quality: 4.83, reviews: 142, years: 11, plan: 'pro', featured: true, wa: true, venue: true, policy: 'flexivel', amenities: ['Produtos hipoalergênicos', 'Secagem silenciosa', 'Táxi dog', 'Sala de espera para gatos', 'Estacionamento'],
    bio: 'Pet shop familiar com 11 anos no centro de Passo Fundo. Equipe de 4 groomers certificados, banho com produtos hipoalergênicos e área exclusiva para felinos.' },
  { id: 'prv-patrulha', name: 'Patrulha Canina Adestramento', kind: 'empresa', cats: ['adestramento'], city: 'passo-fundo-rs', hood: 'Boqueirão', tagline: 'Adestramento positivo e correção de comportamento',
    quality: 4.88, reviews: 41, years: 9, plan: 'profissional', wa: true, policy: 'moderada', amenities: ['Método reforço positivo', 'Aulas em casa ou no parque', 'Plano por escrito', 'Suporte por WhatsApp entre aulas'],
    bio: 'Adestradores com formação em comportamento animal. Trabalhamos obediência básica, puxar guia, ansiedade de separação e socialização, sempre com reforço positivo.' },
  { id: 'prv-fernanda', name: 'Dra. Fernanda Lopes — Vet em Casa', kind: 'autonomo', cats: ['vet_domicilio'], city: 'passo-fundo-rs', hood: 'Petrópolis', tagline: 'Consultas, vacinas e exames sem estresse, na sua casa',
    quality: 4.95, reviews: 58, years: 12, plan: 'profissional', policy: 'moderada', amenities: ['CRMV-RS ativo', 'Vacinas importadas', 'Coleta de exames', 'Atendimento a gatos (cat friendly)'],
    bio: 'Médica-veterinária (CRMV-RS fictício para demonstração) com 12 anos de clínica. Atendimento domiciliar ideal para gatos, idosos e pets que se estressam no transporte.' },
  { id: 'prv-setevidas', name: 'Gatil Sete Vidas', kind: 'autonomo', cats: ['hospedagem', 'pet_sitter'], city: 'passo-fundo-rs', hood: 'Vera Cruz', tagline: 'Hotel e pet sitter exclusivo para gatos',
    quality: 4.9, reviews: 27, years: 5, plan: 'profissional', cats_only: true, venue: true, policy: 'moderada', amenities: ['Somente gatos', 'Telas em todas as janelas', 'Suítes individuais', 'Arranhadores e prateleiras'],
    bio: 'Espaço 100% felino, silencioso e telado. Cada gato fica em suíte individual com caixa de areia própria. Também faço visitas na sua casa.' },
  { id: 'prv-recanto', name: 'Recanto Au Au Creche', kind: 'empresa', cats: ['creche', 'hospedagem'], city: 'passo-fundo-rs', hood: 'Lucas Araújo', tagline: 'Creche com grupos por porte e piscina no verão',
    quality: 4.62, reviews: 73, years: 6, plan: 'profissional', venue: true, wa: true, policy: 'flexivel', amenities: ['Grupos separados por porte', 'Piscina (verão)', 'Transporte incluso no pacote mensal', 'Monitoras treinadas'],
    bio: 'Creche e hotel com 800 m² de área verde. Separação por porte e temperamento, atividades de enriquecimento ambiental e soneca supervisionada.' },
  { id: 'prv-julia', name: 'Júlia Pet Sitter', kind: 'autonomo', cats: ['pet_sitter', 'passeio'], city: 'passo-fundo-rs', hood: 'Centro', tagline: 'Visitas em casa enquanto você trabalha ou viaja',
    quality: 4.79, reviews: 22, years: 3, plan: 'essencial', policy: 'flexivel', amenities: ['Aplica medicação oral', 'Envio de vídeo a cada visita', 'Rega plantas de cortesia'],
    bio: 'Estudante de veterinária na UPF. Faço visitas para alimentar, brincar, limpar caixinha e dar medicação. Atendo cães e gatos no centro e bairros próximos.' },
  { id: 'prv-mundopet', name: 'Mundo Pet Passo Fundo', kind: 'empresa', cats: ['petshop', 'banho_tosa'], city: 'passo-fundo-rs', hood: 'Annes', tagline: 'Pet shop completo com banho express',
    quality: 4.41, reviews: 64, years: 8, plan: 'essencial', venue: true, policy: 'flexivel', amenities: ['Banho express em 1 h', 'Táxi dog', 'Ração com entrega no bairro'],
    bio: 'Pet shop de bairro com banho e tosa, acessórios e entrega de ração. Banho express para quem tem pressa.' },
  { id: 'prv-matheus', name: 'Matheus Dog Walker', kind: 'autonomo', cats: ['passeio'], city: 'passo-fundo-rs', hood: 'Vila Luiza', tagline: 'Novo na plataforma — passeios no fim da tarde',
    quality: 0, reviews: 0, years: 1, plan: 'essencial', policy: 'flexivel', amenities: ['Passeios das 17h às 20h', 'Somente cães pequenos e médios'],
    bio: 'Começando como dog walker. Passeios no fim da tarde para cães pequenos e médios na região da Vila Luiza.' },
  { id: 'prv-moinhos', name: 'Moinhos Pet Spa', kind: 'empresa', cats: ['banho_tosa'], city: 'porto-alegre-rs', hood: 'Moinhos de Vento', tagline: 'Spa e estética pet premium',
    quality: 4.86, reviews: 118, years: 10, plan: 'pro', featured: true, venue: true, wa: true, policy: 'moderada', amenities: ['Ozonioterapia', 'Hidratação com argila', 'Tosa na tesoura', 'Câmera ao vivo'],
    bio: 'Spa pet com tosadores premiados, banho de ozônio e hidratação profunda. Atendimento só com hora marcada para evitar espera.' },
  { id: 'prv-bomfim', name: 'Bom Fim Dog Walkers', kind: 'empresa', cats: ['passeio'], city: 'porto-alegre-rs', hood: 'Bom Fim', tagline: 'Passeios na Redenção com equipe treinada',
    quality: 4.74, reviews: 66, years: 5, plan: 'profissional', wa: true, policy: 'flexivel', amenities: ['Passeios na Redenção', 'GPS em tempo real', 'Equipe uniformizada'],
    bio: 'Equipe de 6 passeadores no Bom Fim e arredores. Rotas pelo Parque da Redenção, relatório com GPS e fotos.' },
  { id: 'prv-patas', name: 'Hotelzinho Patas & Cia', kind: 'empresa', cats: ['hospedagem', 'creche'], city: 'porto-alegre-rs', hood: 'Menino Deus', tagline: 'Hotel e creche com monitoramento 24 h',
    quality: 4.58, reviews: 91, years: 7, plan: 'profissional', venue: true, policy: 'moderada', amenities: ['Monitoramento 24 h', 'Veterinário de plantão', 'Baias climatizadas'],
    bio: 'Hotel e creche com veterinário de plantão e câmeras 24 h. Ideal para viagens longas.' },
  { id: 'prv-vetcare', name: 'Clínica Móvel VetCare', kind: 'empresa', cats: ['vet_domicilio'], city: 'porto-alegre-rs', hood: 'Petrópolis', tagline: 'Clínica sobre rodas: consulta, vacina e exames',
    quality: 4.81, reviews: 47, years: 6, plan: 'profissional', policy: 'moderada', amenities: ['Van equipada', 'Ultrassom portátil', 'Atende fins de semana'],
    bio: 'Van-clínica equipada que vai até você. Consultas, vacinas, exames de sangue e ultrassom portátil.' },
  { id: 'prv-larissa', name: 'Larissa Cuida', kind: 'autonomo', cats: ['pet_sitter'], city: 'porto-alegre-rs', hood: 'Cidade Baixa', tagline: 'Pet sitter carinhosa para cães e gatos',
    quality: 4.69, reviews: 19, years: 2, plan: 'essencial', policy: 'flexivel', amenities: ['Pernoite na casa do tutor', 'Medicação injetável (com prescrição)'],
    bio: 'Cuido do seu pet na sua casa, inclusive com pernoite. Experiência com animais idosos e medicação.' },
  { id: 'prv-cidadao', name: 'Escola Cão Cidadão Sul', kind: 'empresa', cats: ['adestramento'], city: 'porto-alegre-rs', hood: 'Tristeza', tagline: 'Turmas e aulas individuais de obediência',
    quality: 4.77, reviews: 38, years: 8, plan: 'profissional', policy: 'moderada', amenities: ['Turmas aos sábados', 'Aulas individuais', 'Certificado de conclusão'],
    bio: 'Escola de adestramento com turmas de socialização para filhotes e aulas individuais de obediência.' },
  { id: 'prv-auxiliadora', name: 'Petshop Auxiliadora', kind: 'empresa', cats: ['petshop', 'banho_tosa'], city: 'porto-alegre-rs', hood: 'Auxiliadora', tagline: 'Tudo para seu pet a duas quadras de casa',
    quality: 4.35, reviews: 55, years: 15, plan: 'essencial', venue: true, policy: 'flexivel', amenities: ['Entrega em 2 h', 'Banho e tosa', 'Farmácia veterinária'],
    bio: 'Pet shop tradicional do bairro Auxiliadora, com farmácia veterinária e entrega rápida.' },
  { id: 'prv-serra', name: 'Serra Pet House', kind: 'empresa', cats: ['hospedagem', 'creche'], city: 'caxias-do-sul-rs', hood: 'São Pelegrino', tagline: 'Pet house aquecida para o inverno da serra',
    quality: 4.84, reviews: 52, years: 6, plan: 'pro', featured: true, venue: true, wa: true, policy: 'moderada', amenities: ['Piso aquecido', 'Caminhas ortopédicas', 'Fotos diárias'],
    bio: 'Casa adaptada com piso aquecido, sem baias, para no máximo 10 hóspedes. Rotina de passeio e descanso.' },
  { id: 'prv-bruna', name: 'Bruna Passeios & Cia', kind: 'autonomo', cats: ['passeio', 'pet_sitter'], city: 'caxias-do-sul-rs', hood: 'Exposição', tagline: 'Passeios e visitas na região da Exposição',
    quality: 4.66, reviews: 24, years: 3, plan: 'essencial', wa: true, policy: 'flexivel', amenities: ['Passeio com capa de chuva', 'Visitas de 30 e 60 min'],
    bio: 'Passeio com chuva ou sol (tenho capas para cães!). Visitas para alimentar e fazer companhia.' },
  { id: 'prv-banhoserra', name: 'Banho na Serra', kind: 'empresa', cats: ['banho_tosa'], city: 'caxias-do-sul-rs', hood: 'Centro', tagline: 'Banho e tosa com secagem natural',
    quality: 4.52, reviews: 61, years: 9, plan: 'profissional', venue: true, policy: 'flexivel', amenities: ['Secagem natural', 'Tosa bebê', 'Perfume hipoalergênico'],
    bio: 'Banho e tosa no centro de Caxias. Secagem natural, sem estufa, e tosa bebê especialidade da casa.' },
  { id: 'prv-camobi', name: 'Camobi Pet Care', kind: 'autonomo', cats: ['pet_sitter', 'passeio', 'hospedagem'], city: 'santa-maria-rs', hood: 'Camobi', tagline: 'Cuidado completo perto da UFSM',
    quality: 4.73, reviews: 29, years: 4, plan: 'profissional', wa: true, policy: 'moderada', amenities: ['Hospedagem domiciliar', 'Passeios', 'Visitas'],
    bio: 'Cuido de pets de estudantes e famílias em Camobi: passeios, visitas e hospedagem domiciliar.' },
  { id: 'prv-lourdes', name: 'Estética Animal Lourdes', kind: 'empresa', cats: ['banho_tosa', 'petshop'], city: 'santa-maria-rs', hood: 'Nossa Senhora de Lourdes', tagline: 'Banho, tosa e loja',
    quality: 4.47, reviews: 33, years: 7, plan: 'essencial', venue: true, policy: 'flexivel', amenities: ['Loja de acessórios', 'Táxi dog'],
    bio: 'Banho, tosa e acessórios no bairro Nossa Senhora de Lourdes.' },
  { id: 'prv-lagoa', name: 'Lagoa Dog Club', kind: 'empresa', cats: ['creche', 'passeio', 'hospedagem'], city: 'florianopolis-sc', hood: 'Lagoa da Conceição', tagline: 'Creche com trilha e praia para cães',
    quality: 4.89, reviews: 77, years: 6, plan: 'pro', featured: true, venue: true, wa: true, policy: 'moderada', amenities: ['Trilhas guiadas', 'Praia pet friendly', 'Ducha pós-passeio', 'Van com busca'],
    bio: 'Clube para cães ativos: creche com trilhas, passeios na praia e hospedagem com muito espaço verde.' },
  { id: 'prv-campeche', name: 'Campeche Pet Sitter', kind: 'autonomo', cats: ['pet_sitter'], city: 'florianopolis-sc', hood: 'Campeche', tagline: 'Visitas e pernoite no sul da ilha',
    quality: 4.71, reviews: 18, years: 3, plan: 'essencial', policy: 'flexivel', amenities: ['Pernoite', 'Visitas de 1 h'],
    bio: 'Pet sitter no sul da ilha, com pernoite para quem viaja e visitas diárias.' },
  { id: 'prv-vetlar', name: 'VetLar Floripa', kind: 'empresa', cats: ['vet_domicilio'], city: 'florianopolis-sc', hood: 'Trindade', tagline: 'Veterinários a domicílio 7 dias por semana',
    quality: 4.78, reviews: 36, years: 5, plan: 'profissional', policy: 'moderada', amenities: ['Atende 7 dias', 'Gatos e exóticos', 'Exames em casa'],
    bio: 'Equipe veterinária domiciliar, 7 dias por semana, inclusive para gatos e pequenos exóticos.' },
  { id: 'prv-ilha', name: 'Ilha Pet Grooming', kind: 'empresa', cats: ['banho_tosa'], city: 'florianopolis-sc', hood: 'Itacorubi', tagline: 'Grooming com técnicas de exposição',
    quality: 4.64, reviews: 44, years: 4, plan: 'profissional', venue: true, policy: 'flexivel', amenities: ['Tosa de raça', 'Hidratação', 'Banho a seco para gatos'],
    bio: 'Grooming profissional com padrão de exposição, hidratação e banho a seco para gatos.' },
];

/* ---------- serviços por categoria ---------- */
type SvcT = { name: string; desc: string; price: [number, number]; unit: Service['unit']; dur: number; sizes?: PetSize[]; species?: Species[] };
const SVC: Record<CategoryId, SvcT[]> = {
  passeio: [
    { name: 'Passeio 30 min', desc: 'Volta no quarteirão com xixi, cocô e água. Ideal para filhotes e idosos.', price: [2500, 3500], unit: 'passeio', dur: 30, species: ['cao'] },
    { name: 'Passeio 60 min', desc: 'Passeio completo com parque, gasto de energia e relatório de rota.', price: [4000, 5500], unit: 'passeio', dur: 60, species: ['cao'] },
    { name: 'Passeio em grupo (até 3 cães)', desc: 'Grupo pequeno de cães compatíveis. Ótimo para socialização.', price: [3000, 3800], unit: 'passeio', dur: 60, species: ['cao'], sizes: ['pequeno', 'medio', 'grande'] },
  ],
  pet_sitter: [
    { name: 'Visita em domicílio (40 min)', desc: 'Alimentação, água, limpeza de caixinha ou tapete, brincadeira e fotos.', price: [4500, 6000], unit: 'visita', dur: 40 },
    { name: 'Pernoite na casa do tutor', desc: 'Cuidador dorme na sua casa, das 20h às 8h, com rotina completa.', price: [12000, 16000], unit: 'diaria', dur: 720 },
  ],
  hospedagem: [
    { name: 'Diária de hospedagem', desc: 'Hospedagem com rotina de casa, passeios e fotos diárias. Check-in a partir das 8h.', price: [7000, 11000], unit: 'diaria', dur: 1440 },
    { name: 'Hospedagem para gatos', desc: 'Ambiente separado e calmo, caixa de areia própria e arranhadores.', price: [5000, 7000], unit: 'diaria', dur: 1440, species: ['gato'] },
  ],
  creche: [
    { name: 'Day care (diária)', desc: 'Das 7h30 às 18h30 com atividades, socialização e soneca.', price: [5500, 7500], unit: 'diaria', dur: 660, species: ['cao'] },
    { name: 'Meio período', desc: 'Manhã ou tarde (até 5 h). Perfeito para adaptação.', price: [3800, 4500], unit: 'servico', dur: 300, species: ['cao'] },
  ],
  banho_tosa: [
    { name: 'Banho (porte pequeno)', desc: 'Banho com shampoo neutro, secagem, corte de unhas e limpeza de ouvidos.', price: [5000, 6500], unit: 'servico', dur: 60, sizes: ['mini', 'pequeno'] },
    { name: 'Banho (porte médio/grande)', desc: 'Banho completo com escovação e perfume hipoalergênico.', price: [7000, 9500], unit: 'servico', dur: 90, sizes: ['medio', 'grande', 'gigante'] },
    { name: 'Banho e tosa higiênica', desc: 'Banho + tosa de patas, barriga e região íntima.', price: [7500, 9000], unit: 'servico', dur: 90 },
    { name: 'Tosa completa', desc: 'Tosa na máquina ou tesoura conforme a raça, com banho incluso.', price: [11000, 14000], unit: 'servico', dur: 120 },
    { name: 'Hidratação', desc: 'Máscara hidratante para pelos ressecados (adicional ao banho).', price: [3000, 4000], unit: 'servico', dur: 20 },
  ],
  petshop: [
    { name: 'Táxi dog (busca e entrega)', desc: 'Buscamos e levamos seu pet em até 5 km.', price: [2000, 3000], unit: 'servico', dur: 30 },
    { name: 'Corte de unhas', desc: 'Corte e lixamento de unhas.', price: [1800, 2500], unit: 'servico', dur: 15 },
  ],
  adestramento: [
    { name: 'Avaliação comportamental', desc: 'Primeira visita: entrevista, observação e plano de treino por escrito.', price: [9000, 12000], unit: 'servico', dur: 60, species: ['cao'] },
    { name: 'Aula individual (1 h)', desc: 'Aula em casa ou no parque com exercícios para praticar.', price: [12000, 16000], unit: 'hora', dur: 60, species: ['cao'] },
  ],
  vet_domicilio: [
    { name: 'Consulta domiciliar', desc: 'Exame clínico completo na sua casa, com receita digital.', price: [18000, 24000], unit: 'visita', dur: 60 },
    { name: 'Vacinação em casa', desc: 'Aplicação de vacina (V10/V5/antirrábica) com carteira atualizada.', price: [12000, 15000], unit: 'visita', dur: 30 },
    { name: 'Coleta de exames', desc: 'Coleta de sangue/urina com envio ao laboratório parceiro.', price: [9000, 11000], unit: 'visita', dur: 30 },
  ],
};

type PkgT = { svc: string; name: string; desc: string; sessions: number; factor: number; validity: number; popular?: boolean };
const PKG: Partial<Record<CategoryId, PkgT[]>> = {
  passeio: [
    { svc: 'Passeio 60 min', name: '10 passeios de 60 min', desc: 'Use quando quiser em até 60 dias. Economize 15%.', sessions: 10, factor: 0.85, validity: 60, popular: true },
    { svc: 'Passeio 30 min', name: 'Mensal 20 passeios (seg a sex)', desc: 'Um passeio por dia útil durante o mês.', sessions: 20, factor: 0.8, validity: 35 },
  ],
  pet_sitter: [{ svc: 'Visita em domicílio (40 min)', name: 'Férias tranquilas — 7 visitas', desc: 'Uma visita por dia durante sua viagem.', sessions: 7, factor: 0.9, validity: 30 }],
  hospedagem: [{ svc: 'Diária de hospedagem', name: 'Pacote férias — 7 diárias', desc: 'Sete diárias com desconto e banho de saída.', sessions: 7, factor: 0.9, validity: 120 }],
  creche: [
    { svc: 'Day care (diária)', name: 'Creche mensal — 8 diárias', desc: 'Duas vezes por semana durante o mês.', sessions: 8, factor: 0.85, validity: 35, popular: true },
    { svc: 'Day care (diária)', name: 'Creche integral — 20 diárias', desc: 'Todos os dias úteis do mês.', sessions: 20, factor: 0.75, validity: 35 },
  ],
  banho_tosa: [
    { svc: 'Banho e tosa higiênica', name: 'Clube do banho — 4 banhos', desc: 'Um banho por semana durante o mês.', sessions: 4, factor: 0.82, validity: 35, popular: true },
    { svc: 'Banho e tosa higiênica', name: 'Bimestral — 8 banhos', desc: 'Oito banhos em até 70 dias.', sessions: 8, factor: 0.78, validity: 70 },
  ],
  adestramento: [{ svc: 'Aula individual (1 h)', name: 'Programa básico — 8 aulas', desc: 'Obediência básica completa: senta, fica, junto e vem.', sessions: 8, factor: 0.85, validity: 90, popular: true }],
  vet_domicilio: [{ svc: 'Consulta domiciliar', name: 'Check-up anual em casa', desc: 'Duas consultas no ano + uma coleta de exames.', sessions: 3, factor: 0.85, validity: 365 }],
};

/* ---------- avaliações ---------- */
const OPEN5 = ['Simplesmente perfeito!', 'Atendimento impecável.', 'Recomendo de olhos fechados.', 'Melhor experiência que já tive.', 'Superou as expectativas.', 'Profissional nota 10.', 'Cuidado de verdade.'];
const OPEN4 = ['Muito bom no geral.', 'Gostei bastante.', 'Ótimo serviço.', 'Experiência positiva.'];
const OPEN3 = ['Foi ok.', 'Razoável.', 'Atendeu, mas pode melhorar.'];
const DETAIL: Record<CategoryId, string[]> = {
  passeio: ['O {pet} volta cansado e feliz, e recebo o mapa da rota.', 'Pontual todos os dias, mesmo com chuva.', 'Mandou fotos do {pet} no parque, amei.', 'Respeitou o ritmo do {pet}, que já é idoso.'],
  pet_sitter: ['Cuidou do {pet} durante minha viagem e mandou vídeos todos os dias.', 'Deu o remédio do {pet} certinho no horário.', 'A casa ficou organizada e o {pet} super tranquilo.', 'Me senti segura deixando a chave.'],
  hospedagem: ['O {pet} ficou 10 dias e voltou tranquilo, sem estresse.', 'Recebi fotos diárias e a rotina de comida foi respeitada.', 'Ambiente limpo, sem cheiro e com muito espaço.', 'Fizeram a adaptação antes, o que ajudou muito o {pet}.'],
  creche: ['O {pet} chega em casa e dorme a noite toda.', 'Separação por porte me deixou tranquila.', 'O {pet} faz festa quando vê a van chegando.', 'Relatório diário com fotos e comportamento.'],
  banho_tosa: ['A tosa do {pet} ficou exatamente como pedi.', 'Cheirosinho por dias e sem irritação na pele.', 'Respeitaram o horário, sem espera.', 'Muito cuidado com o {pet}, que tem medo de secador.'],
  petshop: ['Táxi dog pontual e motorista muito cuidadoso.', 'Atendimento rápido e simpático.', 'Preço justo e boa variedade.'],
  adestramento: ['Em 4 aulas o {pet} parou de puxar a guia.', 'Explicou tudo com paciência para a família toda.', 'Método positivo, sem gritos nem enforcador.', 'O plano por escrito ajudou a treinar entre as aulas.'],
  vet_domicilio: ['Atendeu o {pet} em casa sem nenhum estresse.', 'Explicou o diagnóstico com calma e mandou a receita no WhatsApp.', 'Vacinas em dia sem precisar sair de casa. Prático demais.', 'Muito delicada com o {pet}, que odeia ser examinado.'],
};
const CLOSE = ['Já agendei de novo.', 'Virei cliente fiel.', 'Obrigada pelo carinho!', 'Voltaremos com certeza.', '', '', 'Indico para todo mundo.'];
const NEG = ['Atrasou 20 minutos e não avisou.', 'Achei o preço um pouco alto para o que foi entregue.', 'A comunicação poderia ser mais rápida.', 'O {pet} voltou com a unha cortada muito curta.'];
const REPLIES = ['Muito obrigada pelo carinho! O {pet} é sempre bem-vindo por aqui. 🐾', 'Que alegria ler isso! Até a próxima.', 'Obrigado pela confiança. Foi um prazer cuidar do {pet}!', 'Agradecemos o retorno! Já ajustamos nosso processo para avisar sempre que houver atraso.'];

/* ---------- utilidades ---------- */
function makeId(prefix: string, n: number) { return `${prefix}-${n.toString(36).padStart(4, '0')}`; }

function hoursFor(kind: Provider['kind'], cats: CategoryId[]): Provider['openingHours'] {
  const allWeek = cats.includes('hospedagem') || cats.includes('pet_sitter');
  const out: Provider['openingHours'] = [];
  if (allWeek) out.push({ day: 0, open: '09:00', close: '18:00' });
  for (const d of [1, 2, 3, 4, 5] as const) out.push({ day: d, open: cats.includes('creche') ? '07:30' : '08:00', close: cats.includes('creche') ? '18:30' : '19:00' });
  out.push({ day: 6, open: '08:00', close: kind === 'empresa' ? '17:00' : '13:00' });
  return out;
}

/* ---------- geração ---------- */
export function generateDemo(now = new Date()): DemoDB {
  const db: DemoDB = {
    version: DEMO_VERSION, seededAt: iso(now), providers: [], services: [], packages: [], reviews: [], customers: [], pets: [],
    bookings: [], purchases: [], conversations: [], messages: [], templates: [], settings: [], favorites: {}, seq: 30000,
  };
  let n = 1;
  const nextId = (p: string) => makeId(p, n++);

  /* prestadores + serviços + pacotes */
  PROVS.forEach((p, i) => {
    const city = CITIES.find((c) => c.id === p.city)!;
    const species: Species[] = p.cats_only ? ['gato'] : p.cats.every((c) => c === 'passeio' || c === 'adestramento' || c === 'creche') ? ['cao'] : ['cao', 'gato'];
    const services: Service[] = [];
    for (const cat of p.cats) {
      const list = SVC[cat].filter((s) => !s.species || s.species.some((x) => species.includes(x)));
      const take = p.id === MAIN_PROVIDER_ID ? list : list.slice(0, cat === 'banho_tosa' ? int(3, 5) : int(1, list.length));
      for (const s of take) {
        if (p.cats_only && s.species && !s.species.includes('gato')) continue;
        const [lo, hi] = s.price;
        const price = p.id === MAIN_PROVIDER_ID
          ? ({ 'Diária de hospedagem': 9500, 'Hospedagem para gatos': 7000, 'Day care (diária)': 6500, 'Meio período': 4200, 'Passeio 30 min': 3000, 'Passeio 60 min': 4800, 'Passeio em grupo (até 3 cães)': 3500, 'Visita em domicílio (40 min)': 5500, 'Pernoite na casa do tutor': 14000 } as Record<string, number>)[s.name] ?? round5(lo + (hi - lo) * rnd())
          : round5(lo + (hi - lo) * (p.plan === 'pro' ? 0.75 + rnd() * 0.25 : rnd()));
        services.push({
          id: nextId('svc'), providerId: p.id, category: cat, name: s.name, description: s.desc, priceCents: price, unit: s.unit, durationMin: s.dur,
          species: s.species ? s.species.filter((x) => species.includes(x)) : species, sizes: s.sizes ?? (p.id === 'prv-matheus' ? ['mini', 'pequeno', 'medio'] : ['mini', 'pequeno', 'medio', 'grande', 'gigante']), active: true,
        });
      }
    }
    db.services.push(...services);

    const pkgs: ServicePackage[] = [];
    if (p.plan !== 'essencial' || p.id === 'prv-julia') {
      for (const cat of p.cats) {
        for (const t of PKG[cat] ?? []) {
          const svc = services.find((s) => s.name === t.svc);
          if (!svc) continue;
          if (p.id !== MAIN_PROVIDER_ID && pkgs.length >= 2) continue;
          const full = svc.priceCents * t.sessions;
          pkgs.push({ id: nextId('pkg'), providerId: p.id, serviceId: svc.id, name: t.name, description: t.desc, sessions: t.sessions,
            priceCents: round5(full * t.factor), fullPriceCents: full, validityDays: t.validity, active: true, popular: !!t.popular, soldCount: int(4, 60) });
        }
      }
    }
    db.packages.push(...pkgs);

    const geo = { lat: +(city.center.lat + (rnd() - 0.5) * 0.06).toFixed(3), lng: +(city.center.lng + (rnd() - 0.5) * 0.06).toFixed(3) };
    db.providers.push({
      id: p.id, slug: p.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      ownerUserId: `usr-${p.id}`, name: p.name, kind: p.kind, tagline: p.tagline, bio: p.bio, categories: p.cats, cityId: p.city, neighborhood: p.hood, geo,
      avatarSeed: i * 37 + 11, coverSeed: i * 53 + 7, rating: null, reviewCount: 0, ratingBreakdown: [0, 0, 0, 0, 0],
      responseTimeMin: p.plan === 'pro' ? int(4, 12) : p.plan === 'profissional' ? int(10, 35) : int(30, 120), responseRate: p.plan === 'essencial' ? 0.78 + rnd() * 0.12 : 0.9 + rnd() * 0.09,
      verification: { identity: p.id !== 'prv-matheus', background: p.plan !== 'essencial' || chance(0.4), venue: !!p.venue },
      yearsExperience: p.years, petsServed: p.reviews * int(3, 6) + int(5, 30), species, sizes: p.id === 'prv-matheus' ? ['mini', 'pequeno', 'medio'] : ['mini', 'pequeno', 'medio', 'grande', 'gigante'],
      priceFromCents: Math.min(...services.map((s) => s.priceCents)), whatsappOptIn: !!p.wa, whatsappPublic: p.wa ? phoneFor(dddOf(p.city), i + 300) : undefined,
      openingHours: hoursFor(p.kind, p.cats), amenities: p.amenities, cancellationPolicy: p.policy, plan: p.plan, featured: !!p.featured, status: 'publicado', isDemo: true,
      createdAt: iso(new Date(now.getTime() - p.years * 200 * DAY)),
    });

    /* avaliações históricas */
    for (let r = 0; r < p.reviews; r++) {
      const roll = rnd();
      const q = p.quality;
      const rating = (roll < (q - 4) * 0.95 ? 5 : roll < 0.9 ? 4 : roll < 0.97 ? 3 : roll < 0.99 ? 2 : 1) as Review['rating'];
      const cat = pick(p.cats);
      const isCat = species.includes('gato') && (p.cats_only || chance(0.25));
      const petName = isCat ? pick(CAT_NAMES) : pick(DOG_NAMES);
      const svc = services.find((s) => s.category === cat) ?? services[0];
      const opener = rating === 5 ? pick(OPEN5) : rating === 4 ? pick(OPEN4) : pick(OPEN3);
      const detail = pick(DETAIL[cat]).replaceAll('{pet}', petName);
      const extra = rating <= 3 ? ' ' + pick(NEG).replaceAll('{pet}', petName) : '';
      const text = `${opener} ${detail}${extra} ${rating >= 4 ? pick(CLOSE) : ''}`.trim();
      const daysAgo = Math.floor(Math.pow(rnd(), 1.6) * Math.min(700, p.years * 300)) + 1;
      const base = rating;
      db.reviews.push({
        id: nextId('rev'), providerId: p.id, authorName: `${pick(FIRST)} ${pick(LAST)[0]}.`, petName, petSpecies: isCat ? 'gato' : 'cao', serviceName: svc.name,
        rating, aspects: { pontualidade: Math.max(1, Math.min(5, base + (chance(0.2) ? -1 : 0))), cuidado: base, comunicacao: Math.max(1, Math.min(5, base + (chance(0.25) ? -1 : 0))) },
        text, createdAt: iso(new Date(now.getTime() - daysAgo * DAY - int(0, 600) * 60000)), verifiedBooking: true,
        reply: chance(p.plan === 'pro' ? 0.6 : 0.25) || rating <= 3 ? { text: pick(REPLIES).replaceAll('{pet}', petName), createdAt: iso(new Date(now.getTime() - (daysAgo - 1) * DAY)) } : undefined,
      });
    }
  });

  /* clientes e pets */
  const pf = 'passo-fundo-rs';
  const ana: Customer = { id: MAIN_CUSTOMER_ID, name: 'Ana Paula Ribeiro', phone: '+5554991234567', email: 'ana.ribeiro@exemplo.com.br', cityId: pf, neighborhood: 'Vila Rodrigues', waOptIn: true, marketingOptIn: false, createdAt: iso(new Date(now.getTime() - 420 * DAY)) };
  db.customers.push(ana);
  db.pets.push(
    { id: 'pet-thor', ownerId: ana.id, name: 'Thor', species: 'cao', breed: 'Golden Retriever', size: 'grande', birthYear: now.getFullYear() - 5, weightKg: 32, temperament: 'Dócil, adora água; puxa a guia nos primeiros minutos', careNotes: 'Ração 2x ao dia (8h e 18h). Não pode comer frango.', vaccinesUpToDate: true, avatarSeed: 3 },
    { id: 'pet-mia', ownerId: ana.id, name: 'Mia', species: 'gato', breed: 'SRD (tricolor)', size: 'pequeno', birthYear: now.getFullYear() - 4, weightKg: 4.2, temperament: 'Tímida com estranhos, prefere ambiente calmo', careNotes: 'Caixa de areia limpa 2x ao dia; ração úmida à noite.', vaccinesUpToDate: true, avatarSeed: 8 },
  );
  db.favorites[ana.id] = [MAIN_PROVIDER_ID, 'prv-bossa', 'prv-fernanda'];

  const usedNames = new Set(['Ana Paula Ribeiro']);
  const CRM_NAMES = ['Marcos Zanella', 'Juliana Fontana', 'Rafael Bortolini', 'Beatriz Almeida', 'Pedro Henrique Costa', 'Camila Schmitt', 'Lucas Tonial', 'Fernanda Dalla Rosa', 'Gustavo Lima', 'Patrícia Moraes', 'Tiago Bertoldo', 'Larissa Teixeira', 'Roberto Carvalho'];
  const customers: Customer[] = [];
  for (let c = 0; c < 38; c++) {
    let name = c < CRM_NAMES.length ? CRM_NAMES[c] : `${pick(FIRST)} ${pick(LAST)}`;
    while (usedNames.has(name)) name = `${pick(FIRST)} ${pick(LAST)}`;
    usedNames.add(name);
    const cu: Customer = { id: nextId('cus'), name, phone: phoneFor('54', c + 10), email: `${name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${c}@exemplo.com.br`,
      cityId: pf, neighborhood: pick(CITIES[0].neighborhoods), waOptIn: chance(0.92), marketingOptIn: chance(0.45), createdAt: iso(new Date(now.getTime() - int(20, 600) * DAY)) };
    customers.push(cu);
    const npets = chance(0.25) ? 2 : 1;
    for (let k = 0; k < npets; k++) {
      const isCat = chance(0.22);
      const [breed, size] = isCat ? [pick(CAT_BREEDS), 'pequeno' as PetSize] : pick(DOG_BREEDS);
      db.pets.push({ id: nextId('pet'), ownerId: cu.id, name: isCat ? pick(CAT_NAMES) : pick(DOG_NAMES), species: isCat ? 'gato' : 'cao', breed, size, birthYear: now.getFullYear() - int(1, 12),
        weightKg: size === 'mini' ? int(2, 4) : size === 'pequeno' ? int(5, 10) : size === 'medio' ? int(12, 24) : int(26, 50), temperament: pick(TEMPERAMENTS), careNotes: pick(CARE), vaccinesUpToDate: chance(0.85), avatarSeed: int(1, 99) });
    }
  }
  db.customers.push(...customers);

  /* agenda da Carla: passado (≈75 dias) + futuro (14 dias) */
  const carlaSvcs = db.services.filter((s) => s.providerId === MAIN_PROVIDER_ID);
  const svcByName = (nm: string) => carlaSvcs.find((s) => s.name === nm)!;
  const petsOf = (cid: string) => db.pets.filter((p) => p.ownerId === cid);
  const mkBooking = (cust: Customer, svc: Service, start: Date, status: BookingStatus, opts: Partial<Booking> = {}): Booking => {
    const pets = petsOf(cust.id).filter((p) => svc.species.includes(p.species));
    const petIds = (pets.length ? pets : petsOf(cust.id)).slice(0, svc.category === 'passeio' ? 1 : 2).map((p) => p.id);
    const nights = svc.unit === 'diaria' && svc.category === 'hospedagem' ? int(1, 6) : 1;
    const end = new Date(start.getTime() + (svc.unit === 'diaria' && svc.category === 'hospedagem' ? nights * DAY : svc.durationMin * 60000));
    const created = new Date(start.getTime() - int(1, 10) * DAY);
    const tl: BookingEvent[] = [{ at: iso(created), type: 'criado', label: 'Pedido criado pelo app', by: 'tutor' }];
    if (status !== 'pendente' && status !== 'recusado') tl.push({ at: iso(new Date(created.getTime() + 25 * 60000)), type: 'aguardando_cliente', label: 'Aceito pelo prestador — confirmação enviada no WhatsApp', by: 'prestador' });
    if (['confirmado', 'em_atendimento', 'concluido', 'nao_compareceu'].includes(status)) tl.push({ at: iso(new Date(created.getTime() + 70 * 60000)), type: 'confirmado', label: 'Tutor respondeu SIM no WhatsApp', by: 'whatsapp' });
    if (status === 'em_atendimento' || status === 'concluido') tl.push({ at: iso(start), type: 'em_atendimento', label: 'Check-in do pet', by: 'prestador' });
    if (status === 'concluido') tl.push({ at: iso(end), type: 'concluido', label: 'Atendimento concluído', by: 'prestador' });
    if (status === 'cancelado') tl.push({ at: iso(new Date(start.getTime() - DAY)), type: 'cancelado', label: 'Cancelado pelo tutor', by: 'tutor' });
    if (status === 'recusado') tl.push({ at: iso(new Date(created.getTime() + 40 * 60000)), type: 'recusado', label: 'Recusado: sem vaga no período', by: 'prestador' });
    return {
      id: nextId('bkg'), code: `CP-${++db.seq}`, providerId: svc.providerId, customerId: cust.id, petIds, serviceId: svc.id, start: iso(start), end: iso(end),
      priceCents: svc.priceCents * nights * Math.max(1, svc.category === 'passeio' ? 1 : petIds.length > 1 && svc.category === 'hospedagem' ? 2 : 1),
      status, channel: chance(0.7) ? 'app' : 'whatsapp', notes: chance(0.3) ? pick(CARE) : '', location: svc.category === 'passeio' || svc.category === 'pet_sitter' ? 'casa_tutor' : chance(0.3) ? 'busca_e_entrega' : 'local_prestador',
      waConfirmation: status === 'pendente' || status === 'recusado' ? undefined : { sentAt: tl[1]?.at ?? iso(created), repliedAt: tl[2]?.at, reply: tl[2] ? 'SIM' : undefined },
      reviewed: status === 'concluido' && chance(0.55), timeline: tl, createdAt: iso(created), ...opts,
    };
  };

  const weightedSvc = () => { const r = rnd(); return r < 0.32 ? svcByName('Passeio 60 min') : r < 0.48 ? svcByName('Passeio 30 min') : r < 0.68 ? svcByName('Day care (diária)') : r < 0.78 ? svcByName('Meio período') : r < 0.9 ? svcByName('Diária de hospedagem') : r < 0.95 ? svcByName('Visita em domicílio (40 min)') : r < 0.98 ? svcByName('Hospedagem para gatos') : svcByName('Pernoite na casa do tutor'); };
  const hourFor = (s: Service) => s.category === 'creche' ? 8 : s.category === 'hospedagem' ? int(8, 11) : s.category === 'pet_sitter' ? pick([9, 12, 18]) : pick([7, 8, 9, 10, 16, 17, 18]);
  // clientes "sumidos" (para a sugestão de reativação): só reservas antigas
  const inactive = new Set([customers[8].id, customers[16].id, customers[22].id, customers[29].id]);
  for (let d = -75; d <= -1; d++) {
    const perDay = int(1, 4);
    for (let k = 0; k < perDay; k++) {
      let cust = pick(customers);
      if (inactive.has(cust.id) && d > -45) cust = customers[int(0, 7)];
      const svc = weightedSvc();
      const st: BookingStatus = chance(0.9) ? 'concluido' : chance(0.6) ? 'cancelado' : 'nao_compareceu';
      db.bookings.push(mkBooking(cust, svc, atDay(now, d, hourFor(svc), pick([0, 0, 30])), st));
    }
  }
  // hoje
  const todayPlan: [number, string, number, BookingStatus][] = [[0, 'Day care (diária)', 8, 'em_atendimento'], [1, 'Passeio 60 min', 9, 'concluido'], [2, 'Passeio 30 min', 12, 'confirmado'], [3, 'Day care (diária)', 8, 'em_atendimento'], [4, 'Passeio 60 min', 17, 'confirmado'], [5, 'Visita em domicílio (40 min)', 18, 'aguardando_cliente']];
  for (const [ci, sn, h, st] of todayPlan) db.bookings.push(mkBooking(customers[ci], svcByName(sn), atDay(now, 0, h, h === 12 ? 30 : 0), st));
  // futuro
  for (let d = 1; d <= 14; d++) {
    const perDay = d <= 3 ? int(3, 5) : int(1, 3);
    for (let k = 0; k < perDay; k++) {
      const cust = customers[int(0, 30)];
      const svc = weightedSvc();
      const st: BookingStatus = d <= 2 ? (chance(0.75) ? 'confirmado' : 'aguardando_cliente') : chance(0.6) ? 'confirmado' : chance(0.5) ? 'aguardando_cliente' : 'pendente';
      db.bookings.push(mkBooking(cust, svc, atDay(now, d, hourFor(svc), pick([0, 30])), st));
    }
  }

  /* reservas da Ana */
  const anaThorHosp = mkBooking(ana, svcByName('Diária de hospedagem'), atDay(now, 9, 9), 'pendente', { notes: 'Viagem a Gramado. Thor come ração Premier 2x ao dia; levo a ração.', channel: 'app', location: 'local_prestador' });
  anaThorHosp.petIds = ['pet-thor']; anaThorHosp.end = iso(atDay(now, 12, 18)); anaThorHosp.priceCents = 9500 * 3; anaThorHosp.timeline = [{ at: iso(minutesAgo(now, 38)), type: 'criado', label: 'Pedido criado pelo app', by: 'tutor' }]; anaThorHosp.createdAt = iso(minutesAgo(now, 38));
  db.bookings.push(anaThorHosp);
  const anaPasseioSoon = mkBooking(ana, svcByName('Passeio 60 min'), atDay(now, 1, 8), 'aguardando_cliente');
  anaPasseioSoon.petIds = ['pet-thor']; anaPasseioSoon.waConfirmation = { sentAt: iso(minutesAgo(now, 15)) };
  anaPasseioSoon.timeline = [{ at: iso(minutesAgo(now, 120)), type: 'criado', label: 'Pedido criado pelo app (pacote 10 passeios)', by: 'tutor' }, { at: iso(minutesAgo(now, 15)), type: 'aguardando_cliente', label: 'Aceito pelo prestador — confirmação enviada no WhatsApp', by: 'prestador' }];
  db.bookings.push(anaPasseioSoon);
  for (const d of [-40, -26, -12, -5]) { const b = mkBooking(ana, svcByName('Passeio 60 min'), atDay(now, d, 8), 'concluido'); b.petIds = ['pet-thor']; b.reviewed = d !== -5; db.bookings.push(b); }

  // Ana com outros prestadores
  const svcOf = (pid: string, nm?: string) => db.services.find((s) => s.providerId === pid && (!nm || s.name === nm)) ?? db.services.find((s) => s.providerId === pid)!;
  const anaBossa = mkBooking(ana, svcOf('prv-bossa', 'Banho (porte médio/grande)'), atDay(now, -9, 14), 'concluido'); anaBossa.petIds = ['pet-thor']; anaBossa.reviewed = true; db.bookings.push(anaBossa);
  const anaVet = mkBooking(ana, svcOf('prv-fernanda', 'Vacinação em casa'), atDay(now, -3, 10), 'concluido'); anaVet.petIds = ['pet-mia']; anaVet.reviewed = false; db.bookings.push(anaVet);
  const anaBossa2 = mkBooking(ana, svcOf('prv-bossa', 'Banho (porte médio/grande)'), atDay(now, 5, 15), 'confirmado'); anaBossa2.petIds = ['pet-thor']; db.bookings.push(anaBossa2);

  /* compras de pacote */
  const carlaPkgs = db.packages.filter((p) => p.providerId === MAIN_PROVIDER_ID);
  const pkg10 = carlaPkgs.find((p) => p.name.startsWith('10 passeios'))!;
  db.purchases.push({ id: 'pur-ana-10p', packageId: pkg10.id, providerId: MAIN_PROVIDER_ID, customerId: ana.id, sessionsTotal: 10, sessionsUsed: 5, priceCents: pkg10.priceCents, purchasedAt: iso(new Date(now.getTime() - 41 * DAY)), expiresAt: iso(new Date(now.getTime() + 19 * DAY)), status: 'ativo' });
  anaPasseioSoon.packagePurchaseId = 'pur-ana-10p'; anaPasseioSoon.priceCents = 0;
  for (let k = 0; k < 14; k++) {
    const pk = pick(carlaPkgs); const cu = customers[k * 2];
    const used = int(0, pk.sessions); const bought = int(3, 50);
    db.purchases.push({ id: nextId('pur'), packageId: pk.id, providerId: MAIN_PROVIDER_ID, customerId: cu.id, sessionsTotal: pk.sessions, sessionsUsed: used, priceCents: pk.priceCents,
      purchasedAt: iso(new Date(now.getTime() - bought * DAY)), expiresAt: iso(new Date(now.getTime() + (pk.validityDays - bought) * DAY)), status: used >= pk.sessions ? 'esgotado' : pk.validityDays - bought < 0 ? 'expirado' : 'ativo' });
  }
  const anaPkgBossa = db.packages.find((p) => p.providerId === 'prv-bossa');
  if (anaPkgBossa) db.purchases.push({ id: 'pur-ana-bossa', packageId: anaPkgBossa.id, providerId: 'prv-bossa', customerId: ana.id, sessionsTotal: anaPkgBossa.sessions, sessionsUsed: 1, priceCents: anaPkgBossa.priceCents, purchasedAt: iso(new Date(now.getTime() - 10 * DAY)), expiresAt: iso(new Date(now.getTime() + 25 * DAY)), status: 'ativo' });

  /* avaliações da Carla vinculadas a reservas recentes (para o painel de avaliações) */
  const carlaRecentDone = db.bookings.filter((b) => b.providerId === MAIN_PROVIDER_ID && b.status === 'concluido' && b.reviewed).slice(-8);
  for (const b of carlaRecentDone) {
    const cu = db.customers.find((c) => c.id === b.customerId)!; const pet = db.pets.find((p) => p.id === b.petIds[0]); const svc = carlaSvcs.find((s) => s.id === b.serviceId)!;
    const rating = (chance(0.85) ? 5 : 4) as Review['rating'];
    db.reviews.push({ id: nextId('rev'), providerId: MAIN_PROVIDER_ID, bookingId: b.id, authorName: `${cu.name.split(' ')[0]} ${cu.name.split(' ').slice(-1)[0][0]}.`, petName: pet?.name ?? 'pet', petSpecies: pet?.species ?? 'cao',
      serviceName: svc.name, rating, aspects: { pontualidade: rating, cuidado: 5, comunicacao: rating }, text: `${rating === 5 ? pick(OPEN5) : pick(OPEN4)} ${pick(DETAIL[svc.category]).replaceAll('{pet}', pet?.name ?? 'pet')} ${pick(CLOSE)}`.trim(),
      createdAt: iso(new Date(new Date(b.end).getTime() + 5 * 3600000)), verifiedBooking: true, reply: chance(0.4) ? { text: pick(REPLIES).replaceAll('{pet}', pet?.name ?? 'pet'), createdAt: iso(new Date(new Date(b.end).getTime() + 9 * 3600000)) } : undefined });
  }
  // avaliação da Ana para a Bossa
  db.reviews.push({ id: nextId('rev'), providerId: 'prv-bossa', bookingId: anaBossa.id, authorName: 'Ana R.', petName: 'Thor', petSpecies: 'cao', serviceName: 'Banho (porte médio/grande)', rating: 5,
    aspects: { pontualidade: 5, cuidado: 5, comunicacao: 5 }, text: 'O Thor tem medo de secador e a equipe teve uma paciência enorme. Voltou cheiroso e tranquilo. Já agendei o próximo!', createdAt: iso(new Date(now.getTime() - 8 * DAY)), verifiedBooking: true,
    reply: { text: 'Obrigada, Ana! O Thor é um amor. Até o próximo banho! 🛁', createdAt: iso(new Date(now.getTime() - 8 * DAY + 3 * 3600000)) } });

  /* recalcula notas a partir das avaliações (nunca 5★ inventado) */
  for (const p of db.providers) {
    const rs = db.reviews.filter((r) => r.providerId === p.id);
    p.reviewCount = rs.length;
    p.ratingBreakdown = [1, 2, 3, 4, 5].map((s) => rs.filter((r) => r.rating === s).length) as Provider['ratingBreakdown'];
    p.rating = rs.length ? Math.round((rs.reduce((a, r) => a + r.rating, 0) / rs.length) * 100) / 100 : null;
  }

  /* templates do WhatsApp (nomes técnicos para aprovação na Meta) */
  db.templates = [
    { id: 'tpl-recebido', name: 'pedido_recebido', title: 'Pedido recebido', category: 'utility', approved: true, buttons: [],
      body: 'Olá, {{nome}}! Recebemos seu pedido de {{servico}} para {{pet}} em {{data}} às {{hora}}. {{prestador}} vai responder em breve. Protocolo {{codigo}}.' },
    { id: 'tpl-confirmacao', name: 'confirmacao_agendamento', title: 'Pedir confirmação', category: 'utility', approved: true, buttons: ['Confirmar', 'Remarcar', 'Cancelar'],
      body: 'Oi, {{nome}}! {{prestador}} aceitou o agendamento de {{servico}} para {{pet}} em {{data}} às {{hora}}. Toque em *Confirmar* para garantir sua vaga. 🐾' },
    { id: 'tpl-lembrete', name: 'lembrete_24h', title: 'Lembrete 24 h', category: 'utility', approved: true, buttons: ['Estarei lá', 'Preciso remarcar'],
      body: 'Lembrete: amanhã às {{hora}} tem {{servico}} do {{pet}} com {{prestador}}. Qualquer imprevisto, é só responder aqui.' },
    { id: 'tpl-concluido', name: 'pos_atendimento_avaliacao', title: 'Pedir avaliação', category: 'utility', approved: true, buttons: ['Avaliar agora'],
      body: '{{pet}} já está pronto(a)! Obrigado por confiar em {{prestador}}. Conta pra gente como foi? Sua avaliação ajuda outros tutores.' },
    { id: 'tpl-vaga', name: 'vaga_liberada', title: 'Vaga liberada', category: 'marketing', approved: true, buttons: ['Quero a vaga', 'Agora não'],
      body: 'Oi, {{nome}}! Abriu uma vaga de {{servico}} em {{data}} às {{hora}}. Quer garantir para o {{pet}}?' },
    { id: 'tpl-reativacao', name: 'saudade_reativacao', title: 'Reativar cliente', category: 'marketing', approved: true, buttons: ['Agendar', 'Parar de receber'],
      body: 'Oi, {{nome}}! Faz um tempinho que o {{pet}} não vem nos visitar. Que tal agendar esta semana? Temos horários livres. 🐶' },
    { id: 'tpl-pacote', name: 'saldo_pacote', title: 'Saldo do pacote', category: 'utility', approved: false, buttons: [],
      body: '{{nome}}, seu pacote "{{pacote}}" tem {{saldo}} sessões restantes, válidas até {{validade}}.' },
  ];

  db.settings.push({ providerId: MAIN_PROVIDER_ID, waNumber: '+5554996681234', waProvider: 'cloud_api', waConnected: true, autoConfirmationRequest: true, reminder24h: true, reminder2h: false,
    postServiceReview: true, reactivationDays: 30, firstResponseSlaMin: 15, autoReplyOutsideHours: true, instantBooking: false });

  /* conversas do CRM WhatsApp (Carla) */
  const conv = (cust: Customer, status: Conversation['status'], msgs: [Message['from'], string, number, Partial<Message>?][], extra: Partial<Conversation> = {}) => {
    const id = nextId('cnv');
    msgs.forEach(([from, text, ago, more]) => db.messages.push({ id: nextId('msg'), conversationId: id, from, text, at: iso(minutesAgo(now, ago)), delivery: from === 'cliente' ? 'lido' : ago < 3 ? 'entregue' : 'lido', ...more }));
    const last = msgs[msgs.length - 1];
    const firstClient = msgs.find((m) => m[0] === 'cliente');
    db.conversations.push({ id, providerId: MAIN_PROVIDER_ID, customerId: cust.id, phone: cust.phone, status, tags: [], unread: 0, lastMessageAt: iso(minutesAgo(now, last[2])),
      lastMessagePreview: last[1].slice(0, 90), slaDueAt: status === 'aguardando_atendimento' && firstClient ? iso(new Date(minutesAgo(now, last[2]).getTime() + 15 * 60000)) : undefined, ...extra });
    return id;
  };
  const C = customers;
  const fmtD = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
  conv(ana, 'aguardando_atendimento', [
    ['bot', `Olá, Ana! Recebemos seu pedido de Diária de hospedagem para Thor em ${fmtD(atDay(now, 9, 9))} às 09:00. Casa da Carla Pet House vai responder em breve. Protocolo ${anaThorHosp.code}.`, 38, { template: 'pedido_recebido' }],
    ['cliente', 'Oi Carla! Fiz o pedido pelo app pra hospedar o Thor de sexta a segunda 😊', 36],
    ['cliente', 'Ele precisa tomar o remédio de alergia à noite, tudo bem?', 35],
  ], { unread: 2, bookingId: anaThorHosp.id, tags: ['hospedagem', 'cliente recorrente'] });
  conv(C[0], 'novo', [['cliente', 'Boa tarde! Vi seu perfil no Cuidopê. Qual o valor do pacote mensal de creche? Tenho um border collie de 2 anos.', 6]], { unread: 1, tags: ['lead', 'creche'], slaDueAt: iso(new Date(minutesAgo(now, 6).getTime() + 15 * 60000)) });
  const jb = db.bookings.find((b) => b.customerId === C[1].id && b.status === 'aguardando_cliente') ?? db.bookings.find((b) => b.status === 'aguardando_cliente' && b.providerId === MAIN_PROVIDER_ID && b.customerId !== ana.id)!;
  const jc = db.customers.find((c) => c.id === jb.customerId)!;
  const jpet = db.pets.find((p) => p.id === jb.petIds[0]);
  conv(jc, 'aguardando_cliente', [
    ['cliente', `Oi! Consigo agendar para o ${jpet?.name ?? 'meu cachorro'}?`, 190],
    ['prestador', 'Oi! Consegue sim, já aceitei aqui. Vou te mandar a confirmação 😉', 160],
    ['bot', `Oi, ${jc.name.split(' ')[0]}! Casa da Carla Pet House aceitou o agendamento de ${carlaSvcs.find((s) => s.id === jb.serviceId)?.name} para ${jpet?.name} em ${fmtD(new Date(jb.start))} às ${new Date(jb.start).toTimeString().slice(0, 5)}. Toque em *Confirmar* para garantir sua vaga. 🐾`, 159, { template: 'confirmacao_agendamento', buttons: ['Confirmar', 'Remarcar', 'Cancelar'] }],
  ], { bookingId: jb.id, tags: ['aguardando confirmação'] });
  conv(C[2], 'agendado', [
    ['bot', 'Oi, Rafael! Casa da Carla Pet House aceitou o agendamento de Passeio 60 min para Bento amanhã às 08:00. Toque em *Confirmar* para garantir sua vaga. 🐾', 300, { template: 'confirmacao_agendamento', buttons: ['Confirmar', 'Remarcar', 'Cancelar'] }],
    ['cliente', 'Confirmar', 290],
    ['sistema', 'Agendamento confirmado pelo cliente via WhatsApp ✓', 290],
    ['prestador', 'Perfeito, Rafael! Até amanhã 🐕', 285],
  ], { tags: ['passeio'] });
  conv(C[3], 'aguardando_atendimento', [
    ['cliente', 'Carla, vou precisar remarcar a creche de quinta. Tem vaga na sexta?', 22],
  ], { unread: 1, tags: ['remarcação'] });
  conv(C[4], 'resolvido', [
    ['bot', 'Mel já está pronta! Obrigado por confiar em Casa da Carla Pet House. Conta pra gente como foi? Sua avaliação ajuda outros tutores.', 1500, { template: 'pos_atendimento_avaliacao', buttons: ['Avaliar agora'] }],
    ['cliente', 'Avaliei! 5 estrelas merecidas 💛', 1440],
    ['prestador', 'Obrigada, Pedro! 🥰', 1430],
  ], { tags: ['avaliação'] });
  conv(C[5], 'novo', [['cliente', 'Olá! Vocês aceitam gatos para hospedagem? Viajo dia 20.', 3]], { unread: 1, tags: ['lead', 'gato'], slaDueAt: iso(new Date(minutesAgo(now, 3).getTime() + 15 * 60000)) });
  conv(C[6], 'aguardando_cliente', [
    ['cliente', 'Quantos passeios ainda tenho no pacote?', 260],
    ['prestador', 'Oi Lucas! Você tem 6 passeios restantes, válidos até o fim do mês. Quer que eu já reserve os horários de sempre (seg/qua/sex às 7h)?', 240],
  ], { tags: ['pacote'] });
  conv(C[7], 'agendado', [
    ['bot', 'Lembrete: amanhã às 08:00 tem Day care (diária) do Pipoca com Casa da Carla Pet House. Qualquer imprevisto, é só responder aqui.', 600, { template: 'lembrete_24h', buttons: ['Estarei lá', 'Preciso remarcar'] }],
    ['cliente', 'Estarei lá', 580],
  ], { tags: ['creche'] });
  conv(C[8], 'aguardando_cliente', [
    ['bot', 'Oi, Gustavo! Faz um tempinho que o Zeus não vem nos visitar. Que tal agendar esta semana? Temos horários livres. 🐶', 1300, { template: 'saudade_reativacao', buttons: ['Agendar', 'Parar de receber'] }],
  ], { tags: ['reativação'] });
  conv(C[9], 'resolvido', [
    ['cliente', 'A Luna voltou com a pata um pouco suja de barro ontem.', 3000],
    ['prestador', 'Oi Patrícia, desculpa! Choveu no fim da tarde. Já combinei de secar e limpar as patas antes da entrega. Hoje vai de banho cortesia 🛁', 2980],
    ['cliente', 'Que atenção! Obrigada 😊', 2950],
  ], { tags: ['pós-venda'] });
  conv(C[10], 'aguardando_cliente', [
    ['bot', `Oi, Tiago! Abriu uma vaga de Diária de hospedagem em ${fmtD(atDay(now, 2, 9))} às 09:00. Quer garantir para o Toddy?`, 50, { template: 'vaga_liberada', buttons: ['Quero a vaga', 'Agora não'] }],
  ], { tags: ['vaga liberada'] });
  conv(C[11], 'aguardando_atendimento', [
    ['cliente', 'Oi! Minha cachorra é reativa com cães grandes. Vocês fazem passeio individual?', 48],
    ['cliente', 'É uma lhasa de 6 anos', 47],
  ], { unread: 2, tags: ['lead', 'passeio'] });
  conv(C[12], 'resolvido', [
    ['cliente', 'Vou deixar para o mês que vem, obrigado.', 7000],
    ['prestador', 'Tudo bem, Roberto! Quando quiser é só chamar 🙂', 6990],
  ], { tags: ['perdido'] });

  return db;
}
