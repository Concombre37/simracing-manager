import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  dedicatedServersApi,
  type DedicatedServer,
  type Car as AcCar,
} from '../services/dedicatedServers';
import { stationsApi, type Station } from '../services/stations';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input, Label } from '../components/ui/Input';
import { CreateServerModal } from '../components/CreateServerModal';
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
} from 'lucide-react';

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

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<DedicatedServer | null>(null);
  const [joiningServer, setJoiningServer] = useState<DedicatedServer | null>(null);

  const createMutation = useMutation({
    mutationFn: dedicatedServersApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dedicated-servers'] });
      setIsCreateOpen(false);
    },
  });

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white mb-1">Serveurs dédiés</h2>
          <p className="text-gray-400">
            Créer et gérer les serveurs Assetto Corsa depuis les agents détectés
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          Nouveau serveur
        </Button>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {servers?.map((server) => (
            <Card key={server.id} className="flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent-orange/10 rounded-lg">
                    <Server className="w-5 h-5 text-accent-orange" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{server.name}</h3>
                    <p className="text-xs text-gray-500 font-mono">
                      {server.station.localIp ?? '127.0.0.1'}:{server.tcpPort ?? 9600}
                      {server.httpPort && server.httpPort !== 8081
                        ? ` (http ${server.httpPort})`
                        : ''}
                    </p>
                  </div>
                </div>
                <StatusBadge status={server.status} />
              </div>

              <div className="space-y-2 text-sm mb-4">
                <div className="flex items-center gap-2 text-gray-400">
                  <Cpu className="w-4 h-4 text-gray-500" />
                  <span>Agent : {server.station.name}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <span>
                    Circuit :{' '}
                    {findTrackName(
                      server.track,
                      server.station.content as
                        | { tracks?: { acId: string; name: string }[] }
                        | undefined,
                    )}
                    {server.trackLayout ? ` (${server.trackLayout})` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <Car className="w-4 h-4 text-gray-500" />
                  <span>Voitures : {server.cars.length}</span>
                </div>
                {server.password && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Lock className="w-4 h-4 text-gray-500" />
                    <span>Mot de passe : {server.password}</span>
                  </div>
                )}
                {server.rconPassword && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Radio className="w-4 h-4 text-gray-500" />
                    <span>RCON : {server.rconPassword}</span>
                  </div>
                )}
              </div>

              <div className="mt-auto pt-4 border-t border-dark-600 flex flex-wrap gap-2">
                <Button variant="success" size="sm" onClick={() => setJoiningServer(server)}>
                  <Send className="w-4 h-4" />
                  Envoyer les POD
                </Button>
                {server.status === 'running' ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => stopMutation.mutate(server.id)}
                    isLoading={stopMutation.isPending}
                  >
                    <Square className="w-4 h-4" />
                    Arrêter
                  </Button>
                ) : null}
                <Button variant="secondary" size="sm" onClick={() => setEditingServer(server)}>
                  <Pencil className="w-4 h-4" />
                  Modifier
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  onClick={() => {
                    if (confirm('Supprimer ce serveur ?')) {
                      deleteMutation.mutate(server.id);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {servers?.length === 0 && !isLoading && (
        <Card className="flex flex-col items-center justify-center py-16">
          <Globe className="w-16 h-16 text-gray-600 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Aucun serveur</h3>
          <p className="text-gray-400 text-center max-w-md mb-6">
            Crée ton premier serveur dédié en sélectionnant un agent détecté et son contenu Assetto
            Corsa.
          </p>
          <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Créer un serveur
          </Button>
        </Card>
      )}

      {isCreateOpen && stations && (
        <CreateServerModal
          stations={stations}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
        />
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
          onJoin={async (stationIds, carAcId, durationMinutes) => {
            // eslint-disable-next-line no-console
            console.log('[POD] sending join', {
              serverId: joiningServer.id,
              stationIds,
              carAcId,
              durationMinutes,
            });
            await dedicatedServersApi.join(joiningServer.id, stationIds, carAcId, durationMinutes);
            setJoiningServer(null);
          }}
        />
      )}
    </div>
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

interface JoinServerModalProps {
  server: DedicatedServer;
  stations: Station[];
  onClose: () => void;
  onJoin: (stationIds: string[], carAcId: string, durationMinutes?: number) => void;
}

function JoinServerModal({ server, stations, onClose, onJoin }: JoinServerModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [carAcId, setCarAcId] = useState<string>(server.cars[0] ?? '');
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
    (s) => s.id !== server.stationId && (s.status === 'online' || s.status === 'in_game'),
  );

  const carMap = useMemo(() => {
    const cars = (server.station.content as { cars?: AcCar[] } | undefined)?.cars ?? [];
    return new Map(cars.map((c) => [c.acId, c]));
  }, [server.station.content]);

  const toggleStation = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  async function handleJoin() {
    if (!carAcId || selectedIds.length === 0) return;
    setIsJoining(true);
    setError(null);
    try {
      await onJoin(selectedIds, carAcId, durationMinutes);
      setJoined(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’envoi des POD');
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <Modal title={`Envoyer les POD sur ${server.name}`} onClose={onClose} size="md">
      {joined ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Commande envoyée</h3>
          <p className="text-gray-400 mb-6">
            {selectedIds.length} POD ont reçu l'ordre de rejoindre{' '}
            {server.station.localIp ?? '127.0.0.1'}:{server.tcpPort ?? 9600}
          </p>
          <Button variant="primary" onClick={onClose} className="w-full">
            Fermer
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Sélectionne les stations à envoyer sur{' '}
            <span className="text-accent-orange font-mono">
              {server.station.localIp ?? '127.0.0.1'}:{server.tcpPort ?? 9600}
            </span>
          </p>
          <div>
            <Label>Voiture à attribuer aux POD</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-56 overflow-y-auto p-1">
              {server.cars.map((id) => {
                const car = carMap.get(id);
                const selected = carAcId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setCarAcId(id)}
                    className={`relative text-left rounded-lg border overflow-hidden transition hover:ring-1 hover:ring-accent-orange/50 ${
                      selected
                        ? 'border-accent-orange ring-1 ring-accent-orange'
                        : 'border-dark-600 bg-dark-900'
                    }`}
                  >
                    <div className="aspect-video bg-dark-800 flex items-center justify-center">
                      {car?.preview ? (
                        <img
                          src={car.preview}
                          alt={car?.name ?? id}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Car className="w-8 h-8 text-gray-600" />
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-sm font-medium text-white truncate">{car?.name ?? id}</p>
                      {car?.brand && <p className="text-xs text-gray-500 truncate">{car.brand}</p>}
                    </div>
                    {selected && (
                      <div className="absolute top-2 right-2 bg-accent-orange text-dark-900 rounded-full p-0.5">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Durée sur le serveur</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {durationOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setDurationMinutes(option.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
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
          <div className="max-h-64 overflow-y-auto space-y-2">
            {onlineStations.length === 0 && (
              <p className="text-gray-500 text-center py-4">Aucun POD en ligne</p>
            )}
            {onlineStations.map((station) => (
              <label
                key={station.stationId}
                className="flex items-center gap-3 p-3 bg-dark-900 border border-dark-600 rounded-lg hover:border-dark-500 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(station.stationId)}
                  onChange={() => toggleStation(station.stationId)}
                  className="w-5 h-5 rounded border-dark-600 text-accent-orange focus:ring-accent-orange bg-dark-900"
                />
                <div className="flex-1">
                  <p className="font-medium text-white">{station.name}</p>
                  <p className="text-xs text-gray-500 font-mono">{station.stationId}</p>
                </div>
                <Badge variant={station.status === 'in_game' ? 'blue' : 'green'}>
                  {station.status === 'in_game' ? 'En jeu' : 'En ligne'}
                </Badge>
              </label>
            ))}
          </div>
          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded-lg p-2">
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
              disabled={selectedIds.length === 0 || isJoining}
              isLoading={isJoining}
            >
              <Send className="w-4 h-4" />
              Envoyer {selectedIds.length > 0 && `(${selectedIds.length})`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
