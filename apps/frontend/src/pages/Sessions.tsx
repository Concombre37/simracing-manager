import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Clock,
  Timer,
  Flag,
  MapPin,
  Monitor,
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
import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { CircularGauge } from '../components/ui/CircularGauge';
import { sessionsApi, type ActiveSession } from '../services/sessions';
import { formatDuration } from '../utils/time';

const STALE_MS = 5000;

function useSmoothedValue(target: number, factor = 0.18) {
  const [value, setValue] = useState(target);
  const raf = useRef(0);

  useEffect(() => {
    function tick() {
      setValue((current) => {
        const next = current + (target - current) * factor;
        return Math.abs(next - target) < 0.4 ? target : next;
      });
      raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, factor]);

  return value;
}

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
    <PageShell
      title="Sessions en"
      accent="cours"
      subtitle="PODs actuellement en session, télémétrie temps réel"
      actions={
        <div className="flex items-center gap-2 rounded-full border border-dark-600 bg-dark-800/70 px-3 py-1.5 text-xs font-semibold text-gray-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ring-pulse rounded-full bg-green-400" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
          </span>
          {sessions?.length ?? 0} POD{(sessions?.length ?? 0) > 1 ? 's' : ''} en session
        </div>
      }
    >
      {isLoading && (
        <Card className="py-12 text-center">
          <Activity className="mx-auto mb-3 h-10 w-10 animate-pulse text-gray-600" />
          <p className="text-gray-400">Chargement des sessions...</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {sessions?.map((session) => (
            <motion.div
              key={session.id}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as const }}
            >
              <SessionCard
                session={session}
                telemetry={liveData[session.station.stationId]}
                now={now}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {!isLoading && (sessions?.length ?? 0) === 0 && (
        <Card className="py-12 text-center">
          <Monitor className="mx-auto mb-3 h-12 w-12 text-gray-600" />
          <p className="text-gray-400">Aucun POD en session pour le moment.</p>
        </Card>
      )}
    </PageShell>
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

  const smoothRpm = useSmoothedValue(telemetry ? telemetry.rpm : 0);
  const smoothSpeed = useSmoothedValue(telemetry ? telemetry.speedKmh : 0);

  const stale = !telemetry || Date.now() - telemetry.timestamp > STALE_MS;
  const waiting = stale && session.station.status === 'in_game';
  const expired = remainingSeconds !== undefined && remainingSeconds <= 0;
  const critical = !expired && remainingSeconds !== undefined && remainingSeconds <= 60;
  const progressPct =
    remainingSeconds !== undefined && session.durationMinutes
      ? Math.max(0, Math.min(100, (remainingSeconds / (session.durationMinutes * 60)) * 100))
      : 0;

  return (
    <div className="relative overflow-hidden rounded-xl border border-dark-600 bg-dark-800/70 backdrop-blur-sm">
      <span
        className={`absolute bottom-0 left-0 top-0 w-1 ${
          waiting ? 'bg-yellow-500/70' : stale ? 'bg-dark-600' : 'bg-green-500/70'
        }`}
      />

      {/* En-tête : identité + état */}
      <div className="flex items-center justify-between gap-3 border-b border-dark-700 py-4 pl-6 pr-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-accent-orange/20 bg-accent-orange/10 p-2">
            <Play className="h-5 w-5 text-accent-orange" />
          </div>
          <div>
            <h3 className="text-lg font-bold leading-tight text-white">{session.station.name}</h3>
            <p className="font-mono text-xs text-gray-500">{session.station.stationId}</p>
          </div>
        </div>
        <Badge variant={waiting ? 'yellow' : stale ? 'gray' : 'green'}>
          {waiting ? 'Attente télémétrie' : stale ? 'Hors ligne' : 'Live'}
        </Badge>
      </div>

      <div className="space-y-5 p-5 pl-6">
        {/* Bandeau timer : l'info la plus critique, la plus visible */}
        {remainingSeconds !== undefined && (
          <div
            className={`rounded-xl border bg-dark-900/80 p-4 transition-colors ${
              critical ? 'border-red-500/50' : 'border-dark-600'
            }`}
          >
            <div className="mb-3 flex items-end justify-between">
              <span className="flex items-center gap-2 text-sm text-gray-400">
                <Clock className="h-4 w-4" />
                Temps restant
              </span>
              <span
                className={`font-mono text-4xl font-bold tabular-nums tracking-tight ${
                  expired ? 'text-red-500' : critical ? 'animate-blink text-red-400' : 'text-white'
                }`}
              >
                {expired ? '00:00' : formatRemaining(remainingSeconds)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-dark-700">
              <motion.div
                className={`h-full ${
                  expired
                    ? 'bg-red-500'
                    : progressPct <= 10
                      ? 'bg-yellow-400'
                      : 'bg-gradient-to-r from-accent-orange to-accent-yellow'
                }`}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        {/* Télémétrie : jauges + pédales à gauche, données à droite */}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-dark-600 bg-dark-900/50 p-4">
            <div className="flex items-center justify-around">
              <CircularGauge
                value={smoothRpm}
                max={10000}
                label="RPM"
                unit="/min"
                color="#00d4ff"
                size={140}
              />
              <CircularGauge
                value={smoothSpeed}
                max={320}
                label="Vitesse"
                unit="km/h"
                color="#ff6b35"
                size={140}
              />
            </div>
            <div className="space-y-2 pt-2">
              <PedalBar label="Accélérateur" value={telemetry?.throttle ?? 0} color="#22c55e" />
              <PedalBar label="Frein" value={telemetry?.brake ?? 0} color="#ef4444" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <InfoPill icon={User} label="Client" value={session.clientName ?? '—'} />
              <InfoPill icon={Car} label="Voiture" value={session.carAcId ?? '—'} />
              <InfoPill icon={MapPin} label="Circuit" value={session.track ?? '—'} />
              <InfoPill icon={AlertCircle} label="Difficulté" value={session.difficulty ?? '—'} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <DataTile label="Rapport" value={telemetry ? gearLabel(telemetry.gear) : '—'} />
              <DataTile label="Position" value={telemetry?.position?.toString() ?? '—'} />
              <DataTile
                label="Piste"
                value={
                  telemetry?.trackPosition !== undefined
                    ? `${Math.round(telemetry.trackPosition * 100)}%`
                    : '—'
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-dark-600 bg-dark-900/60 p-3">
                <div className="mb-1 flex items-center gap-2 text-gray-500">
                  <Timer className="h-3.5 w-3.5" />
                  <span className="text-[10px] uppercase tracking-wider">Meilleur tour</span>
                </div>
                <p className="font-mono text-lg font-semibold tabular-nums text-white">
                  {formatDuration(telemetry?.bestLapMs)}
                </p>
              </div>
              <div className="rounded-xl border border-dark-600 bg-dark-900/60 p-3">
                <div className="mb-1 flex items-center gap-2 text-gray-500">
                  <Flag className="h-3.5 w-3.5" />
                  <span className="text-[10px] uppercase tracking-wider">Dernier tour</span>
                </div>
                <p className="font-mono text-lg font-semibold tabular-nums text-white">
                  {formatDuration(telemetry?.lastLapMs)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Barre d'actions : ajouts / retraits groupés, Stop isolé */}
        <div className="flex flex-wrap items-center gap-3 border-t border-dark-700 pt-4">
          <div className="inline-flex divide-x divide-dark-600 overflow-hidden rounded-lg border border-dark-600">
            {[1, 5, 15].map((m) => (
              <button
                key={m}
                onClick={() => extendMutation.mutate(m)}
                disabled={extendMutation.isPending || expired}
                className="flex items-center gap-1 bg-dark-800/80 px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:bg-dark-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-3 w-3" />
                {m} min
              </button>
            ))}
          </div>
          <div className="inline-flex divide-x divide-dark-600 overflow-hidden rounded-lg border border-dark-600">
            {[1, 5].map((m) => (
              <button
                key={m}
                onClick={() => extendMutation.mutate(-m)}
                disabled={extendMutation.isPending || expired || (remainingSeconds ?? 0) <= m * 60}
                className="flex items-center gap-1 bg-dark-800/80 px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:bg-dark-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus className="h-3 w-3" />
                {m} min
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="danger"
            className="ml-auto"
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
          >
            <Square className="h-4 w-4" />
            Stop
          </Button>
        </div>
      </div>
    </div>
  );
}

function PedalBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-dark-700">
        <motion.div
          className="h-full rounded-full"
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs tabular-nums text-white">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

function DataTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dark-600 bg-dark-900/60 p-3">
      <span className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
      <span className="font-mono text-2xl font-bold tabular-nums text-white">{value}</span>
    </div>
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
    <div className="rounded-lg border border-dark-600 bg-dark-900/60 p-2.5">
      <div className="mb-1 flex items-center gap-2 text-gray-500">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="truncate text-sm font-medium text-white" title={value}>
        {value}
      </p>
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
