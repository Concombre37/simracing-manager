import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CircleHelp, Package, RefreshCw, Search, X } from 'lucide-react';
import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { stationsApi } from '../services/stations';
import { useContentLabelMap } from '../services/contentLabels';
import { collectModInventory, type ModInventoryItem, type ModType } from '../services/mods';

function typeLabel(type: ModType): string {
  return type === 'car' ? 'Voiture' : 'Circuit';
}

export function Mods() {
  const queryClient = useQueryClient();
  const labels = useContentLabelMap();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | ModType>('');
  const [stationFilter, setStationFilter] = useState('');

  const { data: stations = [], isLoading } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
  });
  const syncMutation = useMutation({
    mutationFn: (stationId: string) => stationsApi.syncContent(stationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
  });

  const simulatorStations = useMemo(
    () => stations.filter((station) => station.role === 'simulator'),
    [stations],
  );
  const inventory = useMemo(() => collectModInventory(stations, labels), [stations, labels]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return inventory.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false;
      if (
        stationFilter &&
        !item.stations.some((station) => station.stationId === stationFilter && station.present)
      ) {
        return false;
      }
      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) ||
        item.acId.toLowerCase().includes(term) ||
        item.layouts.some((layout) => layout.toLowerCase().includes(term))
      );
    });
  }, [inventory, search, stationFilter, typeFilter]);

  const stats = useMemo(() => {
    const missing = inventory.reduce(
      (count, item) => count + item.stations.filter((station) => !station.present).length,
      0,
    );
    return {
      total: inventory.length,
      cars: inventory.filter((item) => item.type === 'car').length,
      tracks: inventory.filter((item) => item.type === 'track').length,
      missing,
    };
  }, [inventory]);

  return (
    <PageShell
      title="Mods"
      accent="de la flotte"
      subtitle="Compare les voitures et circuits installés sur chaque poste. Les informations restent dans le back-office et ne sont jamais envoyées au menu client."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="gray">{stats.total} mods</Badge>
          <Badge variant="blue">{stats.cars} voitures</Badge>
          <Badge variant="green">{stats.tracks} circuits</Badge>
          <Badge variant={stats.missing > 0 ? 'yellow' : 'gray'}>{stats.missing} manquants</Badge>
        </div>
      }
    >
      <Card padding="sm" className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Rechercher un mod
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nom, acId ou layout..."
                className="pl-9"
              />
            </div>
          </div>
          <label className="xl:w-44">
            <span className="mb-1 block text-xs font-medium text-gray-400">Type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as '' | ModType)}
              className="w-full rounded-lg border border-dark-600 bg-dark-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent-orange"
            >
              <option value="">Tous les types</option>
              <option value="car">Voitures</option>
              <option value="track">Circuits</option>
            </select>
          </label>
          <label className="xl:w-64">
            <span className="mb-1 block text-xs font-medium text-gray-400">
              Présent sur le poste
            </span>
            <select
              value={stationFilter}
              onChange={(event) => setStationFilter(event.target.value)}
              className="w-full rounded-lg border border-dark-600 bg-dark-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent-orange"
            >
              <option value="">Tous les postes</option>
              {simulatorStations.map((station) => (
                <option key={station.stationId} value={station.stationId}>
                  {station.name} ({station.stationId})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-accent-orange/20 bg-accent-orange/5 p-4 text-sm text-gray-300 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-accent-orange" />
            <p>
              Un scan est l’inventaire local remonté par l’agent. Pour amorcer une synchronisation,
              demande au poste cible de récupérer les packages déjà disponibles dans le catalogue
              serveur.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {simulatorStations.map((station) => (
              <Button
                key={station.id}
                size="sm"
                variant="secondary"
                isLoading={syncMutation.isPending && syncMutation.variables === station.id}
                onClick={() => syncMutation.mutate(station.id)}
                title="Demander la synchronisation du catalogue serveur"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {station.name}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-orange/30 border-t-accent-orange" />
        </div>
      ) : simulatorStations.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-gray-600" />
          <p className="text-gray-400">Aucun poste simulateur n’a encore envoyé son inventaire.</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-gray-600" />
          <p className="text-gray-400">Aucun mod ne correspond à ces filtres.</p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-dark-700 bg-dark-900/70 text-[11px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3">Mod</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Présence par poste</th>
                  <th className="px-5 py-3 text-right">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/80">
                {filtered.map((item) => (
                  <ModRow key={`${item.type}:${item.acId}`} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageShell>
  );
}

function ModRow({ item }: { item: ModInventoryItem }) {
  const present = item.stations.filter((station) => station.present).length;
  const missing = item.stations.length - present;
  return (
    <tr className="align-top transition-colors hover:bg-dark-800/60">
      <td className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-dark-600 bg-dark-900 p-2 text-accent-orange">
            <Package className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-white">{item.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-gray-500">{item.acId}</p>
            {item.layouts.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                {item.layouts.length} layout{item.layouts.length > 1 ? 's' : ''} :{' '}
                {item.layouts.join(', ')}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-4">
        <Badge variant={item.type === 'car' ? 'blue' : 'green'}>{typeLabel(item.type)}</Badge>
      </td>
      <td className="px-3 py-4">
        <div className="flex max-w-[520px] flex-wrap gap-2">
          {item.stations.map((station) => (
            <span
              key={station.stationId}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                station.present
                  ? 'border-green-700/50 bg-green-950/30 text-green-300'
                  : 'border-red-700/50 bg-red-950/20 text-red-300'
              }`}
              title={
                station.present
                  ? `${station.name} possède ce mod`
                  : `${station.name} n’a pas ce mod`
              }
            >
              {station.present ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {station.name}
            </span>
          ))}
        </div>
      </td>
      <td className="px-5 py-4 text-right">
        <span className={`font-semibold ${missing > 0 ? 'text-yellow-300' : 'text-green-300'}`}>
          {present}/{item.stations.length}
        </span>
        <p className="mt-1 text-[11px] text-gray-500">
          {missing > 0 ? `${missing} manquant${missing > 1 ? 's' : ''}` : 'Complet'}
        </p>
      </td>
    </tr>
  );
}
