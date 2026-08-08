import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatCarName, formatTrackName } from '@simracing/shared';
import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { useContentLabelMap } from '../services/contentLabels';
import { sessionsApi } from '../services/sessions';
import { Car, ChevronRight, Clock, Search } from 'lucide-react';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SessionHistory() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['sessions-history'],
    queryFn: () => sessionsApi.getHistory({ limit: 100 }),
  });
  const labelMap = useContentLabelMap();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((s) => {
      const trackName = s.track ? formatTrackName(undefined, s.track, labelMap) : '';
      const carName = s.carAcId ? formatCarName(undefined, s.carAcId, labelMap) : '';
      return [s.clientName, trackName, carName, s.station.name]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [data, search, labelMap]);

  return (
    <PageShell
      title="Historique des sessions"
      subtitle="Toutes les sessions terminées, avec accès au détail complet (tours, secteurs, coupures, classement)"
      actions={
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pilote, circuit, voiture, poste..."
            className="w-64 rounded-lg border border-dark-600 bg-dark-800 py-2 pl-9 pr-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-racing-cyan/50"
          />
        </div>
      }
    >
      <Card padding="none">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="mb-3 h-10 w-10 text-gray-600" />
            <p className="text-gray-400">
              {data?.length
                ? 'Aucune session ne correspond à la recherche.'
                : 'Aucune session terminée.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-dark-700">
            {filtered.map((s) => {
              const trackName = s.track ? formatTrackName(undefined, s.track, labelMap) : '—';
              const carName = s.carAcId ? formatCarName(undefined, s.carAcId, labelMap) : '—';
              return (
                <Link
                  key={s.id}
                  to={`/sessions/${s.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.03]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dark-700">
                    <Car className="h-4 w-4 text-gray-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">
                      {s.clientName?.trim() || 'Pilote inconnu'}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {carName} · {trackName}
                      {s.trackLayout ? ` (${s.trackLayout})` : ''}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-xs text-gray-400">{s.station.name}</p>
                    <p className="text-[11px] text-gray-600">
                      {formatDateTime(s.endedAt ?? s.createdAt)}
                    </p>
                  </div>
                  <div className="hidden w-16 shrink-0 text-right font-mono text-xs text-gray-500 md:block">
                    {s.durationMinutes ? `${s.durationMinutes} min` : 'Illimité'}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-600" />
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </PageShell>
  );
}
