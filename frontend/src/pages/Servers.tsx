import { useEffect, useState } from 'react';
import { stationsApi, serversApi, tracksApi } from '../services/api';
import { DedicatedServer, Station, Track } from '../types';
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

export default function Servers() {
  const [servers, setServers] = useState<DedicatedServer[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    stationId: '',
    name: '',
    track: '',
    trackLayout: '',
    cars: '',
    maxClients: 10,
    password: '',
  });

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
    tracksApi.getAll().then(setTracks);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.stationId || !form.name || !form.track) return;
    setLoading(true);
    try {
      await serversApi.create({
        stationId: form.stationId,
        name: form.name,
        track: form.track,
        cars: form.cars.split(',').map((c) => c.trim()).filter(Boolean),
        track_layout: form.trackLayout,
        max_clients: form.maxClients,
        password: form.password,
      });
      setForm({ stationId: '', name: '', track: '', trackLayout: '', cars: '', maxClients: 10, password: '' });
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Serveurs dédiés</h1>

      <div className="card">
        <h2 className="text-xl font-bold mb-4">Créer un serveur</h2>
        <form onSubmit={handleCreate} className="grid md:grid-cols-2 gap-4">
          <select
            className="input"
            value={form.stationId}
            onChange={(e) => setForm({ ...form, stationId: e.target.value })}
            required
          >
            <option value="">Choisir un poste</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.pc_identifier})
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Nom du serveur"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <select
            className="input"
            value={form.track}
            onChange={(e) => setForm({ ...form, track: e.target.value })}
            required
          >
            <option value="">Choisir un circuit</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.ac_id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Layout (optionnel)"
            value={form.trackLayout}
            onChange={(e) => setForm({ ...form, trackLayout: e.target.value })}
          />
          <input
            className="input"
            placeholder="Voitures (ex: ks_mazda_mx5_cup, ks_bmw_m4)"
            value={form.cars}
            onChange={(e) => setForm({ ...form, cars: e.target.value })}
          />
          <input
            className="input"
            type="number"
            min={1}
            max={64}
            placeholder="Nombre max de pilotes"
            value={form.maxClients}
            onChange={(e) => setForm({ ...form, maxClients: parseInt(e.target.value) || 10 })}
          />
          <input
            className="input"
            placeholder="Mot de passe (optionnel)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Création...' : 'Lancer le serveur'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold mb-4">Serveurs existants</h2>
        {servers.length === 0 ? (
          <p className="text-gray-400">Aucun serveur créé.</p>
        ) : (
          <div className="space-y-4">
            {servers.map((server) => (
              <div key={server.id} className="bg-dark-900 rounded-md p-4 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold">{server.name}</h3>
                    <span className={`badge ${statusClasses[server.status]}`}>
                      {statusLabels[server.status]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">
                    Poste: {server.station_name || server.station_id} · Circuit: {server.track}
                    {server.track_layout ? ` (${server.track_layout})` : ''}
                  </p>
                  <p className="text-sm text-gray-400">
                    Voitures: {server.cars?.join(', ') || '-'} · Max: {server.max_clients}
                  </p>
                </div>
                <div className="flex gap-2">
                  {server.status === 'running' && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => serversApi.stop(server.id).then(loadData)}
                    >
                      Arrêter
                    </button>
                  )}
                  <button
                    className="btn btn-danger"
                    onClick={() => serversApi.delete(server.id).then(loadData)}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
