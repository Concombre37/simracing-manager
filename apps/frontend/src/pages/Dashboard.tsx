import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { stationsApi } from '../services/stations';
import { dedicatedServersApi } from '../services/dedicatedServers';
import { Monitor, Server, Play, Users, ArrowRight, Trophy, Activity } from 'lucide-react';

export function Dashboard() {
  const { data: stations } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
    refetchInterval: 5000,
  });
  const { data: servers } = useQuery({
    queryKey: ['dedicated-servers'],
    queryFn: dedicatedServersApi.getAll,
  });

  const onlineCount =
    stations?.filter((s) => s.status === 'online' || s.status === 'in_game').length ?? 0;
  const inGameCount = stations?.filter((s) => s.status === 'in_game').length ?? 0;
  const totalStations = stations?.length ?? 0;
  const totalServers = servers?.length ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard technique</h1>
        <p className="text-gray-400">Vue d'ensemble de l'infrastructure SimRacing</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Monitor}
          label="Postes en ligne"
          value={`${onlineCount}/${totalStations}`}
          color="text-accent-blue"
          bgColor="bg-accent-blue/10"
        />
        <StatCard
          icon={Play}
          label="Sessions actives"
          value={String(inGameCount)}
          color="text-green-400"
          bgColor="bg-green-400/10"
        />
        <StatCard
          icon={Server}
          label="Serveurs dédiés"
          value={String(totalServers)}
          color="text-accent-orange"
          bgColor="bg-accent-orange/10"
        />
        <StatCard
          icon={Activity}
          label="Total sessions"
          value="—"
          color="text-purple-400"
          bgColor="bg-purple-400/10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="État des postes"
              subtitle="Status temps réel des POD"
              action={
                <Link
                  to="/stations"
                  className="text-sm text-accent-orange hover:text-orange-400 flex items-center gap-1"
                >
                  Voir tout <ArrowRight className="w-4 h-4" />
                </Link>
              }
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stations?.slice(0, 4).map((station) => (
                <div
                  key={station.id}
                  className="flex items-center justify-between p-4 bg-dark-900 rounded-lg border border-dark-600"
                >
                  <div>
                    <p className="font-medium text-white">{station.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{station.stationId}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={station.status} />
                    <p className="text-xs text-gray-500 mt-1">
                      {station.version ? `v${station.version}` : '—'}
                    </p>
                  </div>
                </div>
              ))}
              {stations?.length === 0 && (
                <p className="text-gray-500 col-span-full">Aucune station configurée</p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Accès rapide" />
            <div className="space-y-3">
              <QuickLink to="/stations" icon={Monitor} label="Contrôle des postes" />
              <QuickLink to="/dedicated-servers" icon={Server} label="Gestion des serveurs" />
              <QuickLink to="/leaderboard" icon={Trophy} label="Classement" />
              <QuickLink to="/users" icon={Users} label="Utilisateurs" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  bgColor: string;
}) {
  return (
    <Card className="flex items-center gap-4">
      <div className={`p-3 rounded-lg ${bgColor}`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div>
        <p className="text-sm text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </Card>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between p-3 bg-dark-900 rounded-lg border border-dark-600 hover:border-accent-orange transition-colors group"
    >
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-gray-400 group-hover:text-accent-orange" />
        <span className="text-sm font-medium text-gray-300 group-hover:text-white">{label}</span>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-accent-orange" />
    </Link>
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
