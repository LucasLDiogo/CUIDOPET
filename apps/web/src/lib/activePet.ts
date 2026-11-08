import { useEffect, useState } from 'react';

/** Pet ativo escolhido pelo tutor (personaliza busca e recomendações). Preferência local, só o id do pet. */
const KEY = 'cuidope.pet';
const EVT = 'cuidope:pet';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

export function useActivePet(): [string | null, (id: string) => void] {
  const [id, setId] = useState<string | null>(read);
  useEffect(() => {
    const on = () => setId(read());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  const set = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* sem storage */ } setId(v); window.dispatchEvent(new Event(EVT)); };
  return [id, set];
}
