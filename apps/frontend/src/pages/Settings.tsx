import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stationsApi, type Station } from '../services/stations';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Monitor, Wifi, Network, Power, PowerOff, AlertCircle } from 'lucide-react';

export function Settings() {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const {
    data: stations,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
    refetchInterval: 5000,
  });

  const wakeMutation = useMutation({
    mutationFn: stationsApi.wake,
    onSuccess: (res) => {
      setFeedback({
        type: 'success',
        message: `Magic packet envoyé via ${res.relayStationId} vers ${res.targetMac}`,
      });
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message ?? err.message ?? 'Erreur lors du réveil',
      });
    },
  });

  const shutdownMutation = useMutation({
    mutationFn: stationsApi.shutdown,
    onSuccess: () => {
      setFeedback({ type: 'success', message: "Commande d'arrêt envoyée." });
      void queryClient.invalidateQueries({ queryKey: ['stations'] });
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message ?? err.message ?? "Erreur lors de l'arrêt",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-1">Paramètres</h2>
        <p className="text-gray-400">Réseau des PODs, Wake-on-LAN et arrêt distant</p>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-lg border flex items-start gap-3 ${
            feedback.type === 'success'
              ? 'bg-green-900/30 border-green-800 text-green-300'
              : 'bg-red-900/30 border-red-800 text-red-300'
          }`}
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{feedback.message}</p>
            <button
              onClick={() => setFeedback(null)}
              className="text-sm underline mt-2 opacity-80 hover:opacity-100"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-gray-500">Chargement des stations...</p>}
      {error && (
        <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300">
          Erreur lors du chargement des stations
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {stations?.map((station) => (
          <StationCard
            key={station.id}
            station={station}
            onWake={() => wakeMutation.mutate(station.id)}
            onShutdown={() => shutdownMutation.mutate(station.id)}
            isWakeLoading={wakeMutation.isPending && wakeMutation.variables === station.id}
            isShutdownLoading={
              shutdownMutation.isPending && shutdownMutation.variables === station.id
            }
          />
        ))}
      </div>
    </div>
  );
}

function StationCard({
  station,
  onWake,
  onShutdown,
  isWakeLoading,
  isShutdownLoading,
}: {
  station: Station;
  onWake: () => void;
  onShutdown: () => void;
  isWakeLoading: boolean;
  isShutdownLoading: boolean;
}) {
  const isOnline = station.status === 'online' || station.status === 'in_game';
  const canWake = !isOnline && Boolean(station.macAddress);
  const canShutdown = isOnline;

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getStatusBg(station.status)}`}>
            <Monitor className={`w-5 h-5 ${getStatusColor(station.status)}`} />
          </div>
          <div>
            <h3 className="font-semibold text-white">{station.name}</h3>
            <p className="text-xs text-gray-500 font-mono">{station.stationId}</p>
          </div>
        </div>
        <StatusBadge status={station.status} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
        <InfoItem icon={Wifi} label="IP locale" value={station.localIp ?? '—'} />
        <InfoItem icon={Network} label="Adresse MAC" value={station.macAddress ?? '—'} />
      </div>

      <div className="mt-auto pt-4 border-t border-dark-600 grid grid-cols-2 gap-2">
        <Button
          variant="success"
          size="sm"
          onClick={onWake}
          disabled={!canWake || isWakeLoading}
          isLoading={isWakeLoading}
        >
          <Power className="w-4 h-4" />
          Allumer
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={onShutdown}
          disabled={!canShutdown || isShutdownLoading}
          isLoading={isShutdownLoading}
        >
          <PowerOff className="w-4 h-4" />
          Éteindre
        </Button>
      </div>
    </Card>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-gray-400">
      <Icon className="w-4 h-4 text-gray-500" />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-200 font-mono">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'online':
      return <Badge variant="green">En ligne</Badge>;
    case 'in_game':
      return <Badge variant="blue">En jeu</Badge>;
    case 'updating':
      return <Badge variant="purple">Mise à jour</Badge>;
    case 'offline':
    default:
      return <Badge variant="gray">Hors ligne</Badge>;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'online':
      return 'text-green-400';
    case 'in_game':
      return 'text-blue-400';
    case 'updating':
      return 'text-purple-400';
    default:
      return 'text-gray-400';
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case 'online':
      return 'bg-green-400/10';
    case 'in_game':
      return 'bg-blue-400/10';
    case 'updating':
      return 'bg-purple-400/10';
    default:
      return 'bg-gray-400/10';
  }
}
