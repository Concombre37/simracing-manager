import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TelemetrySnapshot } from '@simracing/shared';
import { useSocket } from '../hooks/useSocket';
import { sessionsApi, type ActiveSession } from '../services/sessions';
import { stationsApi } from '../services/stations';
import { findCar, findTrackName, findTrackPreview, formatCarName } from '../utils/track';

const STALE_MS = 5000;
const MAX_PODS = 10;

const DIFFICULTY_STYLE: Record<string, { label: string; color: string }> = {
  EASY: { label: 'Easy', color: '#22c55e' },
  PRO: { label: 'Pro', color: '#00d4ff' },
  CUSTOM: { label: 'Custom', color: '#a855f7' },
};

type StationContent = {
  tracks?: { acId: string; name: string; preview?: string }[];
  cars?: { acId: string; name: string; preview?: string }[];
};

function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Read-only wall-display variant of /en-cours: no admin actions, no
 * telemetry gauges — just enough per POD to glance at from across a room.
 * A dense 5x2 grid comfortably fits the site's realistic max (10 PODs)
 * on a single TV/monitor without scrolling.
 */
export function SessionsKiosk() {
  const socket = useSocket('/');
  const queryClient = useQueryClient();
  const { data: sessions } = useQuery({
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

  const displayedSessions = useMemo(() => {
    return [...(sessions ?? [])]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, MAX_PODS);
  }, [sessions]);

  const slots = Array.from({ length: MAX_PODS }, (_, i) => displayedSessions[i]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-dark-950 p-4">
      <header className="mb-4 flex shrink-0 items-center justify-between">
        <h1 className="text-2xl font-black uppercase tracking-wide text-white">
          SimRacing Manager <span className="text-accent-orange">En cours</span>
        </h1>
        <div className="flex items-center gap-2 rounded-full border border-dark-600 bg-dark-800/70 px-4 py-1.5 text-sm font-semibold text-gray-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ring-pulse rounded-full bg-green-400" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
          </span>
          {displayedSessions.length}/{MAX_PODS} PODs en session
        </div>
      </header>

      <div className="grid flex-1 grid-cols-5 grid-rows-2 gap-4">
        {slots.map((session, i) =>
          session ? (
            <KioskCard
              key={session.id}
              session={session}
              telemetry={liveData[session.station.stationId]}
              now={now}
              content={contentByStationId.get(session.station.stationId)}
            />
          ) : (
            <div
              key={`empty-${i}`}
              className="rounded-xl border border-dashed border-dark-700 bg-dark-900/40"
            />
          ),
        )}
      </div>
    </div>
  );
}

function KioskCard({
  session,
  telemetry,
  now,
  content,
}: {
  session: ActiveSession;
  telemetry?: TelemetrySnapshot;
  now: number;
  content: StationContent | null | undefined;
}) {
  const remainingSeconds =
    session.startedAt && session.durationMinutes
      ? Math.max(
          0,
          Math.round(
            (new Date(session.startedAt).getTime() + session.durationMinutes * 60 * 1000 - now) /
              1000,
          ),
        )
      : undefined;
  const elapsedSeconds = Math.max(
    0,
    Math.round((now - new Date(session.startedAt).getTime()) / 1000),
  );
  const expired = remainingSeconds !== undefined && remainingSeconds <= 0;
  const critical = !expired && remainingSeconds !== undefined && remainingSeconds <= 60;

  const stale = !telemetry || now - telemetry.timestamp > STALE_MS;
  const trackPreview = findTrackPreview(session.track, content);
  const trackName = session.track ? findTrackName(session.track, content) : undefined;
  const car = findCar(session.carAcId, content);
  const carName = session.carAcId ? formatCarName(car?.name, session.carAcId) : undefined;
  const difficulty = session.difficulty ? DIFFICULTY_STYLE[session.difficulty] : undefined;

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-xl border bg-dark-800/70 ${
        critical ? 'border-red-500/50' : 'border-dark-600'
      }`}
      style={critical ? { boxShadow: '0 0 24px -10px rgba(255,51,51,0.6)' } : undefined}
    >
      {trackPreview ? (
        <img
          src={trackPreview}
          alt={trackName}
          className="absolute inset-0 h-full w-full object-cover opacity-20"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent-orange/10 via-dark-900 to-dark-950" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-dark-900/95 via-dark-900/50 to-transparent" />

      <div className="relative z-10 flex h-full flex-col justify-between p-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-1">
            <p className="truncate text-[9px] font-bold uppercase tracking-widest text-accent-orange">
              {session.station.name}
            </p>
            {difficulty && (
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                style={{ backgroundColor: `${difficulty.color}22`, color: difficulty.color }}
              >
                {difficulty.label}
              </span>
            )}
          </div>
          <h3 className="truncate text-base font-black uppercase leading-tight text-white">
            {session.clientName || session.station.name}
          </h3>
          <p className="truncate text-[11px] text-gray-400">
            {carName ?? '—'}
            {trackName ? ` · ${trackName}` : ''}
          </p>
        </div>

        <div className="mt-2 flex items-end justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-wide text-gray-500">Vitesse</p>
            <p
              className={`font-mono text-xl font-bold tabular-nums ${stale ? 'text-gray-500' : 'text-accent-blue'}`}
            >
              {stale ? '—' : Math.round(telemetry!.speedKmh)}
              <span className="ml-1 text-[10px] text-gray-500">km/h</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wide text-gray-500">
              {remainingSeconds !== undefined ? 'Restant' : 'Écoulé'}
            </p>
            <p
              className={`font-mono text-xl font-bold tabular-nums ${
                expired ? 'text-red-500' : critical ? 'animate-blink text-red-400' : 'text-white'
              }`}
            >
              {expired ? '00:00' : formatClock(remainingSeconds ?? elapsedSeconds)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
