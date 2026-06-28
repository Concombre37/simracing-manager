import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stationsApi, type Station } from '../services/stations';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../hooks/useAuth';
import { downloadEnvFile } from '../utils/downloadEnv';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { CreateStationModal } from '../components/CreateStationModal';
import { BlankingMediaModal } from '../components/BlankingMediaModal';
import {
  Play,
  Square,
  LineChart,
  Cog,
  MapPin,
  Glasses,
  RefreshCw,
  Key,
  Trash2,
  ChevronDown,
  ChevronUp,
  Monitor,
  Wifi,
  Download,
  Eye,
  EyeOff,
  ImageIcon,
} from 'lucide-react';

export function Stations() {
  const queryClient = useQueryClient();
  const { isAdmin, isTechnician } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [apiKeyStation, setApiKeyStation] = useState<{
    stationId: string;
    name: string;
    apiKey: string;
  } | null>(null);
  const [blankingStation, setBlankingStation] = useState<Station | null>(null);
  const socket = useSocket('/');

  const { data, isLoading, error } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
    refetchInterval: 5000,
  });

  socket?.on('station:updated', ({ stationId, status }) => {
    queryClient.setQueryData<Station[]>(['stations'], (old) =>
      old?.map((s) => (s.stationId === stationId ? { ...s, status } : s)),
    );
  });

  const launchMutation = useMutation({
    mutationFn: stationsApi.launch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
  });

  const stopMutation = useMutation({
    mutationFn: stationsApi.stop,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
  });

  const updateAgentMutation = useMutation({
    mutationFn: stationsApi.updateAgent,
  });

  const regenerateKeyMutation = useMutation({
    mutationFn: stationsApi.regenerateApiKey,
    onSuccess: (station) => {
      setApiKeyStation({
        stationId: station.stationId,
        name: station.name,
        apiKey: station.apiKey,
      });
      void queryClient.invalidateQueries({ queryKey: ['stations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: stationsApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
  });

  function sendCommand(stationId: string, command: string) {
    socket?.emit('station:command', { stationId, command });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white mb-1">Contrôle des postes</h2>
          <p className="text-gray-400">Gestion des POD et commandes temps réel</p>
        </div>
        {isAdmin && (
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <Monitor className="w-4 h-4" />
            Nouveau poste
          </Button>
        )}
      </div>

      {isLoading && <p className="text-gray-500">Chargement des stations...</p>}
      {error && (
        <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300">
          Erreur lors du chargement des stations
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {data?.map((station) => (
          <Card key={station.id} className="flex flex-col">
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
              <InfoItem
                icon={RefreshCw}
                label="Version agent"
                value={station.version ? `v${station.version}` : '—'}
              />
              <InfoItem
                icon={Wifi}
                label="Vu à"
                value={
                  station.lastSeenAt
                    ? new Date(station.lastSeenAt).toLocaleTimeString('fr-FR')
                    : '—'
                }
              />
              <InfoItem icon={MapPin} label="Config" value={station.config ? 'Oui' : 'Défaut'} />
            </div>

            {isAdmin && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => launchMutation.mutate(station.id)}
                  isLoading={launchMutation.isPending}
                >
                  <Play className="w-4 h-4" />
                  Lancer
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => stopMutation.mutate(station.id)}
                  isLoading={stopMutation.isPending}
                >
                  <Square className="w-4 h-4" />
                  Arrêter
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => sendCommand(station.stationId, 'idealLine')}
                >
                  <LineChart className="w-4 h-4" />
                  Ideal Line
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => sendCommand(station.stationId, 'autoShifter')}
                >
                  <Cog className="w-4 h-4" />
                  Auto Shifter
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => sendCommand(station.stationId, 'teleportToPits')}
                >
                  <MapPin className="w-4 h-4" />
                  Pits
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => sendCommand(station.stationId, 'recenterVR')}
                >
                  <Glasses className="w-4 h-4" />
                  Recenter VR
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => sendCommand(station.stationId, 'blankingHide')}
                >
                  <Eye className="w-4 h-4" />
                  Masquer écran
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => sendCommand(station.stationId, 'blankingShow')}
                >
                  <EyeOff className="w-4 h-4" />
                  Afficher écran
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setBlankingStation(station)}>
                  <ImageIcon className="w-4 h-4" />
                  Écran d'attente
                </Button>
              </div>
            )}

            <div className="mt-auto pt-4 border-t border-dark-600 flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandedId(expandedId === station.id ? null : station.id)}
              >
                {expandedId === station.id ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
                Détails
              </Button>
              {(isAdmin || isTechnician) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateAgentMutation.mutate(station.id)}
                  isLoading={updateAgentMutation.isPending}
                >
                  <RefreshCw className="w-4 h-4" />
                  MAJ agent
                </Button>
              )}
              {isAdmin && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => regenerateKeyMutation.mutate(station.id)}
                    isLoading={regenerateKeyMutation.isPending}
                  >
                    <Key className="w-4 h-4" />
                    Clé API
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    onClick={() => {
                      if (confirm('Supprimer cette station ?')) {
                        deleteMutation.mutate(station.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Supprimer
                  </Button>
                </>
              )}
            </div>

            {expandedId === station.id && (
              <div className="mt-4 p-3 bg-dark-900 rounded-lg border border-dark-600">
                <p className="text-xs text-gray-500 mb-2">Configuration brute</p>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-48">
                  {station.config
                    ? JSON.stringify(station.config, null, 2)
                    : 'Aucune configuration'}
                </pre>
              </div>
            )}
          </Card>
        ))}
      </div>

      {showModal && (
        <CreateStationModal
          onClose={() => setShowModal(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['stations'] })}
        />
      )}

      {blankingStation && (
        <BlankingMediaModal station={blankingStation} onClose={() => setBlankingStation(null)} />
      )}

      {apiKeyStation && (
        <Modal title="Nouvelle clé API" onClose={() => setApiKeyStation(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Télécharge la configuration et place le fichier à côté de{' '}
              <code>sim-center-agent-win.exe</code>, puis renomme-le en <code>.env</code>.
            </p>
            <code className="block p-4 bg-dark-900 border border-dark-600 text-accent-blue rounded-lg text-sm break-all font-mono">
              API_KEY={apiKeyStation.apiKey}
            </code>
            <Button
              variant="primary"
              onClick={() => downloadEnvFile(apiKeyStation)}
              className="w-full"
            >
              <Download className="w-4 h-4" />
              Télécharger la config (.env)
            </Button>
            <Button variant="secondary" onClick={() => setApiKeyStation(null)} className="w-full">
              Fermer
            </Button>
          </div>
        </Modal>
      )}
    </div>
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
        <p className="text-sm text-gray-200">{value}</p>
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
