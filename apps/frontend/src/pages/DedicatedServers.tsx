import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { PageTransition } from '../components/PageTransition';
import { dedicatedServersApi, type DedicatedServer } from '../services/dedicatedServers';
import { sessionsApi } from '../services/sessions';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, Label } from '../components/ui/Input';
import { findTrackName } from '../utils/track';
import { useContentLabelMap } from '../services/contentLabels';
import {
  Server,
  Plus,
  Send,
  Pencil,
  Trash2,
  Globe,
  Cpu,
  Lock,
  Radio,
  Play,
  Square,
  Car,
  MapPin,
  Users,
  Rows3,
  Calendar,
} from 'lucide-react';

function findTrackPreview(trackAcId: string, content: unknown): string | undefined {
  const tracks = (content as { tracks?: { acId: string; preview?: string }[] } | undefined)?.tracks;
  return tracks?.find((t) => t.acId === trackAcId)?.preview;
}

function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })} ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

const STATUS_VARIANT: Record<
  DedicatedServer['status'],
  {
    border: string;
    bg: string;
    bar: string;
    dot: string;
    label: string;
    labelColor: string;
    pulse?: boolean;
  }
> = {
  running: {
    border: 'border-racing-cyan/25',
    bg: 'bg-gradient-to-r from-racing-blue/[0.11] to-dark-900/50',
    bar: 'bg-gradient-to-b from-racing-blue to-racing-cyan',
    dot: 'bg-emerald-400 shadow-[0_0_8px_#24d17e]',
    label: 'En cours',
    labelColor: 'text-emerald-300',
    pulse: true,
  },
  starting: {
    border: 'border-yellow-500/25',
    bg: 'bg-gradient-to-r from-yellow-500/[0.09] to-dark-900/50',
    bar: 'bg-yellow-400',
    dot: 'bg-yellow-400 shadow-[0_0_8px_#facc15]',
    label: 'Démarrage',
    labelColor: 'text-yellow-300',
    pulse: true,
  },
  error: {
    border: 'border-red-500/25',
    bg: 'bg-gradient-to-r from-red-500/[0.09] to-dark-900/50',
    bar: 'bg-red-400',
    dot: 'bg-red-400 shadow-[0_0_8px_#ff3333]',
    label: 'Erreur',
    labelColor: 'text-red-300',
  },
  stopped: {
    border: 'border-white/[0.06]',
    bg: 'bg-dark-900/45',
    bar: 'bg-gray-600',
    dot: 'bg-gray-500',
    label: 'Arrêté',
    labelColor: 'text-gray-400',
  },
};

export function DedicatedServers() {
  const queryClient = useQueryClient();
  const labelMap = useContentLabelMap();
  const { data: servers, isLoading } = useQuery({
    queryKey: ['dedicated-servers'],
    queryFn: dedicatedServersApi.getAll,
    refetchInterval: 5000,
  });
  const { data: sessions } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: sessionsApi.getActive,
    refetchInterval: 10000,
  });

  const [editingServer, setEditingServer] = useState<DedicatedServer | null>(null);

  const serverOccupancy = useMemo(() => {
    const map = new Map<string, number>();
    (sessions ?? []).forEach((s) => {
      if (!s.serverId) return;
      map.set(s.serverId, (map.get(s.serverId) ?? 0) + 1);
    });
    return map;
  }, [sessions]);

  const runningCount = servers?.filter((s) => s.status === 'running').length ?? 0;
  const occupiedSlots = useMemo(
    () => (servers ?? []).reduce((sum, s) => sum + (serverOccupancy.get(s.id) ?? 0), 0),
    [servers, serverOccupancy],
  );
  const totalSlots = useMemo(
    () => (servers ?? []).reduce((sum, s) => sum + (s.status === 'running' ? s.maxClients : 0), 0),
    [servers],
  );

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
    <PageTransition>
      <div className="space-y-6">
        {/* HERO */}
        <div className="flex flex-wrap items-end gap-6">
          <div className="min-w-[260px] flex-1">
            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="h-[5px] w-[5px] flex-none rotate-45 bg-racing-cyan shadow-[0_0_8px_#00c2ff]" />
              <span className="whitespace-nowrap font-hud text-xs font-semibold uppercase tracking-[0.16em] text-racing-cyan">
                Agents détectés
              </span>
            </div>
            <h1 className="font-hud text-[clamp(34px,4.4vw,48px)] font-bold leading-none tracking-tight text-white">
              Serveurs{' '}
              <span className="bg-gradient-to-r from-racing-blue to-racing-cyan bg-clip-text text-transparent">
                dédiés
              </span>
            </h1>
            <p className="mt-2.5 font-hud-mono text-xs text-gray-500">
              Créer et gérer les serveurs Assetto Corsa depuis les agents détectés
            </p>
          </div>
          <Link
            to="/dedicated-servers/create"
            className="flex items-center gap-2 whitespace-nowrap rounded-md bg-gradient-to-r from-racing-blue to-racing-cyan px-5 py-2.5 font-hud text-sm font-bold tracking-wide text-dark-950 shadow-[0_0_26px_rgba(0,120,255,0.3)] transition-shadow hover:shadow-[0_0_36px_rgba(0,150,255,0.5)]"
          >
            <Plus className="h-4 w-4" />
            Nouveau serveur
          </Link>
        </div>

        {/* COMPTEURS */}
        <div className="grid grid-cols-3 border-y border-white/10 py-4">
          <CounterStat icon={Rows3} label="Serveurs" value={servers?.length ?? 0} />
          <CounterStat
            icon={Play}
            label="En cours"
            value={runningCount}
            valueColor="text-emerald-400"
            bordered
          />
          <CounterStat
            icon={Users}
            label="Slots occupés"
            value={occupiedSlots}
            suffix={`/${totalSlots}`}
            bordered
          />
        </div>

        {isLoading ? (
          <p className="text-gray-500">Chargement...</p>
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
              {servers?.map((server) => {
                const preview = findTrackPreview(server.track, server.station.content);
                const trackName = findTrackName(
                  server.track,
                  server.station.content as
                    | { tracks?: { acId: string; name: string }[] }
                    | undefined,
                  labelMap,
                );
                const v = STATUS_VARIANT[server.status];
                const occupied = serverOccupancy.get(server.id) ?? 0;
                return (
                  <motion.div
                    key={server.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }}
                    className={`relative overflow-hidden rounded-lg border p-4 ${v.border} ${v.bg}`}
                  >
                    <span className={`absolute inset-y-0 left-0 w-[3px] ${v.bar}`} />
                    {server.status === 'running' && (
                      <span className="absolute right-2 top-2 h-3.5 w-3.5 border-r border-t border-racing-cyan/45" />
                    )}

                    <div className="flex flex-col gap-4 pl-2.5 md:flex-row md:items-stretch">
                      {preview ? (
                        <img
                          src={preview}
                          alt={trackName}
                          className="hidden aspect-video w-40 shrink-0 rounded-md border border-white/10 object-cover sm:block"
                          loading="lazy"
                        />
                      ) : (
                        <div className="hidden aspect-video w-40 shrink-0 items-center justify-center rounded-md border border-white/10 bg-dark-900/70 sm:flex">
                          <Server className="h-7 w-7 text-gray-600" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="truncate font-hud text-2xl font-bold tracking-wide text-white">
                            {server.name}
                          </h3>
                          <span
                            className={`flex flex-none items-center gap-1.5 whitespace-nowrap rounded border px-2.5 py-1 font-hud text-[13px] font-bold ${v.labelColor} ${
                              server.status === 'running'
                                ? 'border-emerald-500/40 bg-emerald-500/10'
                                : 'border-white/10'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${v.dot} ${v.pulse ? 'animate-pulse-glow' : ''}`}
                            />
                            {v.label}
                          </span>
                        </div>
                        <p className="font-hud-mono text-xs text-sky-200/60">
                          {server.station.localIp ?? '127.0.0.1'}:{server.tcpPort ?? 9600}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 font-hud text-sm font-semibold text-gray-300">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-racing-cyan" />
                            {trackName}
                            {server.trackLayout ? ` (${server.trackLayout})` : ''}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Cpu className="h-3.5 w-3.5 text-racing-cyan" />
                            {server.station.name}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Car className="h-3.5 w-3.5 text-racing-cyan" />
                            {server.cars.length} voiture{server.cars.length > 1 ? 's' : ''}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-racing-cyan" />
                            {occupied} / {server.maxClients} slots
                          </span>
                          <span className="flex items-center gap-1.5 text-gray-500">
                            <Calendar className="h-3.5 w-3.5 text-racing-cyan" />
                            Créé le {formatCreatedAt(server.createdAt)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          <PortChip label="TCP" value={server.tcpPort ?? 9600} />
                          {server.udpPort != null && (
                            <PortChip label="UDP" value={server.udpPort} />
                          )}
                          {server.httpPort != null && (
                            <PortChip label="HTTP" value={server.httpPort} />
                          )}
                          {server.password && (
                            <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 font-hud-mono text-[10px] text-gray-400">
                              <Lock className="h-3 w-3 text-gray-600" />
                              {server.password}
                            </span>
                          )}
                          {server.rconPassword && (
                            <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 font-hud-mono text-[10px] text-gray-400">
                              <Radio className="h-3 w-3 text-gray-600" />
                              {server.rconPassword}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2 md:min-w-[190px] md:flex-col md:items-stretch md:justify-center">
                        {server.status === 'running' ? (
                          <Link
                            to={`/dedicated-servers/${server.id}/join`}
                            className="flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-gradient-to-r from-racing-blue to-racing-cyan px-4 font-hud text-sm font-bold tracking-wide text-dark-950 shadow-[0_0_20px_rgba(0,120,255,0.28)] transition-shadow hover:shadow-[0_0_30px_rgba(0,150,255,0.5)]"
                          >
                            <Send className="h-4 w-4" />
                            Envoyer les POD
                          </Link>
                        ) : (
                          <span className="flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-white/[0.07] px-4 font-hud text-sm font-bold text-gray-600">
                            <Send className="h-4 w-4" />
                            Envoyer les POD
                          </span>
                        )}
                        {server.status === 'running' ? (
                          <button
                            type="button"
                            onClick={() => stopMutation.mutate(server.id)}
                            disabled={stopMutation.isPending}
                            className="flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-red-500/40 px-4 font-hud text-sm font-bold text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                          >
                            <Square className="h-4 w-4" />
                            Arrêter
                          </button>
                        ) : (
                          <span className="flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-emerald-500/40 px-4 font-hud text-sm font-bold text-emerald-300">
                            <Play className="h-4 w-4" />
                            Démarrer
                          </span>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingServer(server)}
                            className="flex-1 rounded-md border border-white/10 p-2 text-gray-400 transition-colors hover:border-racing-cyan/40 hover:text-sky-200 active:scale-95"
                            title="Modifier"
                          >
                            <Pencil className="mx-auto h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Supprimer ce serveur ?')) {
                                deleteMutation.mutate(server.id);
                              }
                            }}
                            className="flex-1 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-red-300 transition-colors hover:bg-red-500/20 active:scale-95"
                            title="Supprimer"
                          >
                            <Trash2 className="mx-auto h-4 w-4" />
                          </button>
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
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16">
            <Globe className="mb-4 h-14 w-14 text-gray-600" />
            <h3 className="mb-2 font-hud text-lg font-bold text-white">Aucun serveur</h3>
            <p className="mb-6 max-w-md text-center text-sm text-gray-400">
              Crée ton premier serveur dédié en sélectionnant un agent détecté et son contenu
              Assetto Corsa.
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
      </div>
    </PageTransition>
  );
}

function CounterStat({
  icon: Icon,
  label,
  value,
  suffix,
  valueColor = 'text-white',
  bordered,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  suffix?: string;
  valueColor?: string;
  bordered?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col px-4 first:pl-0 ${bordered ? 'border-l border-white/10' : ''}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 flex-none text-racing-cyan" />
        <span className="whitespace-nowrap font-hud text-[11.5px] font-semibold tracking-wide text-gray-400">
          {label}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={`font-hud text-3xl font-bold leading-none ${valueColor}`}>{value}</span>
        {suffix && <span className="font-hud text-base font-semibold text-gray-600">{suffix}</span>}
      </div>
    </div>
  );
}

function PortChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 font-hud-mono text-[10px] text-gray-400">
      <span className="text-gray-600">{label}</span>
      {value}
    </span>
  );
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
