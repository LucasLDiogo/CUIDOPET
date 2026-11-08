/**
 * Fotos e ilustrações do app. As fotos de pessoas e pets são da identidade visual do Cuidopê (IMAGEM/) e as
 * capas de categoria foram geradas localmente com FLUX (IMAGEM/gerar_imagens_flux.py). Tudo fictício (demo).
 * Prestadores sem foto própria usam a capa da categoria principal e avatar com iniciais.
 */
import type { CategoryId } from '../domain/types';

const FILES = import.meta.glob('../assets/img/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
export const img = (name: string): string | undefined => FILES[`../assets/img/${name}.webp`];

export const IMG = {
  hero: img('hero-tutora'),
  heroSm: img('hero-tutora-sm'),
  login: img('cena-login') ?? img('pessoa-ana'),
  prestador: img('cena-prestador') ?? img('pessoa-diego'),
  gato: img('cena-gato'),
  pacotes: img('cena-pacotes'),
  ana: img('pessoa-ana'),
  diego: img('pessoa-diego'),
  carla: img('pessoa-carla'),
  groomer: img('pessoa-groomer'),
};

export const categoryImage = (id: CategoryId | string): string | undefined => img(`cat-${id}`);

/** foto de perfil por slug (vale para demo, Supabase e Firebase, que usam o mesmo slug) */
const PROVIDER_AVATAR: Record<string, string | undefined> = {
  'casa-da-carla-pet-house': img('pessoa-carla-av'),
  'diego-passeios': img('pessoa-diego-av'),
  'banho-bossa-pet-shop': img('pessoa-groomer-av'),
};
export const providerAvatar = (slug?: string) => (slug ? PROVIDER_AVATAR[slug] : undefined);
export const providerCover = (p: { categories: string[] }) => categoryImage(p.categories[0]);

const PERSON_AVATAR: Record<string, string | undefined> = {
  'Ana Paula Ribeiro': img('pessoa-ana-av'),
  'Ana Paula': img('pessoa-ana-av'),
  'Ana R.': img('pessoa-ana-av'),
  'Casa da Carla Pet House': img('pessoa-carla-av'),
};
export const personAvatar = (name?: string) => (name ? PERSON_AVATAR[name] : undefined);

const PET_PHOTO: Record<string, string | undefined> = { 'pet-thor': img('pet-thor'), 'pet-mia': img('pet-mia') };
export const petPhoto = (id?: string) => (id ? PET_PHOTO[id] : undefined);
