import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  dedicatedServersApi,
  type DedicatedServer,
  type Car as AcCar,
} from '../services/dedicatedServers';
import { stationsApi, type Station } from '../services/stations';
import { PageShell } from '../components/ui/PageShell';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input, Label } from '../components/ui/Input';
import { findTrackName } from '../utils/track';
import {
  Server,
  Plus,
  Send,
  Pencil,
  Trash2,
  Check,
  Globe,
  Cpu,
  Lock,
  Radio,
  Square,
  Car,
  MapPin,
  User,
  Users,
  Zap,
} from 'lucide-react';
const DIFFICULTY_OPTIONS = {
  EASY: 'EASY' as const,
  PRO: 'PRO' as const,
  CUSTOM: 'CUSTOM' as const,
};

function findTrackPreview(trackAcId: string, content: unknown): string | undefined {
  const tracks = (content as { tracks?: { acId: string; preview?: string }[] } | undefined)?.tracks;
  return tracks?.find((t) => t.acId === trackAcId)?.preview;
}

export function DedicatedServers() {
  const queryClient = useQueryClient();
  const { data: servers, isLoading } = useQuery({
    queryKey: ['dedicated-servers'],
    queryFn: dedicatedServersApi.getAll,
  });
  const { data: stations } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
  });

  const [editingServer, setEditingServer] = useState<DedicatedServer | null>(null);
  const [joiningServer, setJoiningServer] = useState<DedicatedServer | null>(null);

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Parameters<typeof dedicatedServersApi.update>[1];
    }) => dedicatedServersApi.update(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dedicated-servers'] });
      setEditingServer(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: dedicatedServersApi.remove,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['dedicated-servers'] }),
  });

  const stopMutation = useMutation({
    mutationFn: dedicatedServersApi.stop,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['dedicated-servers'] }),
  });

  return (
    <PageShell
      title="Serveurs"
      accent="dédiés"
      subtitle="Créer et gérer les serveurs Assetto Corsa depuis les agents détectés"
      actions={
        <Link to="/dedicated-servers/create">
          <Button variant="primary" size="lg" className="shadow-glow-orange">
            <Plus className="h-4 w-4" />
            Nouveau serveur
          </Button>
        </Link>
      }
    >
      {isLoading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {servers?.map((server) => {
              const preview = findTrackPreview(server.track, server.station.content);
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
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }}
                >
                  <div className="relative overflow-hidden rounded-xl border border-dark-600 bg-dark-800/70 backdrop-blur-sm transition-colors hover:border-dark-500">
                    <span
                      className={`absolute bottom-0 left-0 top-0 w-1 ${getStripe(server.status)}`}
                    />

                    <div className="flex flex-col gap-4 p-4 pl-6 md:flex-row md:items-center">
                      {/* Vignette circuit */}
                      {preview ? (
                        <img
                          src={preview}
                          alt={trackName}
                          className="hidden aspect-video w-36 shrink-0 rounded-lg border border-dark-700 object-cover sm:block"
                          loading="lazy"
                        />
                      ) : (
                        <div className="hidden aspect-video w-36 shrink-0 items-center justify-center rounded-lg border border-dark-700 bg-dark-900/70 sm:flex">
                          <Server className="h-7 w-7 text-gray-600" />
                        </div>
                      )}

                      {/* Informations essentielles */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="truncate text-lg font-bold text-white">{server.name}</h3>
                          <StatusBadge status={server.status} />
                        </div>
                        <p className="font-mono text-xs text-gray-500">
                          {server.station.localIp ?? '127.0.0.1'}:{server.tcpPort ?? 9600}
                        </p>
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-gray-500" />
                            {trackName}
                            {server.trackLayout ? ` (${server.trackLayout})` : ''}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Cpu className="h-3.5 w-3.5 text-gray-500" />
                            {server.station.name}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Car className="h-3.5 w-3.5 text-gray-500" />
                            {server.cars.length} voiture{server.cars.length > 1 ? 's' : ''}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-gray-500" />
                            {server.maxClients} slots
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <PortChip label="TCP" value={server.tcpPort ?? 9600} />
                          {server.udpPort != null && (
                            <PortChip label="UDP" value={server.udpPort} />
                          )}
                          {server.httpPort != null && (
                            <PortChip label="HTTP" value={server.httpPort} />
                          )}
                          {server.password && (
                            <span className="inline-flex items-center gap-1 rounded border border-dark-600 bg-dark-900/70 px-2 py-0.5 font-mono text-[10px] text-gray-400">
                              <Lock className="h-3 w-3 text-gray-600" />
                              {server.password}
                            </span>
                          )}
                          {server.rconPassword && (
                            <span className="inline-flex items-center gap-1 rounded border border-dark-600 bg-dark-900/70 px-2 py-0.5 font-mono text-[10px] text-gray-400">
                              <Radio className="h-3 w-3 text-gray-600" />
                              {server.rconPassword}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions : envoi / arrêt / gestion clairement séparés */}
                      <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-col md:items-stretch">
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => setJoiningServer(server)}
                        >
                          <Send className="h-4 w-4" />
                          Envoyer les POD
                        </Button>
                        {server.status === 'running' && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => stopMutation.mutate(server.id)}
                            isLoading={stopMutation.isPending}
                          >
                            <Square className="h-4 w-4" />
                            Arrêter
                          </Button>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingServer(server)}
                            className="flex-1 rounded-lg border border-dark-600 bg-dark-900/60 p-2 text-gray-400 transition-colors hover:border-dark-500 hover:text-white active:scale-95"
                            title="Modifier"
                          >
                            <Pencil className="mx-auto h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Supprimer ce serveur ?')) {
                                deleteMutation.mutate(server.id);
                              }
                            }}
                            className="flex-1 rounded-lg border border-red-900/60 bg-red-900/20 p-2 text-red-400 transition-colors hover:bg-red-900/40 hover:text-red-300 active:scale-95"
                            title="Supprimer"
                          >
                            <Trash2 className="mx-auto h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {servers?.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dark-600 bg-dark-800/70 py-16">
          <Globe className="mb-4 h-14 w-14 text-gray-600" />
          <h3 className="mb-2 text-lg font-semibold text-white">Aucun serveur</h3>
          <p className="mb-6 max-w-md text-center text-sm text-gray-400">
            Crée ton premier serveur dédié en sélectionnant un agent détecté et son contenu Assetto
            Corsa.
          </p>
          <Link to="/dedicated-servers/create">
            <Button variant="primary">
              <Plus className="h-4 w-4" />
              Créer un serveur
            </Button>
          </Link>
        </div>
      )}

      {editingServer && (
        <ServerFormModal
          title="Modifier le serveur"
          server={editingServer}
          onClose={() => setEditingServer(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editingServer.id, data })}
          isSubmitting={updateMutation.isPending}
        />
      )}

      {joiningServer && stations && (
        <JoinServerModal
          server={joiningServer}
          stations={stations}
          onClose={() => setJoiningServer(null)}
          onJoin={async (pods, durationMinutes) => {
            await dedicatedServersApi.join(joiningServer.id, pods, durationMinutes);
            setJoiningServer(null);
          }}
        />
      )}
    </PageShell>
  );
}

function PortChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-dark-600 bg-dark-900/70 px-2 py-0.5 font-mono text-[10px] text-gray-400">
      <span className="text-gray-600">{label}</span>
      {value}
    </span>
  );
}

function StatusBadge({ status }: { status: DedicatedServer['status'] }) {
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

function getStripe(status: DedicatedServer['status']): string {
  switch (status) {
    case 'running':
      return 'bg-green-500/70';
    case 'starting':
      return 'bg-yellow-500/70';
    case 'error':
      return 'bg-red-500/70';
    default:
      return 'bg-dark-600';
  }
}

interface ServerFormModalProps {
  title: string;
  server: DedicatedServer;
  onClose: () => void;
  onSubmit: (data: {
    name?: string;
    password?: string;
    rconPassword?: string;
    maxClients?: number;
  }) => void;
  isSubmitting: boolean;
}

function ServerFormModal({ title, server, onClose, onSubmit, isSubmitting }: ServerFormModalProps) {
  const [name, setName] = useState(server.name);
  const [password, setPassword] = useState(server.password ?? '');
  const [rconPassword, setRconPassword] = useState(server.rconPassword ?? '');
  const [maxClients, setMaxClients] = useState(server.maxClients);

  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            name,
            maxClients,
            ...(password && { password }),
            ...(rconPassword && { rconPassword }),
          });
        }}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="edit-name">Nom</Label>
          <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="edit-maxClients">Max clients</Label>
          <Input
            id="edit-maxClients"
            type="number"
            min={1}
            max={64}
            value={maxClients}
            onChange={(e) => setMaxClients(Number(e.target.value))}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="edit-password">Mot de passe</Label>
            <Input
              id="edit-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-rconPassword">RCON</Label>
            <Input
              id="edit-rconPassword"
              value={rconPassword}
              onChange={(e) => setRconPassword(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface JoinPodConfig {
  stationId: string;
  carAcId: string;
  clientName: string;
  difficulty: 'EASY' | 'PRO' | 'CUSTOM';
  selected: boolean;
}

interface JoinServerModalProps {
  server: DedicatedServer;
  stations: Station[];
  onClose: () => void;
  onJoin: (
    pods: { stationId: string; carAcId: string; clientName?: string; difficulty?: string }[],
    durationMinutes?: number,
  ) => void;
}

function JoinServerModal({ server, stations, onClose, onJoin }: JoinServerModalProps) {
  const [durationMinutes, setDurationMinutes] = useState<number | undefined>(undefined);
  const [joined, setJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const durationOptions = [
    { value: undefined, label: 'Illimité' },
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
    { value: 45, label: '45 min' },
    { value: 60, label: '60 min' },
  ];

  const onlineStations = stations.filter(
    (s) =>
      s.id !== server.stationId &&
      s.role === 'simulator' &&
      (s.status === 'online' || s.status === 'in_game'),
  );

  const carMap = useMemo(() => {
    const cars = (server.station.content as { cars?: AcCar[] } | undefined)?.cars ?? [];
    return new Map(cars.map((c) => [c.acId, c]));
  }, [server.station.content]);

  const [podConfigs, setPodConfigs] = useState<Record<string, JoinPodConfig>>(() => {
    const initial: Record<string, JoinPodConfig> = {};
    const defaultCar = server.cars[0] ?? '';
    for (const station of onlineStations) {
      initial[station.stationId] = {
        stationId: station.stationId,
        carAcId: defaultCar,
        clientName: '',
        difficulty: DIFFICULTY_OPTIONS.PRO,
        selected: false,
      };
    }
    return initial;
  });

  const updatePod = (stationId: string, patch: Partial<JoinPodConfig>) => {
    setPodConfigs((prev) => ({
      ...prev,
      [stationId]: { ...prev[stationId], ...patch },
    }));
  };

  const selectedPods = useMemo(
    () => Object.values(podConfigs).filter((p) => p.selected),
    [podConfigs],
  );

  async function handleJoin() {
    if (selectedPods.length === 0) return;
    setIsJoining(true);
    setError(null);
    try {
      await onJoin(
        selectedPods.map((p) => ({
          stationId: p.stationId,
          carAcId: p.carAcId,
          clientName: p.clientName || undefined,
          difficulty: p.difficulty,
        })),
        durationMinutes,
      );
      setJoined(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’envoi des POD');
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <Modal title={`Envoyer les POD sur ${server.name}`} onClose={onClose} size="lg">
      {joined ? (
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-900/30">
            <Check className="h-8 w-8 text-green-400" />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-white">Commande envoyée</h3>
          <p className="mb-6 text-gray-400">
            {selectedPods.length} POD ont reçu l'ordre de rejoindre{' '}
            {server.station.localIp ?? '127.0.0.1'}:{server.tcpPort ?? 9600}
          </p>
          <Button variant="primary" onClick={onClose} className="w-full">
            Fermer
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-gray-400">
            Configure chaque POD à envoyer sur{' '}
            <span className="font-mono text-accent-orange">
              {server.station.localIp ?? '127.0.0.1'}:{server.tcpPort ?? 9600}
            </span>
          </p>

          <div>
            <Label>Durée sur le serveur</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {durationOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setDurationMinutes(option.value)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    durationMinutes === option.value
                      ? 'bg-accent-orange text-dark-900 shadow-lg shadow-accent-orange/30'
                      : 'bg-dark-700 text-gray-300 hover:bg-dark-600'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {onlineStations.length === 0 && (
              <p className="py-4 text-center text-gray-500">Aucun POD en ligne</p>
            )}
            {onlineStations.map((station) => {
              const config = podConfigs[station.stationId];
              if (!config) return null;
              return (
                <div
                  key={station.stationId}
                  className={`rounded-xl border p-4 transition-colors ${
                    config.selected
                      ? 'border-accent-orange bg-dark-900 ring-1 ring-accent-orange'
                      : 'border-dark-600 bg-dark-800 hover:border-dark-500'
                  }`}
                >
                  <div className="mb-3 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={config.selected}
                      onChange={(e) => updatePod(station.stationId, { selected: e.target.checked })}
                      className="mt-1 h-5 w-5 rounded border-dark-600 bg-dark-900 text-accent-orange focus:ring-accent-orange"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-white">{station.name}</p>
                        <Badge variant={station.status === 'in_game' ? 'blue' : 'green'}>
                          {station.status === 'in_game' ? 'En jeu' : 'En ligne'}
                        </Badge>
                      </div>
                      <p className="font-mono text-xs text-gray-500">{station.stationId}</p>
                    </div>
                  </div>

                  {config.selected && (
                    <div className="grid grid-cols-1 gap-3 pl-8 sm:grid-cols-3">
                      <div>
                        <Label className="text-xs">Nom du client</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                          <input
                            type="text"
                            value={config.clientName}
                            onChange={(e) =>
                              updatePod(station.stationId, { clientName: e.target.value })
                            }
                            placeholder="Client"
                            className="w-full rounded-lg border border-dark-600 bg-dark-900 py-2 pl-9 pr-3 text-white placeholder-gray-600 focus:border-accent-orange focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs">Difficulté</Label>
                        <div className="relative">
                          <Zap className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                          <select
                            value={config.difficulty}
                            onChange={(e) =>
                              updatePod(station.stationId, {
                                difficulty: e.target.value as 'EASY' | 'PRO' | 'CUSTOM',
                              })
                            }
                            className="w-full appearance-none rounded-lg border border-dark-600 bg-dark-900 py-2 pl-9 pr-3 text-white focus:border-accent-orange focus:outline-none"
                          >
                            <option value={DIFFICULTY_OPTIONS.EASY}>Easy</option>
                            <option value={DIFFICULTY_OPTIONS.PRO}>Pro</option>
                            <option value={DIFFICULTY_OPTIONS.CUSTOM}>Custom</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs">Voiture</Label>
                        <div className="relative">
                          <Car className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                          <select
                            value={config.carAcId}
                            onChange={(e) =>
                              updatePod(station.stationId, { carAcId: e.target.value })
                            }
                            className="w-full appearance-none rounded-lg border border-dark-600 bg-dark-900 py-2 pl-9 pr-3 text-white focus:border-accent-orange focus:outline-none"
                          >
                            {server.cars.map((id) => {
                              const car = carMap.get(id);
                              return (
                                <option key={id} value={id}>
                                  {car?.name ?? id}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <p className="rounded-lg border border-red-900/40 bg-red-900/20 p-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isJoining}>
              Annuler
            </Button>
            <Button
              variant="success"
              onClick={handleJoin}
              disabled={selectedPods.length === 0 || isJoining}
              isLoading={isJoining}
            >
              <Send className="h-4 w-4" />
              Envoyer {selectedPods.length > 0 && `(${selectedPods.length})`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
