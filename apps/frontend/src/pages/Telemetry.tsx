import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Gauge, Timer, Flag, MapPin, Monitor, CircleDot, Navigation } from 'lucide-react';
import type { TelemetrySnapshot } from '@simracing/shared';
import { useSocket } from '../hooks/useSocket';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { stationsApi, type Station } from '../services/stations';
import { formatDuration } from '../utils/time';

const STALE_MS = 5000;

export function Telemetry() {
  const socket = useSocket('/');
  const { data: stations } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
    refetchInterval: 5000,
  });

  const [liveData, setLiveData] = useState<Record<string, TelemetrySnapshot>>({});

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

  const inGameStations = useMemo(
    () => stations?.filter((s) => s.status === 'in_game') ?? [],
    [stations],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-1">Télémétrie en direct</h2>
        <p className="text-gray-400">Données temps réel des POD en jeu</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {inGameStations.map((station) => (
          <TelemetryCard
            key={station.stationId}
            station={station}
            telemetry={liveData[station.stationId]}
          />
        ))}
        {inGameStations.length === 0 && (
          <Card className="col-span-full py-12 text-center">
            <Monitor className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">Aucun POD en jeu pour le moment.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function TelemetryCard({
  station,
  telemetry,
}: {
  station: Station;
  telemetry?: TelemetrySnapshot;
}) {
  const stale = !telemetry || Date.now() - telemetry.timestamp > STALE_MS;
  const waiting = stale && station.status === 'in_game';

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent-orange/10 rounded-lg">
            <Gauge className="w-5 h-5 text-accent-orange" />
          </div>
          <div>
            <h3 className="font-semibold text-white">{station.name}</h3>
            <p className="text-xs text-gray-500 font-mono">{station.stationId}</p>
          </div>
        </div>
        <Badge variant={waiting ? 'yellow' : stale ? 'gray' : 'green'}>
          {waiting ? 'En attente télémétrie' : stale ? 'Hors ligne' : 'Live'}
        </Badge>
      </div>

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

      <div className="mt-auto pt-4 border-t border-dark-600">
        <div className="w-full h-2 bg-dark-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-orange transition-all duration-200"
            style={{
              width: `${Math.max(0, Math.min(1, telemetry?.trackPosition ?? 0)) * 100}%`,
            }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2 text-right">
          Tour {telemetry?.lapCount && telemetry.lapCount > 0 ? telemetry.lapCount : '—'} •{' '}
          {formatDuration(telemetry?.lapTimeMs)}
        </p>
      </div>
    </Card>
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
