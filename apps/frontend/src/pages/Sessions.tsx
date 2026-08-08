import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Flag,
  Gauge,
  AlertOctagon,
  Tv,
  Clock,
  MapPin,
  Monitor,
  Plus,
  Minus,
  Square,
  LineChart,
  Cog,
  Home,
  Timer,
} from 'lucide-react';
import type { TelemetrySnapshot } from '@simracing/shared';
import { useSocket } from '../hooks/useSocket';
import { PageTransition } from '../components/PageTransition';
import { sessionsApi, type ActiveSession } from '../services/sessions';
import { stationsApi } from '../services/stations';
import { formatDuration } from '../utils/time';
import { findCar, findTrackName, findTrackPreview, formatCarName } from '../utils/track';
import { useContentLabelMap } from '../services/contentLabels';

const STALE_MS = 5000;
const GAUGE_ARC = 150.8;
const GAUGE_CIRC = 201.1;

const DIFFICULTY_STYLE: Record<
  string,
  { label: string; bg: string; border: string; text: string }
> = {
  EASY: {
    label: 'Easy',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-300',
  },
  PRO: {
    label: 'Pro',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-300',
  },
  CUSTOM: {
    label: 'Custom',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    text: 'text-purple-300',
  },
};

export type StationContent = {
  tracks?: { acId: string; name: string; preview?: string }[];
  cars?: { acId: string; name: string; preview?: string }[];
};

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

/**
 * Bouton à double appui : le premier clic arme une confirmation (libellé +
 * couleur changent, une barre témoin se vide sur `armMs`), le second dans la
 * fenêtre déclenche réellement l'action. Réservé aux actions à fort impact
 * (Stop, réduction de temps) — un simple missclick ne fait jamais rien tout
 * seul.
 */
function ConfirmButton({
  onConfirm,
  disabled,
  className,
  idleContent,
  confirmContent,
  armMs = 2200,
}: {
  onConfirm: () => void;
  disabled?: boolean;
  className: string;
  idleContent: ReactNode;
  confirmContent: ReactNode;
  armMs?: number;
}) {
  const [armed, setArmed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const handleClick = () => {
    if (disabled) return;
    if (armed) {
      clearTimeout(timeoutRef.current);
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timeoutRef.current = setTimeout(() => setArmed(false), armMs);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`relative overflow-hidden ${className}`}
    >
      {armed ? confirmContent : idleContent}
      {armed && (
        <motion.span
          className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-current/70"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: armMs / 1000, ease: 'linear' }}
        />
      )}
    </button>
  );
}

export function Sessions() {
  const socket = useSocket('/');
  const queryClient = useQueryClient();
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: sessionsApi.getActive,
    refetchInterval: 10000,
  });
  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: stationsApi.getAll });
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

  const contentByStationId = useMemo(() => {
    const map = new Map<string, StationContent | null | undefined>();
    stations?.forEach((s) => map.set(s.stationId, s.content as StationContent | null));
    return map;
  }, [stations]);

  const stats = useMemo(() => {
    const liveSpeeds = Object.values(liveData)
      .filter((t) => now - t.timestamp <= STALE_MS)
      .map((t) => t.speedKmh);
    const avgSpeed = liveSpeeds.length
      ? Math.round(liveSpeeds.reduce((a, b) => a + b, 0) / liveSpeeds.length)
      : 0;
    const critical = (sessions ?? []).filter((s) => {
      if (!s.startedAt || !s.durationMinutes) return false;
      const endAt = new Date(s.startedAt).getTime() + s.durationMinutes * 60000;
      const remaining = (endAt - now) / 1000;
      return remaining > 0 && remaining <= 60;
    }).length;
    return { avgSpeed, critical };
  }, [liveData, sessions, now]);

  const count = sessions?.length ?? 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* HERO */}
        <div className="flex flex-wrap items-end gap-6">
          <div className="min-w-[260px] flex-1">
            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="h-[5px] w-[5px] flex-none rotate-45 bg-racing-cyan shadow-[0_0_8px_#00c2ff]" />
              <span className="whitespace-nowrap font-hud text-xs font-semibold uppercase tracking-[0.16em] text-racing-cyan">
                Télémétrie temps réel — PODs actifs
              </span>
            </div>
            <h1 className="font-hud text-[clamp(34px,4.4vw,48px)] font-bold leading-none tracking-tight text-white">
              Sessions en{' '}
              <span className="bg-gradient-to-r from-racing-blue to-racing-cyan bg-clip-text text-transparent">
                cours
              </span>
            </h1>
            <p className="mt-2.5 font-hud-mono text-xs text-gray-500">
              PODs actuellement en session, télémétrie temps réel
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 whitespace-nowrap rounded border px-3.5 py-2 font-hud text-[13px] font-bold tracking-wide ${
                count > 0
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/10 bg-white/[0.03] text-gray-500'
              }`}
            >
              <span className="relative flex h-1.5 w-1.5">
                {count > 0 && (
                  <span className="absolute inline-flex h-full w-full animate-ring-pulse rounded-full bg-emerald-400" />
                )}
                <span
                  className={`relative inline-flex h-1.5 w-1.5 rounded-full ${count > 0 ? 'bg-emerald-400' : 'bg-gray-500'}`}
                />
              </span>
              {count} POD{count > 1 ? 'S' : ''} EN SESSION
            </div>
            <Link
              to="/en-cours/kiosk"
              className="flex items-center gap-2 whitespace-nowrap rounded-md border border-racing-cyan/30 bg-gradient-to-br from-racing-blue/25 to-racing-cyan/10 px-4 py-2.5 font-hud text-[13px] font-bold tracking-wide text-sky-200 transition-colors hover:border-racing-cyan/60"
            >
              <Tv className="h-4 w-4" />
              Mode kiosque
            </Link>
          </div>
        </div>

        {/* COMPTEURS */}
        {!isLoading && count > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatChip
              icon={Flag}
              label="Sessions en cours"
              value={String(count)}
              accent="racing-cyan"
            />
            <StatChip
              icon={Gauge}
              label="Vitesse moyenne"
              value={`${stats.avgSpeed} km/h`}
              accent="purple"
            />
            <StatChip
              icon={AlertOctagon}
              label="Fin < 1 min"
              value={String(stats.critical)}
              accent="red"
              pulse={stats.critical > 0}
            />
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 py-16">
            <Flag className="mb-3 h-9 w-9 animate-pulse text-gray-600" />
            <p className="font-hud text-sm text-gray-500">Chargement des sessions...</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
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
                  content={contentByStationId.get(session.station.stationId)}
                  onCommand={(command) =>
                    socket?.emit('station:command', {
                      stationId: session.station.stationId,
                      command,
                    })
                  }
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {!isLoading && count === 0 && <EmptyState />}
      </div>
    </PageTransition>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
  accent,
  pulse,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent: 'racing-cyan' | 'purple' | 'red';
  pulse?: boolean;
}) {
  const styles = {
    'racing-cyan': { border: 'border-racing-cyan', icon: 'text-racing-cyan', bg: '' },
    purple: { border: 'border-purple-400', icon: 'text-purple-300', bg: '' },
    red: { border: 'border-red-500', icon: 'text-red-400', bg: pulse ? 'bg-red-500/[0.05]' : '' },
  }[accent];

  return (
    <div
      className={`flex items-center gap-3.5 border-l-2 bg-white/[0.02] px-4 py-3.5 ${styles.border} ${styles.bg}`}
    >
      <Icon className={`h-6 w-6 flex-none ${styles.icon} ${pulse ? 'animate-blink' : ''}`} />
      <div className="min-w-0">
        <p className="truncate font-hud text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </p>
        <p
          className={`font-hud text-2xl font-bold leading-tight ${pulse ? 'text-red-400' : 'text-white'}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.012]">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(255,255,255,.018) 0 22px, transparent 22px 44px)',
        }}
      />
      <div className="absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-racing-cyan/[0.07]" />
      <div className="absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-racing-cyan/[0.045]" />
      <div className="relative px-10 py-10 text-center">
        <Flag className="mx-auto h-16 w-16 text-dark-500" />
        <p className="mt-4 font-hud text-2xl font-bold tracking-wide text-gray-300">
          Aucun POD en session pour le moment
        </p>
        <p className="mt-2 font-hud-mono text-xs text-gray-500">
          Les sessions apparaîtront ici dès qu'un poste sera lancé.
        </p>
        <div className="mt-6 inline-flex items-center gap-2.5 rounded border border-white/[0.07] bg-white/[0.02] px-4 py-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ring-pulse rounded-full bg-emerald-400" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="font-hud text-[11px] font-semibold tracking-[0.14em] text-gray-400">
            EN ATTENTE — ACTUALISATION AUTOMATIQUE
          </span>
        </div>
      </div>
    </div>
  );
}

export function SessionCard({
  session,
  telemetry,
  now,
  content,
  onCommand,
}: {
  session: ActiveSession;
  telemetry?: TelemetrySnapshot;
  now: number;
  content: StationContent | null | undefined;
  /** Fires an in-game command at the agent (ideal line, auto shifter
   * toggle, teleport to pits...) — same 'station:command' socket event
   * Stations.tsx's expanded panel already uses, just surfaced directly on
   * the card so switching gearbox mode etc. doesn't require leaving the
   * live session view. */
  onCommand?: (command: string) => void;
}) {
  const queryClient = useQueryClient();
  const labelMap = useContentLabelMap();
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

  const trackPreview = findTrackPreview(session.track, content);
  const trackName = session.track ? findTrackName(session.track, content, labelMap) : undefined;
  const car = findCar(session.carAcId, content);
  const carName = session.carAcId ? formatCarName(car?.name, session.carAcId, labelMap) : undefined;
  const difficulty = session.difficulty ? DIFFICULTY_STYLE[session.difficulty] : undefined;

  const conn = waiting
    ? {
        label: 'Attente',
        dot: 'bg-gold',
        text: 'text-gold-text',
        bg: 'bg-gold/10',
        border: 'border-gold/30',
      }
    : stale
      ? {
          label: 'Hors ligne',
          dot: 'bg-gray-500',
          text: 'text-gray-400',
          bg: 'bg-white/[0.04]',
          border: 'border-white/10',
        }
      : {
          label: 'Live',
          dot: 'bg-emerald-400',
          text: 'text-emerald-300',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
        };

  const rpmDash = `${Math.max(0, Math.min(1, smoothRpm / 10000)) * GAUGE_ARC} ${GAUGE_CIRC}`;
  const speedDash = `${Math.max(0, Math.min(1, smoothSpeed / 320)) * GAUGE_ARC} ${GAUGE_CIRC}`;

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-lg border bg-gradient-to-b from-dark-800/90 to-dark-900/90 backdrop-blur-sm transition-colors ${
        critical ? 'border-red-500/45' : 'border-white/[0.07]'
      }`}
      style={
        critical
          ? { boxShadow: '0 0 0 1px rgba(255,59,59,.3), 0 0 40px rgba(255,59,59,.18)' }
          : { boxShadow: '0 18px 44px rgba(0,0,0,.45)' }
      }
    >
      {/* Bannière : vignette circuit + pilote + connexion */}
      <div className="relative h-24 overflow-hidden border-b border-white/[0.06]">
        {trackPreview ? (
          <img
            src={trackPreview}
            alt={trackName}
            className="h-full w-full object-cover opacity-50 transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-racing-blue/20 via-dark-900 to-dark-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-dark-950/95 via-dark-950/45 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-between p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-hud text-xl font-bold leading-tight tracking-wide text-white">
                {session.clientName || session.station.name}
              </h3>
              {carName && (
                <p className="truncate font-hud-mono text-[11px] text-gray-400">{carName}</p>
              )}
            </div>
            <span
              className={`flex flex-none items-center gap-1.5 whitespace-nowrap rounded border px-2 py-1 font-hud text-[10.5px] font-bold tracking-wider ${conn.bg} ${conn.border} ${conn.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${conn.dot}`} />
              {conn.label.toUpperCase()}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <MetaChip icon={Monitor}>{session.station.name}</MetaChip>
            {difficulty && (
              <span
                className={`rounded border px-2 py-0.5 font-hud text-[10.5px] font-bold tracking-wider ${difficulty.bg} ${difficulty.border} ${difficulty.text}`}
              >
                {difficulty.label.toUpperCase()}
              </span>
            )}
            {trackName && (
              <span className="min-w-0 flex-1 truncate text-right font-hud-mono text-[10.5px] text-gray-400">
                <MapPin className="mr-1 inline h-3 w-3 text-gray-500" />
                {trackName}
                {session.trackLayout ? ` (${session.trackLayout})` : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 p-3.5">
        {/* Timer */}
        {remainingSeconds !== undefined && (
          <div>
            <div className="flex items-baseline gap-2">
              <span className="flex items-center gap-1.5 font-hud text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                <Clock className="h-3.5 w-3.5" />
                Temps restant
              </span>
              <div className="flex-1" />
              {session.durationMinutes !== undefined && (
                <span className="font-hud-mono text-[11px] text-gray-600">
                  sur {session.durationMinutes} min
                </span>
              )}
            </div>
            <div
              className={`mt-0.5 font-hud text-5xl font-bold leading-none tracking-tight tabular-nums ${
                expired ? 'text-red-500' : critical ? 'animate-blink text-red-400' : 'text-white'
              }`}
            >
              {expired ? '00:00' : formatRemaining(remainingSeconds)}
            </div>
            <div className="mt-2.5 h-[5px] w-full overflow-hidden rounded-full bg-white/[0.07]">
              <motion.div
                className={`h-full rounded-full ${
                  expired
                    ? 'bg-red-500'
                    : critical
                      ? 'bg-gradient-to-r from-red-600 to-red-500'
                      : 'bg-gradient-to-r from-racing-blue to-racing-cyan'
                }`}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        {/* Jauges RPM / Vitesse */}
        <div className="grid grid-cols-2 gap-2.5">
          <GaugeTile
            dash={rpmDash}
            color="#00c2ff"
            centerValue={(smoothRpm / 1000).toFixed(1)}
            centerUnit="tr/min"
            pairedLabel="Rapport"
            pairedValue={telemetry ? gearLabel(telemetry.gear) : '—'}
          />
          <GaugeTile
            dash={speedDash}
            color="#a855f7"
            centerValue={String(Math.round(smoothSpeed))}
            centerUnit="km/h"
            pairedLabel="Position"
            pairedValue={telemetry?.position?.toString() ?? '—'}
          />
        </div>

        {/* Barres pédales + progression circuit */}
        <div className="flex flex-col gap-1.5">
          <PedalBar
            label="Accélérateur"
            value={telemetry?.throttle ?? 0}
            color="from-green-600 to-emerald-400"
          />
          <PedalBar label="Frein" value={telemetry?.brake ?? 0} color="from-red-700 to-red-500" />
          <PedalBar
            label="Circuit"
            value={telemetry?.trackPosition ?? 0}
            color="from-racing-blue to-racing-cyan"
          />
        </div>

        {/* Meilleur / dernier tour */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded border border-gold/20 bg-gold/[0.05] px-3 py-2">
            <div className="flex items-center gap-1.5 font-hud text-[10.5px] font-semibold uppercase tracking-wider text-gold-dark">
              <Timer className="h-3 w-3" />
              Meilleur tour
            </div>
            <p className="mt-0.5 font-hud-mono text-lg font-bold tabular-nums text-gold">
              {formatDuration(telemetry?.bestLapMs)}
            </p>
          </div>
          <div className="rounded border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <div className="flex items-center gap-1.5 font-hud text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
              <Flag className="h-3 w-3" />
              Dernier tour
            </div>
            <p className="mt-0.5 font-hud-mono text-lg font-bold tabular-nums text-gray-200">
              {formatDuration(telemetry?.lastLapMs)}
            </p>
          </div>
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-3">
          <div className="flex items-center gap-1.5">
            <span className="w-4 flex-none text-center font-hud text-xs font-bold text-emerald-400">
              +
            </span>
            <div className="grid flex-1 grid-cols-3 gap-1.5">
              {[1, 5, 15].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => extendMutation.mutate(m)}
                  disabled={extendMutation.isPending || expired}
                  className="flex items-center justify-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/[0.06] py-1.5 font-hud text-[11.5px] font-bold tracking-wide text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus className="h-3 w-3" />
                  {m} min
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 flex-none text-center font-hud text-xs font-bold text-red-300">
              −
            </span>
            <div className="grid flex-1 grid-cols-3 gap-1.5">
              {[1, 5].map((m) => (
                <ConfirmButton
                  key={m}
                  onConfirm={() => extendMutation.mutate(-m)}
                  disabled={
                    extendMutation.isPending || expired || (remainingSeconds ?? 0) <= m * 60
                  }
                  className="flex items-center justify-center gap-1 rounded border border-red-500/25 bg-red-500/[0.05] py-1.5 font-hud text-[11.5px] font-bold tracking-wide text-red-300 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                  idleContent={
                    <>
                      <Minus className="h-3 w-3" />
                      {m} min
                    </>
                  }
                  confirmContent={<span className="text-[10.5px]">CONFIRMER ?</span>}
                />
              ))}
              <div />
            </div>
          </div>
          {onCommand && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => onCommand('idealLine')}
                title="Ligne idéale"
                className="flex h-8 w-9 flex-none items-center justify-center rounded border border-white/[0.08] bg-white/[0.02] text-gray-400 transition-colors hover:border-racing-cyan/40 hover:text-sky-200"
              >
                <LineChart className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onCommand('autoShifter')}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded border border-white/[0.08] bg-white/[0.02] font-hud text-[11.5px] font-bold tracking-wide text-gray-400 transition-colors hover:border-racing-cyan/40 hover:text-sky-200"
              >
                <Cog className="h-3.5 w-3.5" />
                Boîte auto
              </button>
              <button
                type="button"
                onClick={() => onCommand('teleportToPits')}
                title="Retour aux stands"
                className="flex h-8 w-9 flex-none items-center justify-center rounded border border-racing-cyan/25 bg-racing-cyan/[0.06] text-sky-300 transition-colors hover:bg-racing-cyan/15"
              >
                <Home className="h-3.5 w-3.5" />
              </button>
              <ConfirmButton
                onConfirm={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                className="ml-1 flex h-8 flex-none items-center justify-center gap-1.5 rounded border border-red-500 bg-red-500/15 px-3 font-hud text-[11.5px] font-bold tracking-wider text-red-300 transition-colors hover:bg-red-500 hover:text-dark-950 disabled:cursor-not-allowed disabled:opacity-50"
                idleContent={
                  <>
                    <Square className="h-3.5 w-3.5" />
                    Stop
                  </>
                }
                confirmContent={<span className="whitespace-nowrap">Confirmer ?</span>}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaChip({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-racing-cyan/25 bg-racing-cyan/[0.08] px-2 py-0.5 font-hud text-[10.5px] font-bold tracking-wider text-sky-200">
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}

function GaugeTile({
  dash,
  color,
  centerValue,
  centerUnit,
  pairedLabel,
  pairedValue,
}: {
  dash: string;
  color: string;
  centerValue: string;
  centerUnit: string;
  pairedLabel: string;
  pairedValue: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded border border-white/[0.06] bg-white/[0.02] p-2">
      <svg width="64" height="64" viewBox="0 0 80 80" className="flex-none">
        <g transform="rotate(135 40 40)">
          <circle
            cx="40"
            cy="40"
            r="32"
            fill="none"
            stroke="rgba(255,255,255,.08)"
            strokeWidth="7"
            strokeDasharray={`${GAUGE_ARC} ${GAUGE_CIRC}`}
            strokeLinecap="round"
          />
          <circle
            cx="40"
            cy="40"
            r="32"
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeDasharray={dash}
            strokeLinecap="round"
          />
        </g>
        <text
          x="40"
          y="39"
          textAnchor="middle"
          fill="#e9edf2"
          fontFamily="Rajdhani, sans-serif"
          fontSize="19"
          fontWeight="700"
        >
          {centerValue}
        </text>
        <text
          x="40"
          y="51"
          textAnchor="middle"
          fill="#7c8794"
          fontFamily="Rajdhani, sans-serif"
          fontSize="9"
          letterSpacing="1"
        >
          {centerUnit.toUpperCase()}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="font-hud text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {pairedLabel}
        </p>
        <p className="font-hud text-2xl font-bold leading-tight text-white">{pairedValue}</p>
      </div>
    </div>
  );
}

function PedalBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[74px] flex-none font-hud text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      </div>
      <span className="w-8 flex-none text-right font-hud-mono text-[11px] tabular-nums text-gray-300">
        {Math.round(pct)}%
      </span>
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
