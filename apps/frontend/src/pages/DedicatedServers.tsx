import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { dedicatedServersApi, type DedicatedServer } from '../services/dedicatedServers';
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
  Globe,
  Cpu,
  Lock,
  Radio,
  Square,
  Car,
  MapPin,
  Users,
} from 'lucide-react';

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

  const [editingServer, setEditingServer] = useState<DedicatedServer | null>(null);

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
                        <Link to={`/dedicated-servers/${server.id}/join`}>
                          <Button variant="success" size="sm" className="w-full">
                            <Send className="h-4 w-4" />
                            Envoyer les POD
                          </Button>
                        </Link>
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
