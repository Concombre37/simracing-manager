import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  dedicatedServersApi,
  type DedicatedServer,
  type Track,
  type Car as AcCar,
} from '../services/dedicatedServers';
import { stationsApi, type Station } from '../services/stations';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input, Label } from '../components/ui/Input';
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
                    Circuit : {server.track}
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
          onJoin={async (stationIds, carAcId) => {
            await dedicatedServersApi.join(joiningServer.id, stationIds, carAcId);
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

interface CreateServerModalProps {
  stations: Station[];
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    stationId: string;
    track: string;
    trackLayout?: string;
    cars: string[];
    maxClients: number;
    password?: string;
    rconPassword?: string;
  }) => void;
  isSubmitting: boolean;
}

function CreateServerModal({ stations, onClose, onSubmit, isSubmitting }: CreateServerModalProps) {
  const [name, setName] = useState('');
  const [stationId, setStationId] = useState('');
  const [trackId, setTrackId] = useState('');
  const [trackLayout, setTrackLayout] = useState('');
  const [selectedCars, setSelectedCars] = useState<string[]>([]);
  const [maxClients, setMaxClients] = useState(10);
  const [password, setPassword] = useState('');
  const [rconPassword, setRconPassword] = useState('');

  const selectedStation = useMemo(
    () => stations.find((s) => s.id === stationId),
    [stations, stationId],
  );

  const content = useMemo<{
    cars: AcCar[];
    tracks: Track[];
  }>(() => {
    if (!selectedStation?.content) return { cars: [], tracks: [] };
    const c = selectedStation.content as { cars?: AcCar[]; tracks?: Track[] };
    return {
      cars: c.cars ?? [],
      tracks: c.tracks ?? [],
    };
  }, [selectedStation]);

  const selectedTrack = useMemo(
    () => content.tracks.find((t) => t.acId === trackId),
    [content.tracks, trackId],
  );

  const onlineStations = stations.filter((s) => s.status === 'online' || s.status === 'in_game');

  function toggleCar(carAcId: string) {
    setSelectedCars((prev) =>
      prev.includes(carAcId) ? prev.filter((c) => c !== carAcId) : [...prev, carAcId],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      stationId,
      track: trackId,
      ...(trackLayout && { trackLayout }),
      cars: selectedCars,
      maxClients,
      ...(password && { password }),
      ...(rconPassword && { rconPassword }),
    });
  }

  return (
    <Modal title="Créer un serveur dédié" onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Nom du serveur</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div>
          <Label htmlFor="station">Agent hôte</Label>
          <select
            id="station"
            value={stationId}
            onChange={(e) => {
              setStationId(e.target.value);
              setTrackId('');
              setTrackLayout('');
              setSelectedCars([]);
            }}
            required
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white focus:border-accent-orange focus:ring-1 focus:ring-accent-orange"
          >
            <option value="">Sélectionner un agent</option>
            {onlineStations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name} ({station.stationId})
              </option>
            ))}
          </select>
          {onlineStations.length === 0 && (
            <p className="text-red-400 text-sm mt-1">Aucun agent en ligne</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="track">Circuit</Label>
            <select
              id="track"
              value={trackId}
              onChange={(e) => {
                setTrackId(e.target.value);
                setTrackLayout('');
              }}
              required
              disabled={!stationId}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white focus:border-accent-orange focus:ring-1 focus:ring-accent-orange disabled:opacity-50"
            >
              <option value="">Choisir un circuit</option>
              {content.tracks.map((track) => (
                <option key={track.acId} value={track.acId}>
                  {track.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="layout">Layout</Label>
            <select
              id="layout"
              value={trackLayout}
              onChange={(e) => setTrackLayout(e.target.value)}
              disabled={!selectedTrack || selectedTrack.layouts.length === 0}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white focus:border-accent-orange focus:ring-1 focus:ring-accent-orange disabled:opacity-50"
            >
              <option value="">Défaut</option>
              {selectedTrack?.layouts.map((layout) => (
                <option key={layout} value={layout}>
                  {layout}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label>Voitures ({selectedCars.length})</Label>
          <div className="max-h-40 overflow-y-auto space-y-1 border border-dark-600 rounded-lg p-2 bg-dark-900">
            {content.cars.length === 0 && (
              <p className="text-gray-500 text-sm">Aucune voiture détectée</p>
            )}
            {content.cars.map((car) => (
              <label
                key={car.acId}
                className="flex items-center gap-2 text-sm text-gray-300 hover:bg-dark-800 p-1 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedCars.includes(car.acId)}
                  onChange={() => toggleCar(car.acId)}
                  className="rounded border-dark-600 text-accent-orange focus:ring-accent-orange bg-dark-900"
                />
                <span className="flex-1">{car.name}</span>
                {car.brand && <span className="text-xs text-gray-500">{car.brand}</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="maxClients">Max clients</Label>
            <Input
              id="maxClients"
              type="number"
              min={1}
              max={64}
              value={maxClients}
              onChange={(e) => setMaxClients(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Mot de passe</Label>
            <Input id="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rconPassword">RCON</Label>
            <Input
              id="rconPassword"
              value={rconPassword}
              onChange={(e) => setRconPassword(e.target.value)}
              placeholder="admin"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            disabled={!stationId || !trackId || selectedCars.length === 0}
          >
            Créer et démarrer
          </Button>
        </div>
      </form>
    </Modal>
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

interface JoinServerModalProps {
  server: DedicatedServer;
  stations: Station[];
  onClose: () => void;
  onJoin: (stationIds: string[], carAcId: string) => void;
}

function JoinServerModal({ server, stations, onClose, onJoin }: JoinServerModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [carAcId, setCarAcId] = useState<string>(server.cars[0] ?? '');
  const [joined, setJoined] = useState(false);

  const onlineStations = stations.filter(
    (s) => s.id !== server.stationId && (s.status === 'online' || s.status === 'in_game'),
  );

  const toggleStation = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  async function handleJoin() {
    if (!carAcId) return;
    await onJoin(selectedIds, carAcId);
    setJoined(true);
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
            <Label htmlFor="join-car">Voiture à attribuer aux POD</Label>
            <select
              id="join-car"
              value={carAcId}
              onChange={(e) => setCarAcId(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white focus:border-accent-orange focus:ring-1 focus:ring-accent-orange"
            >
              {server.cars.map((car) => (
                <option key={car} value={car}>
                  {car}
                </option>
              ))}
            </select>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {onlineStations.length === 0 && (
              <p className="text-gray-500 text-center py-4">Aucun POD en ligne</p>
            )}
            {onlineStations.map((station) => (
              <label
                key={station.id}
                className="flex items-center gap-3 p-3 bg-dark-900 border border-dark-600 rounded-lg hover:border-dark-500 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(station.id)}
                  onChange={() => toggleStation(station.id)}
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
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="success" onClick={handleJoin} disabled={selectedIds.length === 0}>
              <Send className="w-4 h-4" />
              Envoyer {selectedIds.length > 0 && `(${selectedIds.length})`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
