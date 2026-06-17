import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, Trash2, RefreshCw, Search, Monitor } from 'lucide-react';
import { contentPreviewsApi } from '../services/contentPreviews';
import { stationsApi } from '../services/stations';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';

export function ContentPreviews() {
  const queryClient = useQueryClient();
  const [stationFilter, setStationFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const { data: previews = [], isLoading: previewsLoading } = useQuery({
    queryKey: ['contentPreviews', stationFilter, typeFilter],
    queryFn: () =>
      contentPreviewsApi.findAll({
        ...(stationFilter && { stationId: stationFilter }),
        ...(typeFilter && { type: typeFilter }),
      }),
  });

  const { data: stations = [] } = useQuery({
    queryKey: ['stations'],
    queryFn: () => stationsApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contentPreviewsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contentPreviews'] }),
  });

  const syncMutation = useMutation({
    mutationFn: (stationId: string) => stationsApi.syncContent(stationId),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return previews;
    return previews.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.acId.toLowerCase().includes(term) ||
        p.station.name.toLowerCase().includes(term),
    );
  }, [previews, search]);

  const stats = useMemo(() => {
    const cars = previews.filter((p) => p.type === 'car').length;
    const tracks = previews.filter((p) => p.type === 'track').length;
    return { total: previews.length, cars, tracks };
  }, [previews]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-accent-orange" />
            Images reçues
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Visualise et gère les previews de circuits et voitures envoyées par les agents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="gray">Total {stats.total}</Badge>
          <Badge variant="blue">Voitures {stats.cars}</Badge>
          <Badge variant="green">Circuits {stats.tracks}</Badge>
        </div>
      </div>

      <div className="bg-dark-800 border border-dark-600 rounded-lg p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-400 mb-1">Recherche</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom, acId ou station..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="lg:w-56">
            <label className="block text-xs font-medium text-gray-400 mb-1">Station</label>
            <select
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              className="w-full rounded-lg border border-dark-600 bg-dark-900 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-orange"
            >
              <option value="">Toutes les stations</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.stationId})
                </option>
              ))}
            </select>
          </div>
          <div className="lg:w-40">
            <label className="block text-xs font-medium text-gray-400 mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-dark-600 bg-dark-900 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-orange"
            >
              <option value="">Tous</option>
              <option value="car">Voitures</option>
              <option value="track">Circuits</option>
            </select>
          </div>
        </div>

        <div className="border-t border-dark-600 pt-4">
          <p className="text-xs font-medium text-gray-400 mb-2">Forcer l’envoi du contenu</p>
          <div className="flex flex-wrap gap-2">
            {stations.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant="secondary"
                isLoading={syncMutation.variables === s.id && syncMutation.isPending}
                onClick={() => syncMutation.mutate(s.id)}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <Monitor className="w-3.5 h-3.5" />
                {s.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {previewsLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent-orange/30 border-t-accent-orange rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-dark-800 border border-dark-600 rounded-lg p-12 text-center">
          <ImageIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Aucune image reçue pour le moment.</p>
          <p className="text-sm text-gray-500 mt-2">
            Vérifie que l’agent est en v2.0.11+ et clique sur “Forcer l’envoi du contenu”.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((preview) => (
            <div
              key={preview.id}
              className="bg-dark-800 border border-dark-600 rounded-lg overflow-hidden group hover:border-accent-orange/50 transition-colors"
            >
              <div className="aspect-video bg-dark-900 flex items-center justify-center relative">
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <button
                  onClick={() => deleteMutation.mutate(preview.id)}
                  disabled={deleteMutation.variables === preview.id && deleteMutation.isPending}
                  className="absolute top-2 right-2 p-1.5 bg-accent-red/90 hover:bg-accent-red text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={preview.type === 'car' ? 'blue' : 'green'}>
                    {preview.type === 'car' ? 'Voiture' : 'Circuit'}
                  </Badge>
                  <span className="text-[10px] text-gray-500 truncate">{preview.station.name}</span>
                </div>
                <p className="text-xs font-medium text-white truncate" title={preview.name}>
                  {preview.name}
                </p>
                <p className="text-[10px] text-gray-500 truncate" title={preview.acId}>
                  {preview.acId}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
