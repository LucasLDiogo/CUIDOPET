import { Bath, Footprints, GraduationCap, HandHeart, House, Store, Stethoscope, Sun, type LucideProps } from 'lucide-react';
import type { CategoryId } from '../domain/types';
const MAP: Record<CategoryId, (p: LucideProps) => React.ReactElement> = {
  passeio: (p) => <Footprints {...p} />, pet_sitter: (p) => <HandHeart {...p} />, hospedagem: (p) => <House {...p} />, creche: (p) => <Sun {...p} />,
  banho_tosa: (p) => <Bath {...p} />, petshop: (p) => <Store {...p} />, adestramento: (p) => <GraduationCap {...p} />, vet_domicilio: (p) => <Stethoscope {...p} />,
};
export function CategoryIcon({ id, ...p }: { id: CategoryId } & LucideProps) { return MAP[id](p); }
