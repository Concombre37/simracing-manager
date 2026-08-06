import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { PageTransition } from '../components/PageTransition';
import { stationsApi, type Station } from '../services/stations';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../hooks/useAuth';
import { downloadEnvFile } from '../utils/downloadEnv';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { CreateStationModal } from '../components/CreateStationModal';
import { BlankingMediaModal } from '../components/BlankingMediaModal';
import {
  Play,
  Square,
  LineChart,
  Cog,
  MapPin,
  Glasses,
  RefreshCw,
  Key,
  Trash2,
  ChevronDown,
  Monitor,
  Download,
  Eye,
  EyeOff,
  ImageIcon,
  Gamepad2,
  Server,
  Terminal,
  AlertTriangle,
} from 'lucide-react';

type StatusFilter = 'all' | Station['status'];
type RoleFilter = 'all' | Station['role'];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'online', label: 'En ligne' },
  { value: 'in_game', label: 'En jeu' },
  { value: 'updating', label: 'Mise à jour' },
  { value: 'offline', label: 'Hors ligne' },
];

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'Tous types' },
  { value: 'simulator', label: 'Simulateurs' },
  { value: 'admin', label: 'Admin' },
];

const STATUS_VARIANT: Record<
  Station['status'],
  {
    border: string;
    bg: string;
    bar: string;
    dot: string;
    num: string;
    label: string;
    labelColor: string;
    pulse?: boolean;
    text: string;
  }
> = {
  online: {
    border: 'border-white/5 hover:border-emerald-500/30',
    bg: 'bg-gradient-to-r from-emerald-500/[0.07] to-dark-900/50',
    bar: 'bg-emerald-400',
    dot: 'bg-emerald-400 shadow-[0_0_9px_#24d17e]',
    num: 'text-emerald-400',
    label: 'En ligne',
    labelColor: 'text-emerald-400',
    text: 'text-white',
  },
  in_game: {
    border: 'border-racing-cyan/20 hover:border-racing-cyan/45',
    bg: 'bg-gradient-to-r from-racing-cyan/[0.09] to-dark-900/50',
    bar: 'bg-gradient-to-b from-racing-blue to-racing-cyan',
    dot: 'bg-racing-cyan shadow-[0_0_9px_#00c2ff]',
    num: 'text-racing-cyan',
    label: 'En jeu',
    labelColor: 'text-racing-cyan',
    pulse: true,
    text: 'text-white',
  },
  updating: {
    border: 'border-purple-400/20 hover:border-purple-400/45',
    bg: 'bg-gradient-to-r from-purple-400/[0.09] to-dark-900/50',
    bar: 'bg-purple-400',
    dot: 'bg-purple-400 shadow-[0_0_9px_#a855f7]',
    num: 'text-purple-300',
    label: 'Mise à jour',
    labelColor: 'text-purple-300',
    pulse: true,
    text: 'text-white',
  },
  offline: {
    border: 'border-orange-500/20 hover:border-orange-500/45',
    bg: 'bg-dark-900/45',
    bar: 'bg-orange-400',
    dot: 'bg-orange-400 shadow-[0_0_9px_rgba(255,122,26,.8)]',
    num: 'text-orange-400',
    label: 'Hors ligne',
    labelColor: 'text-orange-300',
    text: 'text-gray-300',
  },
};

export function Stations() {
  const queryClient = useQueryClient();
  const { isAdmin, isTechnician } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [apiKeyStation, setApiKeyStation] = useState<{
    stationId: string;
    name: string;
    apiKey: string;
  } | null>(null);
  const [blankingStation, setBlankingStation] = useState<Station | null>(null);
  const [logsStation, setLogsStation] = useState<Station | null>(null);
  const socket = useSocket('/');

  const { data, isLoading, error } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
    refetchInterval: 5000,
  });

  socket?.on('station:updated', ({ stationId, status, blankingActive }) => {
    queryClient.setQueryData<Station[]>(['stations'], (old) =>
      old?.map((s) => (s.stationId === stationId ? { ...s, status, blankingActive } : s)),
    );
  });

  const launchMutation = useMutation({
    mutationFn: stationsApi.launch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
  });

  const stopMutation = useMutation({
    mutationFn: stationsApi.stop,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
  });

  const updateAgentMutation = useMutation({
    mutationFn: stationsApi.updateAgent,
  });

  const regenerateKeyMutation = useMutation({
    mutationFn: stationsApi.regenerateApiKey,
    onSuccess: (station) => {
      setApiKeyStation({
        stationId: station.stationId,
        name: station.name,
        apiKey: station.apiKey,
      });
      void queryClient.invalidateQueries({ queryKey: ['stations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: stationsApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Station['role'] }) =>
      stationsApi.update(id, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
  });

  function sendCommand(stationId: string, command: string) {
    socket?.emit('station:command', { stationId, command });
  }

  const filtered = useMemo(
    () =>
      data?.filter(
        (s) =>
          (statusFilter === 'all' || s.status === statusFilter) &&
          (roleFilter === 'all' || s.role === roleFilter),
      ) ?? [],
    [data, statusFilter, roleFilter],
  );

  const simulatorRows = filtered.filter((s) => s.role === 'simulator');
  const adminRows = filtered.filter((s) => s.role === 'admin');

  const rowProps = {
    isAdmin,
    isTechnician,
    expandedId,
    onToggleExpand: (id: string) => setExpandedId((prev) => (prev === id ? null : id)),
    onLaunch: (id: string) => launchMutation.mutate(id),
    isLaunching: launchMutation.isPending,
    onStop: (id: string) => stopMutation.mutate(id),
    isStopping: stopMutation.isPending,
    onSendCommand: sendCommand,
    onOpenBlanking: setBlankingStation,
    onOpenLogs: setLogsStation,
    onUpdateAgent: (id: string) => updateAgentMutation.mutate(id),
    isUpdatingAgent: updateAgentMutation.isPending,
    onRegenerateKey: (id: string) => regenerateKeyMutation.mutate(id),
    isRegeneratingKey: regenerateKeyMutation.isPending,
    onDelete: (id: string) => {
      if (confirm('Supprimer cette station ?')) deleteMutation.mutate(id);
    },
    onUpdateRole: (id: string, role: Station['role']) => updateRoleMutation.mutate({ id, role }),
    updateRolePendingId: updateRoleMutation.isPending
      ? updateRoleMutation.variables?.id
      : undefined,
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* HERO */}
        <div className="flex flex-wrap items-end gap-6">
          <div className="min-w-[260px] flex-1">
            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="h-[5px] w-[5px] flex-none rotate-45 bg-racing-cyan shadow-[0_0_8px_#00c2ff]" />
              <span className="whitespace-nowrap font-hud text-xs font-semibold uppercase tracking-[0.16em] text-racing-cyan">
                Commandes temps réel
              </span>
            </div>
            <h1 className="font-hud text-[clamp(34px,4.4vw,48px)] font-bold leading-none tracking-tight text-white">
              Contrôle des{' '}
              <span className="bg-gradient-to-r from-racing-blue to-racing-cyan bg-clip-text text-transparent">
                postes
              </span>
            </h1>
            <p className="mt-2.5 font-hud-mono text-xs text-gray-500">
              Gestion des POD et commandes temps réel
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 whitespace-nowrap rounded-md bg-gradient-to-r from-racing-blue to-racing-cyan px-5 py-2.5 font-hud text-sm font-bold tracking-wide text-dark-950 shadow-[0_0_26px_rgba(0,120,255,0.3)] transition-shadow hover:shadow-[0_0_36px_rgba(0,150,255,0.5)]"
            >
              <Monitor className="h-4 w-4" />
              Nouveau poste
            </button>
          )}
        </div>

        {/* FILTRES */}
        <div className="flex flex-col gap-2.5 border-y border-white/10 py-4">
          <FilterRow label="État">
            {FILTERS.map((f) => {
              const active = statusFilter === f.value;
              const count =
                f.value === 'all'
                  ? (data?.length ?? 0)
                  : (data?.filter((s) => s.status === f.value).length ?? 0);
              return (
                <FilterPill key={f.value} active={active} onClick={() => setStatusFilter(f.value)}>
                  {f.label} <span className="opacity-60">{count}</span>
                </FilterPill>
              );
            })}
          </FilterRow>
          <FilterRow label="Type">
            {ROLE_FILTERS.map((f) => {
              const active = roleFilter === f.value;
              const count =
                f.value === 'all'
                  ? (data?.length ?? 0)
                  : (data?.filter((s) => s.role === f.value).length ?? 0);
              return (
                <FilterPill key={f.value} active={active} onClick={() => setRoleFilter(f.value)}>
                  {f.label} <span className="opacity-60">{count}</span>
                </FilterPill>
              );
            })}
          </FilterRow>
        </div>

        {isLoading && <p className="text-gray-500">Chargement des stations...</p>}
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-900/30 p-4 text-red-300">
            Erreur lors du chargement des stations
          </div>
        )}

        {/* SIMULATEURS */}
        <section>
          <SectionHeader title="Simulateurs" hint={`${simulatorRows.length} POD`} />
          <motion.div layout className="flex flex-col gap-2">
            <AnimatePresence mode="popLayout">
              {simulatorRows.map((station, i) => (
                <StationRow
                  key={station.id}
                  station={station}
                  index={i + 1}
                  expanded={expandedId === station.id}
                  {...rowProps}
                />
              ))}
            </AnimatePresence>
          </motion.div>
          {simulatorRows.length === 0 && !isLoading && (
            <p className="rounded-lg border border-dashed border-white/10 py-8 text-center text-sm text-gray-500">
              Aucun poste simulateur ne correspond à ce filtre.
            </p>
          )}
        </section>

        {/* ADMIN */}
        {adminRows.length > 0 && (
          <section>
            <SectionHeader title="Poste admin" hint="hors parc simulateur" dot="purple" />
            <motion.div layout className="flex flex-col gap-2">
              <AnimatePresence mode="popLayout">
                {adminRows.map((station) => (
                  <StationRow
                    key={station.id}
                    station={station}
                    expanded={expandedId === station.id}
                    {...rowProps}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </section>
        )}

        {filtered.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16">
            <Monitor className="mb-4 h-14 w-14 text-gray-600" />
            <h3 className="mb-2 font-hud text-lg font-bold text-white">Aucun poste</h3>
            <p className="max-w-md text-center text-sm text-gray-400">
              {data?.length
                ? 'Aucun poste ne correspond à ce filtre.'
                : 'Ajoute un poste pour commencer à piloter tes simulateurs.'}
            </p>
          </div>
        )}

        {showModal && (
          <CreateStationModal
            onClose={() => setShowModal(false)}
            onCreated={() => queryClient.invalidateQueries({ queryKey: ['stations'] })}
          />
        )}

        {blankingStation && (
          <BlankingMediaModal station={blankingStation} onClose={() => setBlankingStation(null)} />
        )}

        {logsStation && <LogsModal station={logsStation} onClose={() => setLogsStation(null)} />}

        {apiKeyStation && (
          <Modal title="Nouvelle clé API" onClose={() => setApiKeyStation(null)}>
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Télécharge la configuration et place le fichier à côté de{' '}
                <code>sim-center-agent-win.exe</code>, puis renomme-le en <code>.env</code>.
              </p>
              <code className="block break-all rounded-lg border border-dark-600 bg-dark-900 p-4 font-mono text-sm text-accent-blue">
                API_KEY={apiKeyStation.apiKey}
              </code>
              <Button
                variant="primary"
                onClick={() => downloadEnvFile(apiKeyStation)}
                className="w-full"
              >
                <Download className="h-4 w-4" />
                Télécharger la config (.env)
              </Button>
              <Button variant="secondary" onClick={() => setApiKeyStation(null)} className="w-full">
                Fermer
              </Button>
            </div>
          </Modal>
        )}
      </div>
    </PageTransition>
  );
}

function SectionHeader({
  title,
  hint,
  dot = 'cyan',
}: {
  title: string;
  hint: string;
  dot?: 'cyan' | 'purple';
}) {
  return (
    <div className="mb-3 flex items-center gap-3.5">
      <h2 className="whitespace-nowrap font-hud text-lg font-bold tracking-wide text-white">
        {title}
      </h2>
      <span
        className={`h-1 w-1 flex-none rotate-45 ${dot === 'purple' ? 'bg-purple-400' : 'bg-racing-cyan'}`}
      />
      <span className="whitespace-nowrap font-hud-mono text-[11.5px] text-gray-500">{hint}</span>
      <div className="h-px min-w-[8px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[60px] flex-none font-hud text-[11.5px] font-semibold tracking-wide text-gray-400">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center gap-2 whitespace-nowrap rounded px-3.5 font-hud text-sm font-bold transition-colors ${
        active
          ? 'border border-racing-cyan/45 bg-gradient-to-r from-racing-blue/30 to-racing-cyan/15 text-white'
          : 'border border-white/10 text-gray-400 hover:border-racing-cyan/40 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function ActionPill({
  icon: Icon,
  children,
  onClick,
  tone = 'default',
  disabled,
}: {
  icon: React.ElementType;
  children: ReactNode;
  onClick: (e: React.MouseEvent) => void;
  tone?: 'default' | 'green' | 'red';
  disabled?: boolean;
}) {
  const toneClass =
    tone === 'green'
      ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
      : tone === 'red'
        ? 'border-red-500/35 text-red-300 hover:bg-red-500/10'
        : 'border-white/10 text-gray-500';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded border px-3.5 font-hud text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      <Icon className="h-3 w-3" />
      {children}
    </button>
  );
}

interface StationRowSharedProps {
  isAdmin: boolean;
  isTechnician: boolean;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onLaunch: (id: string) => void;
  isLaunching: boolean;
  onStop: (id: string) => void;
  isStopping: boolean;
  onSendCommand: (stationId: string, command: string) => void;
  onOpenBlanking: (station: Station) => void;
  onOpenLogs: (station: Station) => void;
  onUpdateAgent: (id: string) => void;
  isUpdatingAgent: boolean;
  onRegenerateKey: (id: string) => void;
  isRegeneratingKey: boolean;
  onDelete: (id: string) => void;
  onUpdateRole: (id: string, role: Station['role']) => void;
  updateRolePendingId?: string;
}

function StationRow({
  station,
  index,
  expanded,
  isAdmin,
  isTechnician,
  onToggleExpand,
  onLaunch,
  isLaunching,
  onStop,
  isStopping,
  onSendCommand,
  onOpenBlanking,
  onOpenLogs,
  onUpdateAgent,
  isUpdatingAgent,
  onRegenerateKey,
  isRegeneratingKey,
  onDelete,
  onUpdateRole,
  updateRolePendingId,
}: StationRowSharedProps & { station: Station; index?: number }) {
  const v = STATUS_VARIANT[station.status];
  const content = station.content as { cars?: unknown[]; tracks?: unknown[] } | null;
  const hasContentWarning =
    station.status !== 'offline' && (!content?.cars?.length || !content?.tracks?.length);

  const metaBits = [
    station.localIp ?? '—',
    station.version ? `v${station.version}` : null,
    station.status === 'in_game'
      ? null
      : station.lastSeenAt
        ? `vu ${new Date(station.lastSeenAt).toLocaleTimeString('fr-FR')}`
        : null,
  ].filter(Boolean);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as const }}
      className={`relative overflow-hidden rounded-lg border transition-colors ${v.border} ${v.bg}`}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${v.bar}`} />

      <div className="flex flex-wrap items-center gap-3.5 p-3.5 pl-5">
        {index !== undefined && (
          <span className={`w-[22px] flex-none font-hud-mono text-xs font-bold ${v.num}`}>
            {String(index).padStart(2, '0')}
          </span>
        )}
        {station.role === 'admin' && (
          <div className="grid h-8 w-8 flex-none place-items-center rounded-md border border-purple-400/30 bg-purple-400/10 text-purple-200">
            <Server className="h-4 w-4" />
          </div>
        )}

        <div className="min-w-[170px] flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <span
              className={`h-1.5 w-1.5 flex-none rounded-full ${v.dot} ${v.pulse ? 'animate-pulse-glow' : ''}`}
            />
            <span className={`truncate font-hud text-lg font-bold tracking-wide ${v.text}`}>
              {station.name}
            </span>
            <span className={`whitespace-nowrap font-hud text-[13px] font-bold ${v.labelColor}`}>
              {v.label}
            </span>
            {station.role === 'admin' && (
              <span className="flex-none whitespace-nowrap rounded border border-purple-400/35 px-2 py-0.5 font-hud text-[11px] font-bold text-purple-200">
                Admin
              </span>
            )}
            <span className="flex flex-none items-center gap-1.5 whitespace-nowrap font-hud text-[13px] font-semibold text-gray-500">
              {station.blankingActive ? (
                <EyeOff className="h-3.5 w-3.5 text-gray-300" />
              ) : (
                <Eye className="h-3.5 w-3.5 text-gray-600" />
              )}
              Blanking
            </span>
            {hasContentWarning && (
              <span
                className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-yellow-700/60 bg-yellow-900/30 px-2.5 py-0.5 font-hud text-[11px] font-bold text-yellow-300"
                title="Aucune voiture/circuit détecté sur ce poste"
              >
                <AlertTriangle className="h-3 w-3" />
                Aucun contenu
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate pl-4 font-hud-mono text-xs text-gray-500">
            {metaBits.join(' · ')}
          </p>
        </div>

        <div className="flex flex-none items-center gap-2">
          {isAdmin && station.role === 'simulator' && (
            <>
              <ActionPill
                icon={Play}
                tone="green"
                disabled={isLaunching}
                onClick={(e) => {
                  e.stopPropagation();
                  onLaunch(station.id);
                }}
              >
                Lancer
              </ActionPill>
              <ActionPill
                icon={Square}
                tone="red"
                disabled={isStopping}
                onClick={(e) => {
                  e.stopPropagation();
                  onStop(station.id);
                }}
              >
                Arrêter
              </ActionPill>
            </>
          )}
          <button
            type="button"
            onClick={() => onToggleExpand(station.id)}
            className="grid h-8 w-8 flex-none place-items-center rounded text-gray-500 transition-colors hover:bg-racing-cyan/10 hover:text-racing-cyan"
            title="Détails et commandes"
          >
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="block"
            >
              <ChevronDown className="h-4 w-4" />
            </motion.span>
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] as const }}
            className="overflow-hidden"
          >
            <div className="grid gap-5 border-t border-white/10 p-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {isAdmin && station.role === 'simulator' && (
                <CommandGroup title="Commandes en jeu">
                  <Chip
                    icon={LineChart}
                    onClick={() => onSendCommand(station.stationId, 'idealLine')}
                  >
                    Ideal Line
                  </Chip>
                  <Chip icon={Cog} onClick={() => onSendCommand(station.stationId, 'autoShifter')}>
                    Auto Shifter
                  </Chip>
                  <Chip
                    icon={MapPin}
                    onClick={() => onSendCommand(station.stationId, 'teleportToPits')}
                  >
                    Pits
                  </Chip>
                  <Chip
                    icon={Glasses}
                    onClick={() => onSendCommand(station.stationId, 'recenterVR')}
                  >
                    Recenter VR
                  </Chip>
                </CommandGroup>
              )}

              {isAdmin && (
                <CommandGroup title="Écran">
                  <Chip icon={Eye} onClick={() => onSendCommand(station.stationId, 'blankingHide')}>
                    Masquer
                  </Chip>
                  <Chip
                    icon={EyeOff}
                    onClick={() => onSendCommand(station.stationId, 'blankingShow')}
                  >
                    Afficher
                  </Chip>
                  <Chip icon={ImageIcon} onClick={() => onOpenBlanking(station)}>
                    Écran d'attente
                  </Chip>
                </CommandGroup>
              )}

              {(isAdmin || isTechnician) && (
                <CommandGroup title="Maintenance">
                  <Chip
                    icon={RefreshCw}
                    isLoading={isUpdatingAgent}
                    onClick={() => onUpdateAgent(station.id)}
                  >
                    MAJ agent
                  </Chip>
                  <Chip icon={Terminal} onClick={() => onOpenLogs(station)}>
                    Logs
                  </Chip>
                  {isAdmin && (
                    <>
                      <Chip
                        icon={Key}
                        isLoading={isRegeneratingKey}
                        onClick={() => onRegenerateKey(station.id)}
                      >
                        Clé API
                      </Chip>
                      <Chip icon={Trash2} danger onClick={() => onDelete(station.id)}>
                        Supprimer
                      </Chip>
                    </>
                  )}
                </CommandGroup>
              )}

              {isAdmin && (
                <CommandGroup title="Type de poste">
                  <Chip
                    icon={Gamepad2}
                    active={station.role === 'simulator'}
                    isLoading={updateRolePendingId === station.id}
                    onClick={() => onUpdateRole(station.id, 'simulator')}
                  >
                    Simulateur
                  </Chip>
                  <Chip
                    icon={Server}
                    active={station.role === 'admin'}
                    isLoading={updateRolePendingId === station.id}
                    onClick={() => onUpdateRole(station.id, 'admin')}
                  >
                    Admin
                  </Chip>
                </CommandGroup>
              )}

              <div className="[grid-column:1/-1]">
                <p className="font-hud text-[11.5px] font-semibold tracking-wide text-gray-400">
                  Configuration
                </p>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-white/[0.07] bg-black/40 p-3 font-hud-mono text-xs text-gray-400">
                  {station.config
                    ? JSON.stringify(station.config, null, 2)
                    : 'Aucune configuration'}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CommandGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-hud text-[11.5px] font-semibold tracking-wide text-gray-400">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  icon: Icon,
  children,
  onClick,
  danger,
  isLoading,
  active,
}: {
  icon: React.ElementType;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  isLoading?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={`inline-flex h-[34px] items-center gap-2 whitespace-nowrap rounded border px-3.5 font-hud text-sm font-bold transition-all active:scale-95 disabled:opacity-50 ${
        danger
          ? 'border-red-500/35 bg-red-500/10 text-red-300 hover:bg-red-500/20'
          : active
            ? 'border-racing-cyan/50 bg-gradient-to-r from-racing-blue/25 to-racing-cyan/10 text-white'
            : 'border-white/[0.09] bg-white/[0.02] text-gray-300 hover:border-racing-cyan/45 hover:bg-racing-cyan/[0.08] hover:text-white'
      }`}
    >
      {isLoading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : (
        <Icon className={`h-3.5 w-3.5 ${danger ? '' : 'text-racing-cyan'}`} />
      )}
      {children}
    </button>
  );
}

function LogsModal({ station, onClose }: { station: Station; onClose: () => void }) {
  const { data, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['station-logs', station.id],
    queryFn: () => stationsApi.getLogs(station.id),
  });

  const lines = data?.lines ?? [];

  return (
    <Modal title={`Logs — ${station.name}`} onClose={onClose} size="lg">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {isFetching
              ? 'Récupération en cours...'
              : dataUpdatedAt
                ? `Mis à jour à ${new Date(dataUpdatedAt).toLocaleTimeString('fr-FR')}`
                : ''}
          </p>
          <Button variant="secondary" size="sm" onClick={() => refetch()} isLoading={isFetching}>
            <RefreshCw className="h-3.5 w-3.5" />
            Actualiser
          </Button>
        </div>
        <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-dark-600 bg-dark-950 p-3 font-mono text-xs text-gray-300">
          {lines.length === 0 ? (
            <p className="py-6 text-center text-gray-500">
              {isFetching
                ? 'Chargement...'
                : "Aucun log reçu — l'agent n'est peut-être pas connecté."}
            </p>
          ) : (
            lines.map((line, i) => (
              <p key={i} className="whitespace-pre-wrap break-all">
                {line}
              </p>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
