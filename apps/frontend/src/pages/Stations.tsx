import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { CreateStationModal } from '../components/CreateStationModal';

interface Station {
  id: string;
  stationId: string;
  name: string;
  status: string;
  lastSeenAt: string | null;
  localIp: string | null;
  version: string | null;
}

function fetchStations(): Promise<Station[]> {
  return api.get<Station[]>('/stations').then((res) => res.data);
}

export function Stations() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const socket = useSocket('/');

  const { data, isLoading, error } = useQuery({
    queryKey: ['stations'],
    queryFn: fetchStations,
    refetchInterval: 5000,
  });

  socket?.on('station:updated', ({ stationId, status }) => {
    queryClient.setQueryData<Station[]>(['stations'], (old) =>
      old?.map((s) => (s.stationId === stationId ? { ...s, status } : s)),
    );
  });

  const launchMutation = useMutation({
    mutationFn: (id: string) => api.post(`/stations/${id}/launch`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.post(`/stations/${id}/stop`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
  });

  function sendCommand(stationId: string, command: string) {
    socket?.emit('station:command', { stationId, command });
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Stations</h1>
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
          >
            Create station
          </button>
        </div>
        {isLoading && <p>Loading stations...</p>}
        {error && <p className="text-red-600">Failed to load stations</p>}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data?.map((station) => (
            <div
              key={station.id}
              className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">{station.name}</h2>
                <StatusBadge status={station.status} />
              </div>
              <dl className="mb-6 space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <dt>ID</dt>
                  <dd className="font-mono">{station.stationId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>IP</dt>
                  <dd>{station.localIp ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Version</dt>
                  <dd>{station.version ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Last seen</dt>
                  <dd>
                    {station.lastSeenAt ? new Date(station.lastSeenAt).toLocaleString() : '—'}
                  </dd>
                </div>
              </dl>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => launchMutation.mutate(station.id)}
                  disabled={launchMutation.isPending}
                  className="rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Launch
                </button>
                <button
                  onClick={() => stopMutation.mutate(station.id)}
                  disabled={stopMutation.isPending}
                  className="rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Stop
                </button>
                <button
                  onClick={() => sendCommand(station.stationId, 'idealLine')}
                  className="rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200"
                >
                  Ideal Line
                </button>
                <button
                  onClick={() => sendCommand(station.stationId, 'autoShifter')}
                  className="rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200"
                >
                  Auto Shifter
                </button>
                <button
                  onClick={() => sendCommand(station.stationId, 'teleportToPits')}
                  className="rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200"
                >
                  Pits
                </button>
                <button
                  onClick={() => sendCommand(station.stationId, 'recenterVR')}
                  className="rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200"
                >
                  Recenter VR
                </button>
                <button
                  onClick={() => sendCommand(station.stationId, 'contentSync')}
                  className="col-span-2 rounded-lg bg-blue-50 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  Sync Content
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {showModal && (
        <CreateStationModal
          onClose={() => setShowModal(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['stations'] })}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'online'
      ? 'bg-green-100 text-green-800'
      : status === 'in_game'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-gray-100 text-gray-800';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}
    >
      {status}
    </span>
  );
}
