import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageShell } from '../components/ui/PageShell';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { stationsApi, type Station } from '../services/stations';
import { dedicatedServersApi } from '../services/dedicatedServers';
import { sessionsApi } from '../services/sessions';
import { findTrackName } from '../utils/track';
import { Monitor, Server, Play, Zap, ArrowRight, Plus } from 'lucide-react';

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    const start = prevTarget.current;
    const startTime = performance.now();
    let raf = 0;

    function tick(now: number) {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevTarget.current = target;
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

const STATUS_PRIORITY: Record<Station['status'], number> = {
  in_game: 0,
  online: 1,
  updating: 2,
  offline: 3,
};

export function Dashboard() {
  const { data: stations } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
    refetchInterval: 5000,
  });
  const { data: servers } = useQuery({
    queryKey: ['dedicated-servers'],
    queryFn: dedicatedServersApi.getAll,
  });
  const { data: sessions } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: sessionsApi.getActive,
    refetchInterval: 10000,
  });

  const onlineCount =
    stations?.filter((s) => s.status === 'online' || s.status === 'in_game').length ?? 0;
  const inGameCount = stations?.filter((s) => s.status === 'in_game').length ?? 0;
  const totalStations = stations?.length ?? 0;
  const runningServers = servers?.filter((s) => s.status === 'running') ?? [];
  const activeSessions = sessions?.length ?? 0;

  const displayedOnline = useCountUp(onlineCount);
  const displayedInGame = useCountUp(inGameCount);
  const displayedRunning = useCountUp(runningServers.length);
  const displayedSessions = useCountUp(activeSessions);

  const sortedStations = [...(stations ?? [])].sort(
    (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status],
  );
  const fleetPct = totalStations > 0 ? Math.round((onlineCount / totalStations) * 100) : 0;

  return (
    <PageShell
      title="Dashboard"
      accent="technique"
      subtitle="Vue d'ensemble temps réel de l'infrastructure SimRacing"
      actions={
        <Link to="/dedicated-servers/create">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            Nouveau serveur
          </Button>
        </Link>
      }
    >
      {/* Zone 1 — indicateurs clés */}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi
          icon={Monitor}
          label="Postes en ligne"
          value={displayedOnline}
          suffix={`/${totalStations}`}
          color="#00d4ff"
        />
        <Kpi icon={Zap} label="Postes en jeu" value={displayedInGame} color="#a855f7" />
        <Kpi
          icon={Server}
          label="Serveurs en course"
          value={displayedRunning}
          suffix={`/${servers?.length ?? 0}`}
          color="#ff6b35"
        />
        <Kpi icon={Play} label="Sessions actives" value={displayedSessions} color="#22c55e" />
      </section>

      {/* Zone 2 — parc de simulateurs + activité */}
      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Parc de simulateurs"
            subtitle="Status temps réel des POD"
            action={
              <Link
                to="/stations"
                className="flex items-center gap-1 text-sm font-medium text-accent-orange hover:text-orange-400"
              >
                Gérer <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />

          <div className="mb-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-dark-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-blue to-accent-green transition-all duration-700"
                style={{ width: `${fleetPct}%` }}
              />
            </div>
            <span className="font-mono text-xs tabular-nums text-gray-400">
              {fleetPct}% en ligne
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sortedStations.map((station) => (
              <PodTile key={station.id} station={station} />
            ))}
            {totalStations === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-gray-500">
                Aucune station configurée
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Serveurs en course"
              action={
                <Link
                  to="/dedicated-servers"
                  className="flex items-center gap-1 text-sm font-medium text-accent-orange hover:text-orange-400"
                >
                  <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />
            <div className="space-y-2">
              {runningServers.map((server) => (
                <div
                  key={server.id}
                  className="flex items-center gap-3 rounded-lg border border-dark-600 bg-dark-900/60 p-3"
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ring-pulse rounded-full bg-green-400" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{server.name}</p>
                    <p className="truncate text-xs text-gray-500">
                      {findTrackName(
                        server.track,
                        server.station.content as
                          | { tracks?: { acId: string; name: string }[] }
                          | undefined,
                      )}{' '}
                      · {server.maxClients} slots
                    </p>
                  </div>
                </div>
              ))}
              {runningServers.length === 0 && (
                <p className="py-4 text-center text-sm text-gray-500">Aucun serveur en course</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Sessions actives"
              action={
                <Link
                  to="/en-cours"
                  className="flex items-center gap-1 text-sm font-medium text-accent-orange hover:text-orange-400"
                >
                  <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />
            <div className="space-y-2">
              {sessions?.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-dark-600 bg-dark-900/60 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {session.station.name}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {session.clientName ?? 'Client anonyme'}
                    </p>
                  </div>
                  <Badge variant="green">Live</Badge>
                </div>
              ))}
              {activeSessions === 0 && (
                <p className="py-4 text-center text-sm text-gray-500">Aucune session active</p>
              )}
            </div>
          </Card>
        </div>
      </section>
    </PageShell>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  suffix = '',
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  suffix?: string;
  color: string;
}) {
  return (
    <Card padding="sm" className="flex items-center gap-3">
      <div
        className="shrink-0 rounded-lg p-2.5"
        style={{ backgroundColor: `${color}1a`, boxShadow: `0 0 18px -6px ${color}66` }}
      >
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </p>
        <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-white">
          {value}
          {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
        </p>
      </div>
    </Card>
  );
}

function PodTile({ station }: { station: Station }) {
  const live = station.status === 'online' || station.status === 'in_game';
  const dot =
    station.status === 'online'
      ? 'bg-green-400'
      : station.status === 'in_game'
        ? 'bg-blue-400'
        : station.status === 'updating'
          ? 'bg-purple-400'
          : 'bg-gray-600';

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dark-600 bg-dark-900/60 p-3 transition-colors hover:border-dark-500">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{station.name}</p>
        <p className="truncate font-mono text-xs text-gray-500">{station.stationId}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="relative flex h-2 w-2">
          {live && (
            <span
              className={`absolute inline-flex h-full w-full animate-ring-pulse rounded-full ${dot}`}
            />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
        </span>
        <StatusBadge status={station.status} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'online':
      return <Badge variant="green">En ligne</Badge>;
    case 'in_game':
      return <Badge variant="blue">En jeu</Badge>;
    case 'updating':
      return <Badge variant="purple">MAJ</Badge>;
    case 'offline':
    default:
      return <Badge variant="gray">Hors ligne</Badge>;
  }
}
