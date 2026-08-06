import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { findCar, findTrackName, findTrackPreview, formatCarName } from '../utils/track';
import { useContentLabelMap } from '../services/contentLabels';
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
  ArrowLeft,
  ArrowRight,
  MapPin,
  Users,
  Square,
  Clock4,
  Flag,
  X,
  Eraser,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

type Tab = 'servers' | 'stations';
type Difficulty = 'EASY' | 'PRO' | 'CUSTOM';
type Gearbox = 'MANUAL' | 'AUTO';

/** Realistic site max — the POD grid always reserves this many slots so the
 * layout stays fixed and structured instead of reflowing as PODs come and
 * go; unused slots render as empty placeholders (same idea as
 * SessionsKiosk.tsx's 5x2 wall grid). Admin (hosting-only) stations are
 * never PODs an operator sends, so they're excluded entirely here. */
const MAX_PODS = 10;
const STALE_MS = 5000;

function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatHHMM(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

interface PodConfig {
  clientName: string;
  difficulty: Difficulty;
  gearbox: Gearbox;
  carAcId: string;
  durationMinutes: number | undefined;
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

const DEFAULT_POD_CONFIG: PodConfig = {
  clientName: '',
  difficulty: 'PRO',
  gearbox: 'MANUAL',
  carAcId: '',
  durationMinutes: 15,
};

/**
 * Touch-friendly "operator" kiosk view — no sidebar (see KioskRoute in
 * App.tsx), meant for a terminal at the venue rather than a passive
 * TV/wall display like SessionsKiosk. Covers the loop that actually
 * repeats all day: glance at POD/server status, send one or more PODs
 * onto a running server. Creating/editing/deleting servers stays on the
 * full admin page (/dedicated-servers) — an infrequent setup action, not
 * worth duplicating the whole wizard here.
 *
 * Visual language (racing-blue/cyan HUD, corner brackets, condensed
 * uppercase type) matches the agent's in-game blanking screens
 * (blankingManager.ts) — from the same Claude Design mockup
 * ("Kiosque HUD"), so the kiosk and the in-game overlay read as one
 * system.
 */
export function Kiosk() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const socket = useSocket('/');
  const [tab, setTab] = useState<Tab>('stations');
  const [selectedPodIds, setSelectedPodIds] = useState<string[]>([]);
  const [podPickerOpen, setPodPickerOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState<{
    server: DedicatedServer;
    preselectStationIds?: string[];
  } | null>(null);

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

  const occupiedStationIds = useMemo(
    () => new Set((sessions ?? []).map((s) => s.station.stationId)),
    [sessions],
  );

  const freePodCount = useMemo(
    () =>
      (stations ?? []).filter(
        (s) =>
          s.role === 'simulator' &&
          (s.status === 'online' || s.status === 'in_game') &&
          !occupiedStationIds.has(s.stationId),
      ).length,
    [stations, occupiedStationIds],
  );

  function togglePod(stationId: string) {
    setSelectedPodIds((prev) =>
      prev.includes(stationId) ? prev.filter((id) => id !== stationId) : [...prev, stationId],
    );
  }

  function openServerPicker() {
    if (selectedPodIds.length === 0) return;
    setPodPickerOpen(true);
  }

  function pickServer(server: DedicatedServer) {
    setPodPickerOpen(false);
    setSendTarget({ server, preselectStationIds: selectedPodIds });
    setSelectedPodIds([]);
  }

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-dark-950">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(1400px 700px at 50% -18%, rgba(0,87,255,.16), transparent 70%)',
        }}
      />

      <header className="relative z-10 flex flex-wrap items-center gap-4 border-b border-white/10 px-6 py-4 md:px-8">
        <div className="flex flex-none items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-racing-blue to-racing-cyan text-dark-950 shadow-[0_0_24px_rgba(0,120,255,0.45)]">
            <Flag className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="whitespace-nowrap font-hud text-xl font-bold leading-none tracking-wide text-white">
              Mode kiosque
            </h1>
            <p className="mt-1 whitespace-nowrap font-hud-mono text-xs text-sky-200/70">
              Touchez un POD pour l'envoyer en course
            </p>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex flex-none flex-wrap items-center gap-4 md:gap-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse-glow rounded-full bg-accent-green shadow-[0_0_10px_#22c55e]" />
            <span className="whitespace-nowrap font-hud text-sm font-bold text-emerald-300">
              {freePodCount} POD{freePodCount !== 1 ? 's' : ''} libre{freePodCount !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="whitespace-nowrap border-l border-white/10 pl-4 font-hud-mono text-2xl font-bold text-white">
            {formatHHMM(now)}
          </span>
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
          <Link
            to="/en-cours/kiosk"
            className="whitespace-nowrap rounded-lg border border-white/10 px-3 py-2 font-hud text-sm font-bold text-gray-400 transition-colors hover:border-racing-cyan/40 hover:text-sky-200"
          >
            Sessions
          </Link>
          <Link
            to="/"
            className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-white/10 px-3 py-2 font-hud text-sm font-bold text-gray-400 transition-colors hover:border-red-500/40 hover:text-red-300"
          >
            <X className="h-4 w-4" />
            Quitter
          </Link>
        </div>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-6 md:px-8">
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
            selectedPodIds={selectedPodIds}
            onTogglePod={togglePod}
            onCommand={(stationId, command) =>
              socket?.emit('station:command', { stationId, command })
            }
          />
        )}
      </div>

      {tab === 'stations' && (
        <div className="relative z-10 flex flex-none flex-wrap items-center gap-4 border-t border-racing-cyan/20 bg-dark-900/90 px-6 py-4 backdrop-blur md:px-8">
          <div className="flex flex-none items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md border border-racing-cyan/40 bg-racing-cyan/10 font-hud text-lg font-bold text-sky-200">
              {selectedPodIds.length}
            </div>
            <div>
              <p className="font-hud text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                Sélection
              </p>
              <p className="whitespace-nowrap font-hud text-base font-bold text-white">
                {selectedPodIds.length === 0
                  ? 'aucun POD'
                  : selectedPodIds.length === 1
                    ? '1 POD'
                    : `${selectedPodIds.length} PODs`}
              </p>
            </div>
          </div>
          <div
            className="h-px min-w-[20px] flex-1"
            style={{ background: 'linear-gradient(90deg, rgba(0,194,255,.3), transparent)' }}
          />
          <div className="flex flex-none flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setSelectedPodIds([])}
              disabled={selectedPodIds.length === 0}
            >
              <Eraser className="h-4 w-4" />
              Tout désélectionner
            </Button>
            <button
              type="button"
              onClick={openServerPicker}
              disabled={selectedPodIds.length === 0}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-6 py-2.5 font-hud text-base font-bold tracking-wide transition-all ${
                selectedPodIds.length > 0
                  ? 'bg-gradient-to-r from-racing-blue to-racing-cyan text-dark-950 shadow-[0_0_28px_rgba(0,120,255,0.35)] hover:shadow-[0_0_38px_rgba(0,150,255,0.5)]'
                  : 'cursor-not-allowed bg-white/5 text-gray-600'
              }`}
            >
              <Send className="h-4 w-4" />
              Envoyer en course
            </button>
          </div>
        </div>
      )}

      {podPickerOpen && (
        <ServerPickerOverlay
          servers={runningServers}
          selectedCount={selectedPodIds.length}
          onClose={() => setPodPickerOpen(false)}
          onPick={pickServer}
          onCreateServer={() => {
            setPodPickerOpen(false);
            navigate('/kiosk/dedicated-servers/create');
          }}
        />
      )}

      {sendTarget && (
        <SendPodsModal
          server={sendTarget.server}
          stations={stations ?? []}
          preselectStationIds={sendTarget.preselectStationIds}
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
      className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 font-hud text-sm font-bold transition-all ${
        active
          ? 'bg-gradient-to-r from-racing-blue to-racing-cyan text-dark-950 shadow-[0_0_16px_rgba(0,140,255,0.4)]'
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
  const labelMap = useContentLabelMap();
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
                labelMap,
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

function StationsTab({
  stations,
  sessions,
  content,
  liveData,
  now,
  selectedPodIds,
  onTogglePod,
  onCommand,
}: {
  stations: Station[];
  sessions: ActiveSession[];
  content: Map<string, StationContent | null | undefined>;
  liveData: Record<string, TelemetrySnapshot>;
  now: number;
  selectedPodIds: string[];
  onTogglePod: (stationId: string) => void;
  onCommand: (stationId: string, command: string) => void;
}) {
  const sessionByStationId = useMemo(() => {
    const map = new Map<string, ActiveSession>();
    sessions.forEach((s) => map.set(s.station.stationId, s));
    return map;
  }, [sessions]);

  // Admin (hosting-only) stations never send/receive PODs, and there are at
  // most MAX_PODS simulators on site — the grid always reserves that many
  // cells (padded with empty placeholders) so it stays fixed and structured
  // instead of reflowing as PODs connect/disconnect.
  const pods = useMemo(
    () =>
      stations.filter((s) => s.role === 'simulator').sort((a, b) => a.name.localeCompare(b.name)),
    [stations],
  );
  const slots = Array.from({ length: MAX_PODS }, (_, i) => pods[i]);

  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const expandedSession = sessions.find((s) => s.id === expandedSessionId);

  if (pods.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-dark-600 bg-dark-900/50 py-16 text-center">
        <Monitor className="mx-auto mb-3 h-10 w-10 text-gray-600" />
        <p className="text-gray-400">Aucun poste simulateur enregistré.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {slots.map((station, i) => {
          if (!station) {
            return (
              <div
                key={`empty-${i}`}
                className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-dark-900/30"
              >
                <Monitor className="h-6 w-6 text-white/10" />
              </div>
            );
          }
          const session = sessionByStationId.get(station.stationId);
          return session ? (
            <PodSessionCell
              key={station.id}
              station={station}
              session={session}
              telemetry={liveData[station.stationId]}
              now={now}
              content={content.get(station.stationId)}
              onClick={() => setExpandedSessionId(session.id)}
            />
          ) : (
            <PodAvailableCell
              key={station.id}
              station={station}
              selected={selectedPodIds.includes(station.stationId)}
              onToggle={() => onTogglePod(station.stationId)}
            />
          );
        })}
      </div>

      {expandedSession && (
        <Modal
          title={expandedSession.clientName || expandedSession.station.name}
          onClose={() => setExpandedSessionId(null)}
          size="lg"
        >
          <SessionCard
            session={expandedSession}
            telemetry={liveData[expandedSession.station.stationId]}
            now={now}
            content={content.get(expandedSession.station.stationId)}
            onCommand={(command) => onCommand(expandedSession.station.stationId, command)}
          />
        </Modal>
      )}
    </>
  );
}

function PodAvailableCell({
  station,
  selected,
  onToggle,
}: {
  station: Station;
  selected: boolean;
  onToggle: () => void;
}) {
  const sendable = station.status === 'online' || station.status === 'in_game';
  const variant = sendable
    ? {
        border: 'border-emerald-500/25',
        bg: 'bg-gradient-to-br from-emerald-500/10 to-dark-900/60',
        bar: 'bg-emerald-400',
        dot: 'bg-emerald-400 shadow-[0_0_10px_#24d17e]',
        num: 'text-emerald-400',
        state: 'text-emerald-300',
        stateLabel: 'Libre',
        Icon: CheckCircle2,
        iconColor: 'text-emerald-300',
        meta: 'prêt à partir',
        metaColor: 'text-gray-500',
      }
    : {
        border: 'border-orange-500/25',
        bg: 'bg-gradient-to-br from-orange-500/10 to-dark-900/60',
        bar: 'bg-orange-400',
        dot: 'bg-orange-400 shadow-[0_0_10px_#ff7a1a]',
        num: 'text-orange-400',
        state: 'text-orange-300',
        stateLabel: 'Indisponible',
        Icon: AlertTriangle,
        iconColor: 'text-orange-300',
        meta: 'agent hors ligne',
        metaColor: 'text-orange-300/60',
      };
  const Icon = variant.Icon;

  return (
    <div
      onClick={() => sendable && onToggle()}
      className={`relative min-h-[160px] overflow-hidden rounded-xl border p-4 transition-all ${variant.border} ${variant.bg} ${
        sendable ? 'cursor-pointer hover:border-racing-cyan/50' : 'cursor-not-allowed opacity-70'
      } ${selected ? 'ring-2 ring-racing-cyan shadow-[0_0_34px_rgba(0,140,255,0.35)]' : ''}`}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${variant.bar}`} />
      <span
        className={`absolute right-2 top-2 h-3.5 w-3.5 border-r border-t ${
          selected ? 'border-racing-cyan' : 'border-white/10'
        }`}
      />

      <div className="flex items-center justify-between gap-2">
        <span className={`truncate font-hud-mono text-[11px] ${variant.num}`}>
          {station.stationId}
        </span>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${variant.dot}`} />
      </div>

      <p className="mt-3 truncate font-hud text-2xl font-bold leading-tight text-white">
        {station.name}
      </p>
      <p className={`mt-1 font-hud text-sm font-bold ${variant.state}`}>{variant.stateLabel}</p>

      <div className="mt-3 flex min-h-[24px] items-center gap-2 border-t border-white/10 pt-3">
        <Icon className={`h-4 w-4 shrink-0 ${variant.iconColor}`} />
        <span className={`truncate font-hud-mono text-xs ${variant.metaColor}`}>
          {variant.meta}
        </span>
      </div>
    </div>
  );
}

function PodSessionCell({
  station,
  session,
  telemetry,
  now,
  content,
  onClick,
}: {
  station: Station;
  session: ActiveSession;
  telemetry?: TelemetrySnapshot;
  now: number;
  content: StationContent | null | undefined;
  onClick: () => void;
}) {
  const labelMap = useContentLabelMap();
  const remainingSeconds =
    session.startedAt && session.durationMinutes
      ? Math.max(
          0,
          Math.round(
            (new Date(session.startedAt).getTime() + session.durationMinutes * 60 * 1000 - now) /
              1000,
          ),
        )
      : undefined;
  const elapsedSeconds = session.startedAt
    ? Math.max(0, Math.round((now - new Date(session.startedAt).getTime()) / 1000))
    : 0;
  const expired = remainingSeconds !== undefined && remainingSeconds <= 0;
  const critical = !expired && remainingSeconds !== undefined && remainingSeconds <= 60;
  const stale = !telemetry || now - telemetry.timestamp > STALE_MS;
  const trackPreview = findTrackPreview(session.track, content);
  const car = findCar(session.carAcId, content);
  const carName = session.carAcId ? formatCarName(car?.name, session.carAcId, labelMap) : undefined;

  return (
    <div
      onClick={onClick}
      className={`group relative flex min-h-[160px] cursor-pointer flex-col justify-between overflow-hidden rounded-xl border transition-colors hover:border-racing-cyan/50 ${
        critical ? 'border-red-500/50' : 'border-racing-cyan/25'
      }`}
      style={critical ? { boxShadow: '0 0 24px -10px rgba(255,51,51,0.6)' } : undefined}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-racing-blue/15 via-dark-900/70 to-dark-950" />
      {trackPreview && (
        <img
          src={trackPreview}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-20"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-dark-900/95 via-dark-900/50 to-transparent" />
      <span className="absolute inset-y-0 left-0 z-10 w-[3px] bg-gradient-to-b from-racing-blue to-racing-cyan" />
      <span className="absolute right-2 top-2 z-10 h-3.5 w-3.5 border-r border-t border-racing-cyan/70" />

      <div className="relative z-10 flex h-full flex-col justify-between p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-racing-cyan shadow-[0_0_8px_#00c2ff]" />
            <p className="truncate font-hud-mono text-[10px] font-bold uppercase tracking-widest text-sky-300">
              {station.name}
            </p>
          </div>
          <h3 className="mt-1 truncate font-hud text-lg font-bold uppercase leading-tight text-white">
            {session.clientName || station.name}
          </h3>
          <p className="truncate font-hud-mono text-[11px] text-sky-200/60">{carName ?? '—'}</p>
        </div>

        <div className="mt-2 flex items-end justify-between border-t border-white/10 pt-2">
          <div>
            <p className="font-hud text-[9px] uppercase tracking-wide text-gray-500">Vitesse</p>
            <p
              className={`font-hud-mono text-xl font-bold tabular-nums ${stale ? 'text-gray-500' : 'text-racing-cyan'}`}
            >
              {stale ? '—' : Math.round(telemetry!.speedKmh)}
              <span className="ml-1 text-[10px] text-gray-500">km/h</span>
            </p>
          </div>
          <div className="text-right">
            <p className="font-hud text-[9px] uppercase tracking-wide text-gray-500">
              {remainingSeconds !== undefined ? 'Restant' : 'Écoulé'}
            </p>
            <p
              className={`font-hud-mono text-xl font-bold tabular-nums ${
                expired ? 'text-red-500' : critical ? 'animate-blink text-red-400' : 'text-white'
              }`}
            >
              {expired ? '00:00' : formatClock(remainingSeconds ?? elapsedSeconds)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Redesigned "choose a server" step — replaces the old plain Modal. Always
 * shown when the operator confirms a POD selection (even with a single
 * server running), so the destination is always explicit; shows a
 * "no server" empty state with a direct create-server shortcut instead of
 * silently redirecting, matching the Claude Design "Kiosque HUD" mockup. */
function ServerPickerOverlay({
  servers,
  selectedCount,
  onClose,
  onPick,
  onCreateServer,
}: {
  servers: DedicatedServer[];
  selectedCount: number;
  onClose: () => void;
  onPick: (server: DedicatedServer) => void;
  onCreateServer: () => void;
}) {
  const labelMap = useContentLabelMap();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-xl border border-racing-cyan/30 bg-gradient-to-br from-[#0b1428]/95 to-dark-900/95 p-7 shadow-[0_0_60px_rgba(0,80,255,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="absolute left-2 top-2 h-4 w-4 border-l border-t border-racing-cyan/70" />
        <span className="absolute right-2 top-2 h-4 w-4 border-r border-t border-racing-cyan/70" />
        <span className="absolute bottom-2 left-2 h-4 w-4 border-b border-l border-racing-cyan/70" />
        <span className="absolute bottom-2 right-2 h-4 w-4 border-b border-r border-racing-cyan/70" />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-hud text-xs font-semibold uppercase tracking-widest text-racing-cyan">
              Envoyer {selectedCount} POD{selectedCount > 1 ? 's' : ''}
            </p>
            <h2 className="mt-1 font-hud text-3xl font-bold text-white">Choisis le serveur</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 text-gray-400 transition-colors hover:border-red-500/40 hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="my-5 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(0,194,255,.3) 6%, rgba(0,194,255,.3) 94%, transparent)',
          }}
        />

        {servers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-white/10 px-6 py-9 text-center">
            <Server className="h-8 w-8 text-gray-600" />
            <p className="font-hud text-lg font-bold text-gray-200">Aucun serveur disponible</p>
            <p className="max-w-sm text-sm text-gray-500">
              Crée un serveur pour envoyer {selectedCount} POD{selectedCount > 1 ? 's' : ''} en
              course.
            </p>
          </div>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto pr-1">
            {servers.map((server) => {
              const trackName = findTrackName(
                server.track,
                server.station.content as { tracks?: { acId: string; name: string }[] } | undefined,
                labelMap,
              );
              return (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => onPick(server)}
                  className="relative flex items-center gap-4 overflow-hidden rounded-lg border border-racing-cyan/25 bg-gradient-to-r from-racing-blue/10 to-dark-900/40 p-4 text-left transition-colors hover:border-racing-cyan/60"
                >
                  <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-racing-blue to-racing-cyan" />
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-racing-cyan/25 bg-racing-cyan/10 text-sky-300">
                    <Server className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="truncate font-hud text-xl font-bold text-white">
                        {server.name}
                      </span>
                      <ServerStatusBadge status={server.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-4 font-hud text-sm font-semibold text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-racing-cyan" />
                        {trackName}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-racing-cyan" />
                        {server.cars.length} voiture{server.cars.length > 1 ? 's' : ''} ·{' '}
                        {server.maxClients} slots
                      </span>
                      <span className="font-hud-mono text-xs text-gray-500">
                        {server.station.localIp ?? '—'}
                        {server.udpPort ? `:${server.udpPort}` : ''}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-sky-300" />
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-white/10 pt-5">
          <button
            type="button"
            onClick={onCreateServer}
            className="flex h-12 flex-1 items-center justify-center gap-2.5 rounded-lg bg-gradient-to-r from-racing-blue to-racing-cyan px-5 font-hud text-base font-bold tracking-wide text-dark-950 shadow-[0_0_30px_rgba(0,120,255,0.32)] transition-shadow hover:shadow-[0_0_42px_rgba(0,150,255,0.5)]"
          >
            <Plus className="h-4 w-4" />
            Créer un serveur
          </button>
          <span className="whitespace-nowrap font-hud-mono text-xs text-gray-500">
            circuit et voitures en 3 étapes
          </span>
        </div>
      </div>
    </div>
  );
}

function SendPodsModal({
  server,
  stations,
  preselectStationIds,
  onClose,
}: {
  server: DedicatedServer;
  stations: Station[];
  preselectStationIds?: string[];
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

  const [selectedIds, setSelectedIds] = useState<string[]>(preselectStationIds ?? []);
  const [configs, setConfigs] = useState<Record<string, PodConfig>>(() =>
    Object.fromEntries(
      (preselectStationIds ?? []).map((id) => [
        id,
        { ...DEFAULT_POD_CONFIG, carAcId: availableCars[0] ?? '' },
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  function toggleStation(stationId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(stationId)) return prev.filter((x) => x !== stationId);
      setConfigs((c) => ({
        ...c,
        [stationId]: c[stationId] ?? { ...DEFAULT_POD_CONFIG, carAcId: availableCars[0] ?? '' },
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
          durationMinutes: cfg.durationMinutes,
        };
      });
      await dedicatedServersApi.join(server.id, pods);
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
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-dark-950">
      <header className="flex shrink-0 items-center gap-4 border-b border-dark-700 bg-dark-900/60 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-dark-700 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-black uppercase tracking-wide text-white">
          Envoyer sur <span className="text-accent-orange">{server.name}</span>
        </h2>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex min-h-full max-w-6xl flex-col justify-center space-y-6">
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
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 border-t border-dark-700 bg-dark-900/80 px-6 py-4">
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
  const labelMap = useContentLabelMap();
  return (
    <div className="overflow-hidden rounded-xl border border-dark-600 bg-dark-900/60">
      <div className="flex items-center justify-between border-b border-dark-700 bg-gradient-to-r from-accent-orange/10 to-transparent px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-accent-orange" />
          <span className="font-bold text-white">{station.name}</span>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
          <Clock4 className="h-4 w-4" />
          {config.durationMinutes ? `${config.durationMinutes} min` : 'Illimité'}
        </span>
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
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
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
                          alt={formatCarName(car.name, acId, labelMap)}
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
                      {formatCarName(car?.name, acId, labelMap)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-dark-700 p-4">
        <Label>
          <Clock className="mr-1 inline h-3.5 w-3.5" />
          Durée de session
        </Label>
        <div className="flex flex-wrap gap-2">
          {DURATION_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => onChange({ durationMinutes: option.value })}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all ${
                config.durationMinutes === option.value
                  ? 'border-accent-orange bg-accent-orange/10 text-white'
                  : 'border-dark-600 bg-dark-800 text-gray-400 hover:border-dark-500'
              }`}
            >
              {option.value === undefined && <InfinityIcon className="h-3.5 w-3.5" />}
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
