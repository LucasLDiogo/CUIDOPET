export type Transitions<S extends string> = Readonly<Record<S, readonly S[]>>;

export interface Machine<S extends string> {
  readonly name: string;
  readonly initial: S;
  readonly transitions: Transitions<S>;
}

export class InvalidTransitionError extends Error {
  readonly code = 'invalid_transition';
  readonly machine: string;
  readonly from: string;
  readonly to: string;
  constructor(machine: string, from: string, to: string) {
    super(`${machine}: transição ${from} → ${to} não permitida`);
    this.machine = machine; this.from = from; this.to = to;
  }
}

export function canTransition<S extends string>(m: Machine<S>, from: S, to: S): boolean {
  return m.transitions[from]?.includes(to) ?? false;
}

export function assertTransition<S extends string>(m: Machine<S>, from: S, to: S): void {
  if (!canTransition(m, from, to)) throw new InvalidTransitionError(m.name, from, to);
}

export function isTerminal<S extends string>(m: Machine<S>, s: S): boolean {
  return (m.transitions[s]?.length ?? 0) === 0;
}

export function define<S extends string>(name: string, initial: S, transitions: Transitions<S>): Machine<S> {
  return Object.freeze({ name, initial, transitions });
}
