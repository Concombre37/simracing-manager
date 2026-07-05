import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { stationsApi, type Station } from '../services/stations';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../hooks/useAuth';
import { downloadEnvFile } from '../utils/downloadEnv';
import { PageShell } from '../components/ui/PageShell';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
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
} from 'lucide-react';

type StatusFilter = 'all' | Station['status'];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'online', label: 'En ligne' },
  { value: 'in_game', label: 'En jeu' },
  { value: 'updating', label: 'Mise à jour' },
  { value: 'offline', label: 'Hors ligne' },
];

export function Stations() {
  const queryClient = useQueryClient();
  const { isAdmin, isTechnician } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [apiKeyStation, setApiKeyStation] = useState<{
    stationId: string;
    name: string;
    apiKey: string;
  } | null>(null);
  const [blankingStation, setBlankingStation] = useState<Station | null>(null);
  const socket = useSocket('/');

  const { data, isLoading, error } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
    refetchInterval: 5000,
  });

  socket?.on('station:updated', ({ stationId, status }) => {
    queryClient.setQueryData<Station[]>(['stations'], (old) =>
      old?.map((s) => (s.stationId === stationId ? { ...s, status } : s)),
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

  function sendCommand(stationId: string, command: string) {
    socket?.emit('station:command', { stationId, command });
  }

  const filtered = useMemo(
    () => data?.filter((s) => statusFilter === 'all' || s.status === statusFilter) ?? [],
    [data, statusFilter],
  );

  return (
    <PageShell
      title="Contrôle des"
      accent="postes"
      subtitle="Gestion des POD et commandes temps réel"
      actions={
        isAdmin ? (
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <Monitor className="h-4 w-4" />
            Nouveau poste
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = statusFilter === f.value;
          const count =
            f.value === 'all'
              ? (data?.length ?? 0)
              : (data?.filter((s) => s.status === f.value).length ?? 0);
          return (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'text-dark-900'
                  : 'border border-dark-600 bg-dark-800/70 text-gray-400 hover:text-white'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="station-filter-pill"
                  className="absolute inset-0 rounded-full bg-accent-orange shadow-glow-orange"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {f.label}
                <span className={active ? 'opacity-80' : 'opacity-50'}>{count}</span>
              </span>
            </button>
          );
        })}
      </div>

      {isLoading && <p className="text-gray-500">Chargement des stations...</p>}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/30 p-4 text-red-300">
          Erreur lors du chargement des stations
        </div>
      )}

      <motion.div layout className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((station) => {
            const expanded = expandedId === station.id;
            return (
              <motion.div
                key={station.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }}
              >
                <div className="relative overflow-hidden rounded-xl border border-dark-600 bg-dark-800/70 backdrop-blur-sm transition-colors hover:border-dark-500">
                  <span
                    className={`absolute bottom-0 left-0 top-0 w-1 ${getStripe(station.status)}`}
                  />

                  {/* Ligne principale */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3 py-4 pl-6 pr-4">
                    <div className="flex min-w-[200px] items-center gap-3">
                      <div className={`rounded-lg p-2 ${getStatusBg(station.status)}`}>
                        <Monitor className={`h-5 w-5 ${getStatusColor(station.status)}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{station.name}</h3>
                        <p className="font-mono text-xs text-gray-500">{station.stationId}</p>
                      </div>
                    </div>

                    <StatusBadge status={station.status} />

                    <div className="ml-auto mr-2 hidden grid-cols-3 gap-6 xl:grid">
                      <Cell label="IP locale" value={station.localIp ?? '—'} />
                      <Cell label="Agent" value={station.version ? `v${station.version}` : '—'} />
                      <Cell
                        label="Vu à"
                        value={
                          station.lastSeenAt
                            ? new Date(station.lastSeenAt).toLocaleTimeString('fr-FR')
                            : '—'
                        }
                      />
                    </div>

                    <div className="ml-auto flex items-center gap-2 xl:ml-0">
                      {isAdmin && (
                        <>
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => launchMutation.mutate(station.id)}
                            isLoading={launchMutation.isPending}
                          >
                            <Play className="h-4 w-4" />
                            Lancer
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => stopMutation.mutate(station.id)}
                            isLoading={stopMutation.isPending}
                          >
                            <Square className="h-4 w-4" />
                            Arrêter
                          </Button>
                        </>
                      )}
                      <button
                        onClick={() => setExpandedId(expanded ? null : station.id)}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-dark-700 hover:text-white"
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

                  {/* Panneau déplié : commandes groupées */}
                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-4 border-t border-dark-700 px-6 py-4">
                          {isAdmin && (
                            <div className="grid gap-4 md:grid-cols-2">
                              <CommandGroup title="Commandes en jeu">
                                <Chip
                                  icon={LineChart}
                                  onClick={() => sendCommand(station.stationId, 'idealLine')}
                                >
                                  Ideal Line
                                </Chip>
                                <Chip
                                  icon={Cog}
                                  onClick={() => sendCommand(station.stationId, 'autoShifter')}
                                >
                                  Auto Shifter
                                </Chip>
                                <Chip
                                  icon={MapPin}
                                  onClick={() => sendCommand(station.stationId, 'teleportToPits')}
                                >
                                  Pits
                                </Chip>
                                <Chip
                                  icon={Glasses}
                                  onClick={() => sendCommand(station.stationId, 'recenterVR')}
                                >
                                  Recenter VR
                                </Chip>
                              </CommandGroup>

                              <CommandGroup title="Écran">
                                <Chip
                                  icon={Eye}
                                  onClick={() => sendCommand(station.stationId, 'blankingHide')}
                                >
                                  Masquer
                                </Chip>
                                <Chip
                                  icon={EyeOff}
                                  onClick={() => sendCommand(station.stationId, 'blankingShow')}
                                >
                                  Afficher
                                </Chip>
                                <Chip icon={ImageIcon} onClick={() => setBlankingStation(station)}>
                                  Écran d'attente
                                </Chip>
                              </CommandGroup>
                            </div>
                          )}

                          {(isAdmin || isTechnician) && (
                            <CommandGroup title="Maintenance">
                              <Chip
                                icon={RefreshCw}
                                onClick={() => updateAgentMutation.mutate(station.id)}
                                isLoading={updateAgentMutation.isPending}
                              >
                                MAJ agent
                              </Chip>
                              {isAdmin && (
                                <>
                                  <Chip
                                    icon={Key}
                                    onClick={() => regenerateKeyMutation.mutate(station.id)}
                                    isLoading={regenerateKeyMutation.isPending}
                                  >
                                    Clé API
                                  </Chip>
                                  <Chip
                                    icon={Trash2}
                                    danger
                                    onClick={() => {
                                      if (confirm('Supprimer cette station ?')) {
                                        deleteMutation.mutate(station.id);
                                      }
                                    }}
                                  >
                                    Supprimer
                                  </Chip>
                                </>
                              )}
                            </CommandGroup>
                          )}

                          <div>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                              Configuration
                            </p>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-dark-700 bg-dark-900/70 p-3 text-xs text-gray-400">
                              {station.config
                                ? JSON.stringify(station.config, null, 2)
                                : 'Aucune configuration'}
                            </pre>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {filtered.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dark-600 bg-dark-800/70 py-16">
          <Monitor className="mb-4 h-14 w-14 text-gray-600" />
          <h3 className="mb-2 text-lg font-semibold text-white">Aucun poste</h3>
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
    </PageShell>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[90px]">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{label}</p>
      <p className="font-mono text-sm text-gray-200">{value}</p>
    </div>
  );
}

function CommandGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  icon: Icon,
  children,
  onClick,
  danger,
  isLoading,
}: {
  icon: React.ElementType;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  isLoading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all active:scale-95 disabled:opacity-50 ${
        danger
          ? 'border-red-900/60 bg-red-900/20 text-red-300 hover:bg-red-900/40'
          : 'border-dark-600 bg-dark-900/60 text-gray-300 hover:border-accent-orange/50 hover:text-white'
      }`}
    >
      {isLoading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'online':
      return <Badge variant="green">En ligne</Badge>;
    case 'in_game':
      return <Badge variant="blue">En jeu</Badge>;
    case 'updating':
      return <Badge variant="purple">Mise à jour</Badge>;
    case 'offline':
    default:
      return <Badge variant="gray">Hors ligne</Badge>;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'online':
      return 'text-green-400';
    case 'in_game':
      return 'text-blue-400';
    case 'updating':
      return 'text-purple-400';
    default:
      return 'text-gray-400';
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case 'online':
      return 'bg-green-400/10';
    case 'in_game':
      return 'bg-blue-400/10';
    case 'updating':
      return 'bg-purple-400/10';
    default:
      return 'bg-gray-400/10';
  }
}

function getStripe(status: string): string {
  switch (status) {
    case 'online':
      return 'bg-green-500/70';
    case 'in_game':
      return 'bg-blue-500/70';
    case 'updating':
      return 'bg-purple-500/70';
    default:
      return 'bg-dark-600';
  }
}
