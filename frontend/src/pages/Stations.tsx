import { useEffect, useState } from 'react';
import { stationsApi, sessionConfigsApi, sessionsApi } from '../services/api';
import { Station, SessionConfig } from '../types';
import io from 'socket.io-client';

const statusLabels: Record<string, string> = {
  offline: 'Hors ligne',
  online: 'En ligne',
  in_use: 'En cours',
  maintenance: 'Maintenance',
  error: 'Erreur',
};

const statusClasses: Record<string, string> = {
  offline: 'badge-red',
  online: 'badge-green',
  in_use: 'badge-blue',
  maintenance: 'badge-yellow',
  error: 'badge-red',
};

export default function Stations() {
  const [stations, setStations] = useState<Station[]>([]);
  const [configs, setConfigs] = useState<SessionConfig[]>([]);
  const [selectedConfigs, setSelectedConfigs] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();

    const socket = io('/');
    socket.on('station:updated', (data) => {
      setStations((prev) => prev.map((s) => (s.id === data.id ? { ...s, ...data } : s)));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const loadData = () => {
    stationsApi.getAll().then(setStations);
    sessionConfigsApi.getAll().then((configs) => {
      setConfigs(configs);
      const defaultConfig = configs.find((c) => c.is_default);
      if (defaultConfig) {
        setSelectedConfigs((prev) => {
          const next = { ...prev };
          stations.forEach((s) => {
            if (!next[s.id]) next[s.id] = defaultConfig.id;
          });
          return next;
        });
      }
    });
  };

  const handleConfigChange = (stationId: string, configId: string) => {
    setSelectedConfigs({ ...selectedConfigs, [stationId]: configId });
  };

  const launchSession = async (stationId: string) => {
    const configId = selectedConfigs[stationId];
    if (!configId) return;
    try {
      await sessionsApi.start({ stationId, configId });
      alert('Session lancée');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erreur');
    }
  };

  const stopSession = async (sessionId?: string) => {
    if (!sessionId) return;
    try {
      await sessionsApi.stop(sessionId);
      alert('Arrêt demandé');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erreur');
    }
  };

  const setMaintenance = async (stationId: string, status: string) => {
    await stationsApi.update(stationId, { status: status as any });
    loadData();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Contrôle des postes</h1>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stations.map((station) => (
          <div key={station.id} className="card">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold">{station.name}</h3>
              <div className="flex gap-2">
                {station.active_servers && station.active_servers.length > 0 && (
                  <span className="badge badge-green">
                    {station.active_servers.length} serveur(s) ON
                  </span>
                )}
                <span className={`badge ${statusClasses[station.status]}`}>
                  {statusLabels[station.status]}
                </span>
              </div>
            </div>

            <p className="text-sm text-gray-400 mb-2">ID: {station.pc_identifier}</p>

            {station.config && (
              <div className="text-sm text-gray-400 mb-4">
                <p>GPU: {(station.config as any).gpu}</p>
                <p>Volant: {(station.config as any).wheel}</p>
                <p>Écrans: {(station.config as any).screens}</p>
              </div>
            )}

            <div className="mb-4">
              <label className="label text-xs">Configuration</label>
              <select
                className="select text-sm"
                value={selectedConfigs[station.id] || ''}
                onChange={(e) => handleConfigChange(station.id, e.target.value)}
              >
                <option value="">Choisir une config</option>
                {configs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.is_default ? '(défaut)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => launchSession(station.id)}
                disabled={station.status === 'offline' || station.status === 'in_use'}
                className="btn-primary text-sm flex-1 disabled:opacity-50"
              >
                Lancer
              </button>
              <button
                onClick={() => stopSession(station.current_session_id)}
                disabled={station.status !== 'in_use'}
                className="btn-danger text-sm flex-1 disabled:opacity-50"
              >
                Arrêter
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-dark-600 flex justify-between items-center">
              <div>
                <button
                  onClick={() => setMaintenance(station.id, 'maintenance')}
                  className="text-xs text-yellow-400 hover:text-yellow-300 mr-4"
                >
                  Maintenance
                </button>
                <button
                  onClick={() => setMaintenance(station.id, 'online')}
                  className="text-xs text-green-400 hover:text-green-300"
                >
                  En ligne
                </button>
              </div>
              <button
                onClick={async () => {
                  try {
                    await stationsApi.updateAgent(station.id);
                    alert('Mise à jour de l\'agent demandée');
                  } catch (err: any) {
                    alert(err.response?.data?.error || 'Erreur');
                  }
                }}
                disabled={station.status === 'offline'}
                className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                MAJ agent
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
