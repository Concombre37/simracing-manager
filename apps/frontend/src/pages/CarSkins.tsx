import { useMemo, useState } from 'react';
import { Car, Search, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { stationsApi } from '../services/stations';
import { formatCarName } from '../utils/track';

type SkinCar = { acId: string; name?: string; preview?: string; skins?: string[] };

export function CarSkins() {
  const [search, setSearch] = useState('');
  const { data: stations = [], isLoading } = useQuery({ queryKey: ['stations'], queryFn: stationsApi.getAll });
  const cars = useMemo(() => {
    const map = new Map<string, { car: SkinCar; stations: string[]; skins: string[] }>();
    for (const station of stations.filter((item) => item.role !== 'spectator')) {
      const content = station.content as { cars?: SkinCar[] } | null;
      for (const car of content?.cars ?? []) {
        const entry = map.get(car.acId) ?? { car, stations: [], skins: [] };
        if (!entry.stations.includes(station.name)) entry.stations.push(station.name);
        entry.skins = [...new Set([...entry.skins, ...(car.skins ?? [])])].sort();
        if (!entry.car.preview && car.preview) entry.car = car;
        map.set(car.acId, entry);
      }
    }
    const term = search.trim().toLowerCase();
    return [...map.values()].filter(({ car }) => !term || `${car.acId} ${car.name ?? ''}`.toLowerCase().includes(term));
  }, [stations, search]);

  return <PageShell title="Skins" accent="voitures" subtitle="Skins installés détectés sur les postes et utilisés pour le tirage aléatoire">
    <Card padding="sm" className="mb-4">
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une voiture…" /></div>
    </Card>
    {isLoading ? <Card className="p-10 text-center text-gray-400">Chargement des skins…</Card> : cars.length === 0 ? <Card className="p-10 text-center text-gray-400">Aucun skin détecté.</Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cars.map(({ car, stations: owners, skins }) => <Card key={car.acId} padding="sm" className="overflow-hidden">
        <div className="flex gap-3"><div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-dark-900">{car.preview ? <img src={car.preview} alt="" className="h-full w-full object-cover" /> : <Car className="m-auto h-8 w-8 text-gray-600" />}</div><div className="min-w-0"><h2 className="truncate font-semibold text-white">{formatCarName(car.name, car.acId)}</h2><p className="truncate text-[11px] text-gray-500">{car.acId}</p><div className="mt-1 flex gap-1"><Badge variant="blue">{skins.length} skin{skins.length > 1 ? 's' : ''}</Badge><Badge variant="gray">{owners.length} poste{owners.length > 1 ? 's' : ''}</Badge></div></div></div>
        <div className="mt-3 flex flex-wrap gap-1.5">{skins.map((skin) => <span key={skin} className="rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-200"><ShieldCheck className="mr-1 inline h-3 w-3" />{skin}</span>)}</div>
        <p className="mt-3 truncate text-[11px] text-gray-500">Disponible sur : {owners.join(', ')}</p>
      </Card>)}
    </div>}
  </PageShell>;
}
