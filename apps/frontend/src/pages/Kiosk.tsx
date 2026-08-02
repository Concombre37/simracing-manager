import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import type { TelemetrySnapshot } from '@simracing/shared';
import { stationsApi, type Station } from '../services/stations';
import {
  dedicatedServersApi,
  type DedicatedServer,
  type Car as AcCar,
} from '../services/dedicatedServers';
import { sessionsApi, type ActiveSession } from '../services/sessions';
import { useSocket } from '../hooks/useSocket';
import { findTrackName, formatCarName } from '../utils/track';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Label } from '../components/ui/Input';
import { SessionCard, type StationContent } from './Sessions';
import { ClientNameInput } from '../components/ClientNameInput';
import {
  Monitor,
  Server,
  Send,
  Check,
  Car as CarIcon,
  Feather,
  Target,
  Flame,
  Settings2,
  Clock,
  Infinity as InfinityIcon,
  Plus,
  ArrowRight,
  MapPin,
  Users,
  Square,
  Clock4,
  Activity,
} from 'lucide-react';

type Tab = 'servers' | 'stations';
type Difficulty = 'EASY' | 'PRO' | 'CUSTOM';
type Gearbox = 'MANUAL' | 'AUTO';

interface PodConfig {
  clientName: string;
  difficulty: Difficulty;
  gearbox: Gearbox;
  carAcId: string;
}

const DIFFICULTIES: {
  value: Difficulty;
  label: string;
  description: string;
  icon: typeof Feather;
}[] = [
  { value: 'EASY', label: 'Easy', description: 'Ligne idéale, aides maximales', icon: Feather },
  { value: 'PRO', label: 'Pro', description: 'TC / ABS actifs', icon: Target },
  { value: 'CUSTOM', label: 'Custom', description: 'Aucune aide, contrôle total', icon: Flame },
];

const GEARBOXES: { value: Gearbox; label: string }[] = [
  { value: 'MANUAL', label: 'Manuelle' },
  { value: 'AUTO', label: 'Automatique' },
];

const DURATION_OPTIONS: { value: number | undefined; label: string }[] = [
  { value: undefined, label: 'Illimité' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
];

/**
 * Touch-friendly "operator" kiosk view — no sidebar (see KioskRoute in
 * App.tsx), meant for a terminal at the venue rather than a passive
 * TV/wall display like SessionsKiosk. Covers the loop that actually
 * repeats all day: glance at POD/server status, send a POD onto a running
 * server. Creating/editing/deleting servers stays on the full admin page
 * (/dedicated-servers) — an infrequent setup action, not worth duplicating
 * the whole wizard here.
 */
export function Kiosk() {
  const queryClient = useQueryClient();
  const socket = useSocket('/');
  const [tab, setTab] = useState<Tab>('servers');
  const [sendTarget, setSendTarget] = useState<{
    server: DedicatedServer;
    preselect?: string;
  } | null>(null);
  const [pickServerFor, setPickServerFor] = useState<string | null>(null);

  const { data: stations } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
    refetchInterval: 5000,
  });
  const { data: servers } = useQuery({
    queryKey: ['dedicated-servers'],
    queryFn: dedicatedServersApi.getAll,
    refetchInterval: 5000,
  });
  const { data: sessions } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: sessionsApi.getActive,
    refetchInterval: 10000,
  });
  const [liveData, setLiveData] = useState<Record<string, TelemetrySnapshot>>({});
  const [now, setNow] = useState(Date.now());

  const stopMutation = useMutation({
    mutationFn: dedicatedServersApi.stop,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['dedicated-servers'] }),
  });

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['stations'] });
      void queryClient.invalidateQueries({ queryKey: ['dedicated-servers'] });
      void queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
    };
    socket.on('station:updated', invalidate);
    socket.on('session:updated', invalidate);
    return () => {
      socket.off('station:updated', invalidate);
      socket.off('session:updated', invalidate);
    };
  }, [socket, queryClient]);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: TelemetrySnapshot) => {
      setLiveData((prev) => ({ ...prev, [payload.stationId]: payload }));
    };
    socket.on('station:telemetry', handler);
    return () => {
      socket.off('station:telemetry', handler);
    };
  }, [socket]);

  const contentByStationId = useMemo(() => {
    const map = new Map<string, StationContent | null | undefined>();
    stations?.forEach((s) => map.set(s.stationId, s.content as StationContent | null));
    return map;
  }, [stations]);

  const runningServers = useMemo(
    () => (servers ?? []).filter((s) => s.status === 'running'),
    [servers],
  );

  function handleSendFromStation(stationId: string) {
    if (runningServers.length === 0) return;
    if (runningServers.length === 1) {
      setSendTarget({ server: runningServers[0], preselect: stationId });
    } else {
      setPickServerFor(stationId);
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-dark-950 p-4 md:p-6">
      <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black uppercase tracking-wide text-white">
          SimRacing Manager <span className="text-accent-orange">Kiosque</span>
        </h1>
        <div className="flex items-center gap-3">
          <Link
            to="/en-cours/kiosk"
            className="rounded-full border border-dark-600 bg-dark-800/70 px-4 py-1.5 text-sm font-semibold text-gray-400 transition-colors hover:border-accent-orange/50 hover:text-white"
          >
            Voir les sessions
          </Link>
          <div className="flex items-center gap-1 rounded-full border border-dark-600 bg-dark-800/70 p-1">
            <TabButton
              active={tab === 'servers'}
              onClick={() => setTab('servers')}
              icon={Server}
              label="Serveurs"
            />
            <TabButton
              active={tab === 'stations'}
              onClick={() => setTab('stations')}
              icon={Monitor}
              label="Postes"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pr-1">
        {tab === 'servers' ? (
          <ServersTab
            servers={servers ?? []}
            onSend={(server) => setSendTarget({ server })}
            onStop={(id) => stopMutation.mutate(id)}
            stoppingId={stopMutation.isPending ? stopMutation.variables : undefined}
          />
        ) : (
          <StationsTab
            stations={stations ?? []}
            sessions={sessions ?? []}
            content={contentByStationId}
            liveData={liveData}
            now={now}
            canSend={runningServers.length > 0}
            onSend={handleSendFromStation}
            onCommand={(stationId, command) =>
              socket?.emit('station:command', { stationId, command })
            }
          />
        )}
      </div>

      {pickServerFor && (
        <Modal title="Choisir un serveur" onClose={() => setPickServerFor(null)} size="sm">
          <div className="space-y-2">
            {runningServers.map((server) => (
              <button
                key={server.id}
                type="button"
                onClick={() => {
                  setSendTarget({ server, preselect: pickServerFor });
                  setPickServerFor(null);
                }}
                className="flex w-full items-center justify-between rounded-lg border border-dark-600 bg-dark-900 p-3 text-left transition-colors hover:border-accent-orange/50"
              >
                <span className="font-semibold text-white">{server.name}</span>
                <ArrowRight className="h-4 w-4 text-gray-500" />
              </button>
            ))}
          </div>
        </Modal>
      )}

      {sendTarget && (
        <SendPodsModal
          server={sendTarget.server}
          stations={stations ?? []}
          preselectStationId={sendTarget.preselect}
          onClose={() => setSendTarget(null)}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Server;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold transition-all ${
        active
          ? 'bg-accent-orange text-dark-900 shadow-lg shadow-accent-orange/30'
          : 'text-gray-400 hover:text-white'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function ServerStatusBadge({ status }: { status: DedicatedServer['status'] }) {
  switch (status) {
    case 'running':
      return <Badge variant="green">En cours</Badge>;
    case 'starting':
      return <Badge variant="yellow">Démarrage</Badge>;
    case 'error':
      return <Badge variant="red">Erreur</Badge>;
    default:
      return <Badge variant="gray">Arrêté</Badge>;
  }
}

function ServersTab({
  servers,
  onSend,
  onStop,
  stoppingId,
}: {
  servers: DedicatedServer[];
  onSend: (server: DedicatedServer) => void;
  onStop: (id: string) => void;
  stoppingId?: string;
}) {
  const runningCount = servers.filter((s) => s.status === 'running').length;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {servers.length} serveur{servers.length > 1 ? 's' : ''}
        </p>
        <Link to="/kiosk/dedicated-servers/create">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            Nouveau serveur
          </Button>
        </Link>
      </div>

      {servers.length > 0 && runningCount === 0 && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-yellow-700/50 bg-yellow-900/20 px-4 py-3">
          <p className="text-sm text-yellow-300">
            Aucun serveur actif — les serveurs existants sont arrêtés. Crée-en un nouveau pour
            envoyer des PODs.
          </p>
          <Link to="/kiosk/dedicated-servers/create" className="shrink-0">
            <Button variant="secondary" size="sm">
              <Plus className="h-4 w-4" />
              Créer
            </Button>
          </Link>
        </div>
      )}

      {servers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-600 bg-dark-900/50 py-16 text-center">
          <Server className="mx-auto mb-3 h-10 w-10 text-gray-600" />
          <p className="mb-4 text-gray-400">Aucun serveur disponible pour le moment.</p>
          <Link to="/kiosk/dedicated-servers/create">
            <Button variant="primary">
              <Plus className="h-4 w-4" />
              Créer un serveur
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {servers.map((server) => {
              const trackName = findTrackName(
                server.track,
                server.station.content as { tracks?: { acId: string; name: string }[] } | undefined,
              );
              return (
                <motion.div
                  key={server.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-xl border border-dark-600 bg-dark-800/70 p-4"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="truncate text-lg font-bold text-white">{server.name}</h3>
                    <ServerStatusBadge status={server.status} />
                  </div>
                  <div className="mb-4 space-y-1 text-xs text-gray-400">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-gray-500" />
                      {trackName}
                      {server.trackLayout ? ` (${server.trackLayout})` : ''}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5 text-gray-500" />
                      {server.station.name}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-gray-500" />
                      {server.cars.length} voiture{server.cars.length > 1 ? 's' : ''} ·{' '}
                      {server.maxClients} slots
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="success"
                      size="sm"
                      className="flex-1"
                      disabled={server.status !== 'running'}
                      onClick={() => onSend(server)}
                    >
                      <Send className="h-4 w-4" />
                      Envoyer un POD
                    </Button>
                    {server.status === 'running' && (
                      <Button
                        variant="danger"
                        size="sm"
                        isLoading={stoppingId === server.id}
                        onClick={() => onStop(server.id)}
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function StationStatusBadge({ status }: { status: Station['status'] }) {
  switch (status) {
    case 'in_game':
      return <Badge variant="blue">En jeu</Badge>;
    case 'online':
      return <Badge variant="green">En ligne</Badge>;
    case 'updating':
      return <Badge variant="yellow">Mise à jour</Badge>;
    default:
      return <Badge variant="gray">Hors ligne</Badge>;
  }
}

function StationsTab({
  stations,
  sessions,
  content,
  liveData,
  now,
  canSend,
  onSend,
  onCommand,
}: {
  stations: Station[];
  sessions: ActiveSession[];
  content: Map<string, StationContent | null | undefined>;
  liveData: Record<string, TelemetrySnapshot>;
  now: number;
  canSend: boolean;
  onSend: (stationId: string) => void;
  onCommand: (stationId: string, command: string) => void;
}) {
  const sessionByStationId = useMemo(() => {
    const map = new Map<string, ActiveSession>();
    sessions.forEach((s) => map.set(s.station.stationId, s));
    return map;
  }, [sessions]);

  const { inSession, others } = useMemo(() => {
    const inSession: Station[] = [];
    const others: Station[] = [];
    [...stations]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((s) => {
        if (sessionByStationId.has(s.stationId)) inSession.push(s);
        else others.push(s);
      });
    return { inSession, others };
  }, [stations, sessionByStationId]);

  if (stations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-dark-600 bg-dark-900/50 py-16 text-center">
        <Monitor className="mx-auto mb-3 h-10 w-10 text-gray-600" />
        <p className="text-gray-400">Aucun poste enregistré.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {inSession.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400">
            <Activity className="h-4 w-4 text-accent-orange" />
            En session ({inSession.length})
          </h2>
          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            {inSession.map((station) => {
              const session = sessionByStationId.get(station.stationId);
              if (!session) return null;
              return (
                <SessionCard
                  key={station.id}
                  session={session}
                  telemetry={liveData[station.stationId]}
                  now={now}
                  content={content.get(station.stationId)}
                  onCommand={(command) => onCommand(station.stationId, command)}
                />
              );
            })}
          </div>
        </section>
      )}

      <section>
        {inSession.length > 0 && (
          <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400">
            <Monitor className="h-4 w-4 text-gray-500" />
            Autres postes ({others.length})
          </h2>
        )}
        {others.length === 0 ? (
          inSession.length === 0 && (
            <div className="rounded-xl border border-dashed border-dark-600 bg-dark-900/50 py-16 text-center">
              <Monitor className="mx-auto mb-3 h-10 w-10 text-gray-600" />
              <p className="text-gray-400">Aucun poste enregistré.</p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {others.map((station) => {
              const sendable =
                canSend &&
                station.role === 'simulator' &&
                (station.status === 'online' || station.status === 'in_game');
              return (
                <div
                  key={station.id}
                  className="flex flex-col justify-between rounded-xl border border-dark-600 bg-dark-800/70 p-4"
                >
                  <div className="mb-3 min-w-0">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Monitor className="h-5 w-5 shrink-0 text-gray-500" />
                      <StationStatusBadge status={station.status} />
                    </div>
                    <p className="truncate font-bold text-white">{station.name}</p>
                    <p className="truncate font-mono text-[10px] text-gray-500">
                      {station.stationId}
                    </p>
                    <div className="mt-2">
                      <Badge variant={station.role === 'admin' ? 'purple' : 'gray'}>
                        {station.role === 'admin' ? 'Admin' : 'Simulateur'}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="success"
                    size="sm"
                    disabled={!sendable}
                    onClick={() => onSend(station.stationId)}
                    title={!canSend ? 'Aucun serveur actif' : undefined}
                  >
                    <Send className="h-4 w-4" />
                    Envoyer
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SendPodsModal({
  server,
  stations,
  preselectStationId,
  onClose,
}: {
  server: DedicatedServer;
  stations: Station[];
  preselectStationId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const availableCars = useMemo(() => Array.from(new Set(server.cars ?? [])), [server]);
  const carMap = useMemo(() => {
    const cars = (server.station.content as { cars?: AcCar[] } | undefined)?.cars ?? [];
    return new Map(cars.map((c) => [c.acId, c]));
  }, [server]);

  const onlineStations = useMemo(
    () =>
      stations.filter(
        (s) =>
          s.id !== server.stationId &&
          s.role === 'simulator' &&
          (s.status === 'online' || s.status === 'in_game'),
      ),
    [stations, server],
  );

  const [durationMinutes, setDurationMinutes] = useState<number | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    preselectStationId ? [preselectStationId] : [],
  );
  const [configs, setConfigs] = useState<Record<string, PodConfig>>(() =>
    preselectStationId
      ? {
          [preselectStationId]: {
            clientName: '',
            difficulty: 'PRO',
            gearbox: 'MANUAL',
            carAcId: availableCars[0] ?? '',
          },
        }
      : {},
  );
  const [error, setError] = useState<string | null>(null);

  function toggleStation(stationId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(stationId)) return prev.filter((x) => x !== stationId);
      setConfigs((c) => ({
        ...c,
        [stationId]: c[stationId] ?? {
          clientName: '',
          difficulty: 'PRO',
          gearbox: 'MANUAL',
          carAcId: availableCars[0] ?? '',
        },
      }));
      return [...prev, stationId];
    });
  }

  function updateConfig(stationId: string, patch: Partial<PodConfig>) {
    setConfigs((prev) => ({ ...prev, [stationId]: { ...prev[stationId], ...patch } }));
  }

  const joinMutation = useMutation({
    mutationFn: async () => {
      const pods = selectedIds.map((stationId) => {
        const cfg = configs[stationId];
        return {
          stationId,
          carAcId: cfg.carAcId,
          clientName: cfg.clientName || undefined,
          difficulty: cfg.difficulty,
          gearbox: cfg.gearbox,
        };
      });
      await dedicatedServersApi.join(server.id, pods, durationMinutes);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stations'] });
      void queryClient.invalidateQueries({ queryKey: ['dedicated-servers'] });
      void queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
      onClose();
    },
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : "Échec de l'envoi des POD"),
  });

  return (
    <Modal title={`Envoyer sur ${server.name}`} onClose={onClose} size="xl">
      <div className="space-y-6">
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400">
            <Clock className="h-4 w-4 text-accent-orange" />
            Durée de session
          </h3>
          <div className="flex flex-wrap gap-2">
            {DURATION_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setDurationMinutes(option.value)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-all ${
                  durationMinutes === option.value
                    ? 'bg-accent-orange text-dark-900'
                    : 'bg-dark-700 text-gray-300 hover:bg-dark-600'
                }`}
              >
                {option.value === undefined && <InfinityIcon className="h-4 w-4" />}
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400">
            <Monitor className="h-4 w-4 text-accent-orange" />
            Postes
          </h3>
          {onlineStations.length === 0 ? (
            <p className="rounded-lg border border-dashed border-dark-600 bg-dark-900/50 py-6 text-center text-sm text-gray-500">
              Aucun POD en ligne
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {onlineStations.map((station) => {
                const selected = selectedIds.includes(station.stationId);
                return (
                  <button
                    key={station.stationId}
                    type="button"
                    onClick={() => toggleStation(station.stationId)}
                    className={`relative rounded-lg border p-3 text-left transition-all ${
                      selected
                        ? 'border-accent-orange bg-dark-900 ring-1 ring-accent-orange'
                        : 'border-dark-600 bg-dark-800 hover:border-accent-orange/50'
                    }`}
                  >
                    {selected && (
                      <div className="absolute right-1.5 top-1.5 rounded-full bg-accent-orange p-0.5 text-dark-900">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                    <p className="truncate text-sm font-bold text-white">{station.name}</p>
                    <div className="mt-1">
                      <Badge variant={station.status === 'in_game' ? 'blue' : 'green'}>
                        {station.status === 'in_game' ? 'En jeu' : 'En ligne'}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <AnimatePresence initial={false}>
          {selectedIds.map((stationId) => {
            const station = onlineStations.find((s) => s.stationId === stationId);
            const cfg = configs[stationId];
            if (!station || !cfg) return null;
            return (
              <motion.div
                key={stationId}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <PodConfigCard
                  station={station}
                  config={cfg}
                  cars={availableCars}
                  carMap={carMap}
                  onChange={(patch) => updateConfig(stationId, patch)}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>

        {error && (
          <p className="rounded-lg border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-dark-700 pt-4">
          <p className="text-sm text-gray-400">
            <span className="text-lg font-black text-white">{selectedIds.length}</span> pilote
            {selectedIds.length > 1 ? 's' : ''} prêt{selectedIds.length > 1 ? 's' : ''}
          </p>
          <Button
            variant="success"
            size="lg"
            onClick={() => joinMutation.mutate()}
            disabled={selectedIds.length === 0 || joinMutation.isPending}
            isLoading={joinMutation.isPending}
          >
            <Send className="h-4 w-4" />
            Envoyer {selectedIds.length > 0 && `(${selectedIds.length})`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PodConfigCard({
  station,
  config,
  cars,
  carMap,
  onChange,
}: {
  station: Station;
  config: PodConfig;
  cars: string[];
  carMap: Map<string, AcCar>;
  onChange: (patch: Partial<PodConfig>) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-dark-600 bg-dark-900/60">
      <div className="flex items-center justify-between border-b border-dark-700 bg-gradient-to-r from-accent-orange/10 to-transparent px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-accent-orange" />
          <span className="font-bold text-white">{station.name}</span>
        </div>
        <Clock4 className="h-4 w-4 text-gray-500" />
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[240px,1fr]">
        <div className="space-y-4">
          <div>
            <Label>Pilote</Label>
            <ClientNameInput
              value={config.clientName}
              onChange={(clientName) => onChange({ clientName })}
            />
          </div>

          <div>
            <Label>Difficulté</Label>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => {
                const Icon = d.icon;
                const active = config.difficulty === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => onChange({ difficulty: d.value })}
                    title={d.description}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all ${
                      active
                        ? 'border-accent-orange bg-accent-orange/10 text-white'
                        : 'border-dark-600 bg-dark-800 text-gray-400 hover:border-dark-500'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>
              <Settings2 className="mr-1 inline h-3.5 w-3.5" />
              Boîte
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {GEARBOXES.map((g) => {
                const active = config.gearbox === g.value;
                return (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => onChange({ gearbox: g.value })}
                    className={`rounded-lg border py-1.5 text-xs font-bold transition-all ${
                      active
                        ? 'border-accent-orange bg-accent-orange/10 text-white'
                        : 'border-dark-600 bg-dark-800 text-gray-400 hover:border-dark-500'
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <Label>Voiture</Label>
          {cars.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune voiture disponible sur ce serveur.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {cars.map((acId) => {
                const car = carMap.get(acId);
                const selected = config.carAcId === acId;
                return (
                  <button
                    key={acId}
                    type="button"
                    onClick={() => onChange({ carAcId: acId })}
                    className={`group relative overflow-hidden rounded-lg border text-left transition-all ${
                      selected
                        ? 'border-accent-orange ring-1 ring-accent-orange'
                        : 'border-dark-600 bg-dark-800 hover:border-accent-orange/50'
                    }`}
                  >
                    <div className="flex aspect-video items-center justify-center bg-dark-950">
                      {car?.preview ? (
                        <img
                          src={car.preview}
                          alt={formatCarName(car.name, acId)}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <CarIcon className="h-6 w-6 text-gray-600" />
                      )}
                      {selected && (
                        <div className="absolute right-1 top-1 rounded-full bg-accent-orange p-0.5 text-dark-900">
                          <Check className="h-2.5 w-2.5" />
                        </div>
                      )}
                    </div>
                    <p className="truncate p-1.5 text-[10px] font-semibold text-white">
                      {formatCarName(car?.name, acId)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
