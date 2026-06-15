import { useEffect, useMemo, useState } from 'react';
import { stationsApi, serversApi, carsApi } from '../services/api';
import { DedicatedServer, Station, Car } from '../types';
import io from 'socket.io-client';

const statusLabels: Record<string, string> = {
  creating: 'Création...',
  running: 'En ligne',
  stopped: 'Arrêté',
  error: 'Erreur',
};

const statusClasses: Record<string, string> = {
  creating: 'badge-yellow',
  running: 'badge-green',
  stopped: 'badge-red',
  error: 'badge-red',
};

interface SendState {
  serverId: string;
  stationId: string;
  carId: string;
  loading: boolean;
}

interface SelectableCar {
  id: string;
  ac_id: string;
  name: string;
}

export default function PodControl() {
  const [servers, setServers] = useState<DedicatedServer[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [sending, setSending] = useState<Record<string, SendState>>({});

  useEffect(() => {
    loadData();
    const socket = io('/');
    socket.on('server:updated', () => loadData());
    socket.on('station:updated', () => stationsApi.getAll().then(setStations));
    return () => {
      socket.disconnect();
    };
  }, []);

  const loadData = () => {
    serversApi.getAll().then(setServers);
    stationsApi.getAll().then(setStations);
    carsApi.getAll().then(setCars);
  };

  const onlineServers = useMemo(
    () => servers.filter((s) => s.status === 'running'),
    [servers]
  );

  const podStations = useMemo(
    () => stations.filter((s) => s.status === 'online' || s.status === 'in_use'),
    [stations]
  );

  const getCarName = (acId: string) => {
    const car = cars.find((c) => c.ac_id === acId);
    return car?.name || acId;
  };

  const getAvailableCars = (server: DedicatedServer, stationId: string): SelectableCar[] => {
    const station = stations.find((s) => s.id === stationId);
    const allowed = server.cars || [];

    // Priorité au contenu scanné localement sur le POD
    const scanned = station?.content_data?.cars || [];
    let list: SelectableCar[] = scanned.map((c) => ({
      id: c.acId,
      ac_id: c.acId,
      name: c.name,
    }));

    // Fallback sur la BDD si aucun contenu scanné
    if (list.length === 0) {
      list = cars.map((c) => ({ id: c.id, ac_id: c.ac_id, name: c.name }));
    }

    if (allowed.length > 0) {
      list = list.filter((c) => allowed.includes(c.ac_id));
    }

    return list;
  };

  const handleSend = async (server: DedicatedServer) => {
    const state = sending[server.id];
    if (!state?.stationId || !state?.carId) return;

    setSending((prev) => ({
      ...prev,
      [server.id]: { ...prev[server.id], loading: true },
    }));

    try {
      await serversApi.join(server.id, state.stationId, state.carId);
      setSending((prev) => ({
        ...prev,
        [server.id]: { ...prev[server.id], stationId: '', carId: '', loading: false },
      }));
    } catch (err: any) {
      alert(err.response?.data?.error || err.message);
      setSending((prev) => ({
        ...prev,
        [server.id]: { ...prev[server.id], loading: false },
      }));
    }
  };

  const setServerState = (serverId: string, patch: Partial<SendState>) => {
    setSending((prev) => ({
      ...prev,
      [serverId]: { ...(prev[serverId] || { stationId: '', carId: '', loading: false }), ...patch },
    }));
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Contrôle des PODs</h1>
        <p className="text-gray-400 mt-1">
          Envoie un poste POD sur un serveur dédié AC disponible.
        </p>
      </div>

      {onlineServers.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-lg">Aucun serveur dédié en ligne.</p>
          <p className="text-sm text-gray-500 mt-2">
            Crée ou démarre un serveur depuis la page Serveurs pour voir apparaître les actions ici.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {onlineServers.map((server) => {
            const state = sending[server.id] || { stationId: '', carId: '', loading: false };
            const allowedCars = server.cars || [];
            const availableCars = getAvailableCars(server, state.stationId);
            const selectedStation = stations.find((s) => s.id === state.stationId);

            return (
              <div key={server.id} className="card space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold">{server.name}</h2>
                    <p className="text-sm text-gray-400">
                      Hôte : {server.station_name || server.station_id}
                    </p>
                  </div>
                  <span className={`badge ${statusClasses[server.status]}`}>
                    {statusLabels[server.status]}
                  </span>
                </div>

                <div className="text-sm text-gray-400 space-y-1">
                  <p>Circuit : {server.track}{server.track_layout ? ` (${server.track_layout})` : ''}</p>
                  <p>
                    Voitures : {allowedCars.length > 0
                      ? allowedCars.map((c) => getCarName(c)).join(', ')
                      : 'Toutes'}
                  </p>
                  <p>Max pilotes : {server.max_clients}</p>
                </div>

                <div className="space-y-3 pt-2 border-t border-dark-600">
                  <select
                    className="input w-full"
                    value={state.stationId}
                    onChange={(e) => setServerState(server.id, { stationId: e.target.value, carId: '' })}
                  >
                    <option value="">Choisir un POD</option>
                    {podStations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.pc_identifier}) {s.local_ip ? `- ${s.local_ip}` : ''}
                      </option>
                    ))}
                  </select>

                  {selectedStation && !selectedStation.content_data?.cars && (
                    <p className="text-xs text-yellow-400">
                      Contenu AC du POD non scanné : fallback sur la liste globale.
                    </p>
                  )}

                  <select
                    className="input w-full"
                    value={state.carId}
                    onChange={(e) => setServerState(server.id, { carId: e.target.value })}
                    disabled={!state.stationId || availableCars.length === 0}
                  >
                    <option value="">
                      {availableCars.length === 0
                        ? state.stationId
                          ? 'Aucune voiture disponible'
                          : 'Choisir une voiture'
                        : 'Choisir une voiture'}
                    </option>
                    {availableCars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <button
                    className="btn btn-primary w-full"
                    disabled={!state.stationId || !state.carId || state.loading}
                    onClick={() => handleSend(server)}
                  >
                    {state.loading ? 'Envoi en cours...' : 'Envoyer le POD'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
