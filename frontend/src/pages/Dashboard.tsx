import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { stationsApi, sessionConfigsApi, sessionsApi } from '../services/api';
import { Station, SimSession, SessionConfig } from '../types';
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

export default function Dashboard() {
  const [stations, setStations] = useState<Station[]>([]);
  const [configs, setConfigs] = useState<SessionConfig[]>([]);
  const [sessions, setSessions] = useState<SimSession[]>([]);

  useEffect(() => {
    loadData();

    const socket = io('/');
    socket.on('station:updated', (data) => {
      setStations((prev) => prev.map((s) => (s.id === data.id ? { ...s, ...data } : s)));
    });
    socket.on('session:updated', () => {
      sessionsApi.getAll().then(setSessions);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const loadData = () => {
    stationsApi.getAll().then(setStations);
    sessionConfigsApi.getAll().then(setConfigs);
    sessionsApi.getAll().then(setSessions);
  };

  const onlineStations = stations.filter((s) => s.status === 'online' || s.status === 'in_use').length;
  const activeSessions = sessions.filter((s) => s.status === 'running' || s.status === 'starting').length;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Dashboard technique</h1>

      <div className="grid md:grid-cols-4 gap-6">
        <div className="card">
          <p className="text-gray-400 text-sm">Postes en ligne</p>
          <p className="text-3xl font-bold text-accent-orange">
            {onlineStations}/{stations.length}
          </p>
        </div>
        <div className="card">
          <p className="text-gray-400 text-sm">Sessions actives</p>
          <p className="text-3xl font-bold text-accent-blue">{activeSessions}</p>
        </div>
        <div className="card">
          <p className="text-gray-400 text-sm">Configurations</p>
          <p className="text-3xl font-bold text-green-400">{configs.length}</p>
        </div>
        <div className="card">
          <p className="text-gray-400 text-sm">Sessions totales</p>
          <p className="text-3xl font-bold text-purple-400">{sessions.length}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Link to="/stations" className="card hover:border-accent-orange transition-colors">
          <h3 className="text-lg font-bold mb-2">Contrôle des postes</h3>
          <p className="text-gray-400">Lancer, arrêter et monitorer les simulateurs</p>
        </Link>
        <Link to="/configs" className="card hover:border-accent-orange transition-colors">
          <h3 className="text-lg font-bold mb-2">Configurations de session</h3>
          <p className="text-gray-400">Gérer les presets voiture/circuit/météo</p>
        </Link>
        <Link to="/leaderboard" className="card hover:border-accent-orange transition-colors">
          <h3 className="text-lg font-bold mb-2">Classement</h3>
          <p className="text-gray-400">Temps au tour et résultats par config</p>
        </Link>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold mb-4">État des postes</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {stations.map((station) => (
            <div key={station.id} className="bg-dark-900 rounded-md p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold">{station.name}</h3>
                <span className={`badge ${statusClasses[station.status]}`}>
                  {statusLabels[station.status]}
                </span>
              </div>
              <p className="text-sm text-gray-400">ID: {station.pc_identifier}</p>
              {station.config && (
                <p className="text-sm text-gray-400">GPU: {(station.config as any).gpu}</p>
              )}
              {station.active_servers && station.active_servers.length > 0 && (
                <div className="mt-3 pt-3 border-t border-dark-700">
                  <p className="text-xs font-semibold text-accent-orange mb-2">
                    Serveur{station.active_servers.length > 1 ? 's' : ''} actif
                    {station.active_servers.length > 1 ? 's' : ''}
                  </p>
                  <div className="space-y-2">
                    {station.active_servers.map((server) => (
                      <div key={server.pid} className="bg-dark-800 rounded p-2 text-sm">
                        <div className="font-medium truncate" title={server.name}>
                          {server.name}
                        </div>
                        <div className="text-gray-400 text-xs">
                          {server.track}
                          {server.trackLayout ? ` (${server.trackLayout})` : ''}
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>
                            {server.cars.slice(0, 3).join(', ')}
                            {server.cars.length > 3 ? ` +${server.cars.length - 3}` : ''}
                          </span>
                          <span>
                            {server.playerCount}
                            {server.maxClients ? ` / ${server.maxClients}` : ''} pilotes
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
