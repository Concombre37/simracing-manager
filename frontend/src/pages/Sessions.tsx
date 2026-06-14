import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sessionsApi } from '../services/api';
import { SimSession } from '../types';

const statusLabels: Record<string, string> = {
  starting: 'Démarrage',
  running: 'En cours',
  paused: 'Pause',
  finished: 'Terminée',
  crashed: 'Crash',
};

export default function Sessions() {
  const [sessions, setSessions] = useState<SimSession[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    sessionsApi.getAll().then(setSessions);
  };

  const stopSession = async (id: string) => {
    try {
      await sessionsApi.stop(id);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erreur');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Historique des sessions</h1>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="text-left border-b border-dark-600">
              <th className="pb-3 text-gray-400 font-medium">Poste</th>
              <th className="pb-3 text-gray-400 font-medium">Config</th>
              <th className="pb-3 text-gray-400 font-medium">Lancé par</th>
              <th className="pb-3 text-gray-400 font-medium">Début</th>
              <th className="pb-3 text-gray-400 font-medium">Statut</th>
              <th className="pb-3 text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-dark-700 last:border-0">
                <td className="py-3">{s.station_name}</td>
                <td className="py-3">{s.config_name}</td>
                <td className="py-3">
                  {s.first_name} {s.last_name}
                </td>
                <td className="py-3">{format(parseISO(s.started_at), 'dd/MM/yy HH:mm')}</td>
                <td className="py-3">
                  <span className={`badge ${
                    s.status === 'running' ? 'badge-blue' :
                    s.status === 'finished' ? 'badge-green' :
                    s.status === 'crashed' ? 'badge-red' : 'badge-yellow'
                  }`}>
                    {statusLabels[s.status]}
                  </span>
                </td>
                <td className="py-3">
                  {s.status === 'running' || s.status === 'starting' ? (
                    <button
                      onClick={() => stopSession(s.id)}
                      className="btn-danger text-sm py-1"
                    >
                      Arrêter
                    </button>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
