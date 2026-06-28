import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Clock,
  Gauge,
  Timer,
  Flag,
  MapPin,
  Monitor,
  CircleDot,
  Navigation,
  User,
  Car,
  AlertCircle,
  Play,
  Plus,
  Minus,
  Square,
} from 'lucide-react';
import type { TelemetrySnapshot } from '@simracing/shared';
import { useSocket } from '../hooks/useSocket';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { sessionsApi, type ActiveSession } from '../services/sessions';
import { formatDuration } from '../utils/time';

const STALE_MS = 5000;

export function Sessions() {
  const socket = useSocket('/');
  const queryClient = useQueryClient();
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: sessionsApi.getActive,
    refetchInterval: 10000,
  });
  const [liveData, setLiveData] = useState<Record<string, TelemetrySnapshot>>({});
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: TelemetrySnapshot) => {
      setLiveData((prev) => ({ ...prev, [payload.stationId]: payload }));
    };
    socket.on('station:telemetry', handler);
    return () => {
      socket.off('station:telemetry', handler);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
    };
    socket.on('station:updated', handler);
    socket.on('session:updated', handler);
    return () => {
      socket.off('station:updated', handler);
      socket.off('session:updated', handler);
    };
  }, [socket, queryClient]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-1">En cours</h2>
        <p className="text-gray-400">PODs actuellement en session</p>
      </div>

      {isLoading && (
        <Card className="py-12 text-center">
          <Activity className="w-10 h-10 text-gray-600 mx-auto mb-3 animate-pulse" />
          <p className="text-gray-400">Chargement des sessions...</p>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {sessions?.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            telemetry={liveData[session.station.stationId]}
            now={now}
          />
        ))}
      </div>

      {!isLoading && (sessions?.length ?? 0) === 0 && (
        <Card className="py-12 text-center">
          <Monitor className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Aucun POD en session pour le moment.</p>
        </Card>
      )}
    </div>
  );
}

function SessionCard({
  session,
  telemetry,
  now,
}: {
  session: ActiveSession;
  telemetry?: TelemetrySnapshot;
  now: number;
}) {
  const queryClient = useQueryClient();
  const [remainingSeconds, setRemainingSeconds] = useState<number | undefined>();

  useEffect(() => {
    if (!session.startedAt || !session.durationMinutes) {
      setRemainingSeconds(undefined);
      return;
    }
    const endAt = new Date(session.startedAt).getTime() + session.durationMinutes * 60 * 1000;
    setRemainingSeconds(Math.max(0, Math.round((endAt - now) / 1000)));
  }, [session.startedAt, session.durationMinutes, now]);

  const extendMutation = useMutation({
    mutationFn: (minutes: number) => sessionsApi.extend(session.id, minutes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => sessionsApi.stop(session.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
    },
  });

  const stale = !telemetry || Date.now() - telemetry.timestamp > STALE_MS;
  const waiting = stale && session.station.status === 'in_game';

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent-orange/10 rounded-lg">
            <Play className="w-5 h-5 text-accent-orange" />
          </div>
          <div>
            <h3 className="font-semibold text-white">{session.station.name}</h3>
            <p className="text-xs text-gray-500 font-mono">{session.station.stationId}</p>
          </div>
        </div>
        <Badge variant={waiting ? 'yellow' : stale ? 'gray' : 'green'}>
          {waiting ? 'En attente télémétrie' : stale ? 'Hors ligne' : 'Live'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <InfoPill icon={User} label="Client" value={session.clientName ?? '—'} />
        <InfoPill icon={Car} label="Voiture" value={session.carAcId ?? '—'} />
        <InfoPill icon={MapPin} label="Circuit" value={session.track ?? '—'} />
        <InfoPill icon={AlertCircle} label="Difficulté" value={session.difficulty ?? '—'} />
      </div>

      {remainingSeconds !== undefined && (
        <div className="mb-4 p-3 bg-dark-900 rounded-lg border border-dark-600">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Temps restant
            </span>
            <span className="text-white font-mono font-semibold">
              {formatRemaining(remainingSeconds)}
            </span>
          </div>
          <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-orange transition-all duration-1000"
              style={{
                width: `${Math.max(
                  0,
                  Math.min(100, (remainingSeconds / ((session.durationMinutes ?? 1) * 60)) * 100),
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Metric
          icon={Gauge}
          label="Vitesse"
          value={telemetry ? `${Math.round(telemetry.speedKmh)} km/h` : '—'}
        />
        <Metric
          icon={Activity}
          label="RPM"
          value={telemetry ? String(Math.round(telemetry.rpm)) : '—'}
        />
        <Metric icon={Timer} label="Meilleur tour" value={formatDuration(telemetry?.bestLapMs)} />
        <Metric icon={Flag} label="Dernier tour" value={formatDuration(telemetry?.lastLapMs)} />
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400 flex items-center gap-2">
            <CircleDot className="w-4 h-4" />
            Rapport
          </span>
          <span className="text-white font-medium">
            {telemetry ? gearLabel(telemetry.gear) : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Position
          </span>
          <span className="text-white font-medium">{telemetry?.position ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400 flex items-center gap-2">
            <Navigation className="w-4 h-4" />
            Progression
          </span>
          <span className="text-white font-medium">
            {telemetry?.trackPosition !== undefined
              ? `${Math.round(telemetry.trackPosition * 100)} %`
              : '—'}
          </span>
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-dark-600 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => extendMutation.mutate(1)}
          disabled={extendMutation.isPending}
        >
          <Plus className="w-4 h-4" />1 min
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => extendMutation.mutate(5)}
          disabled={extendMutation.isPending}
        >
          <Plus className="w-4 h-4" />5 min
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => extendMutation.mutate(15)}
          disabled={extendMutation.isPending}
        >
          <Plus className="w-4 h-4" />
          15 min
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => extendMutation.mutate(-1)}
          disabled={extendMutation.isPending || (remainingSeconds ?? 0) <= 60}
        >
          <Minus className="w-4 h-4" />1 min
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => extendMutation.mutate(-5)}
          disabled={extendMutation.isPending || (remainingSeconds ?? 0) <= 300}
        >
          <Minus className="w-4 h-4" />5 min
        </Button>
        <Button
          size="sm"
          variant="danger"
          className="ml-auto"
          onClick={() => stopMutation.mutate()}
          disabled={stopMutation.isPending}
        >
          <Square className="w-4 h-4" />
          Stop
        </Button>
      </div>
    </Card>
  );
}

function InfoPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="p-2 bg-dark-900 rounded-lg border border-dark-600">
      <div className="flex items-center gap-2 text-gray-500 mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm font-medium text-white truncate" title={value}>
        {value}
      </p>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="p-3 bg-dark-900 rounded-lg border border-dark-600">
      <div className="flex items-center gap-2 text-gray-500 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function gearLabel(gear: number): string {
  if (gear === 0) return 'N';
  if (gear < 0) return 'R';
  return String(gear);
}

function formatRemaining(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
