import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageTransition } from '../components/PageTransition';
import { stationsApi, type Station } from '../services/stations';
import { dedicatedServersApi, type DedicatedServer } from '../services/dedicatedServers';
import { sessionsApi, type ActiveSession } from '../services/sessions';
import { findTrackName } from '../utils/track';
import { useContentLabelMap, type ContentLabelMap } from '../services/contentLabels';
import {
  Monitor,
  Server,
  Play,
  Zap,
  ArrowRight,
  Plus,
  Tv,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    const start = prevTarget.current;
    const startTime = performance.now();
    let raf = 0;

    function tick(now: number) {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevTarget.current = target;
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const GAUGE_R = 60;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_R;

/** Segmented dash pattern (one dash per POD) matching the Claude Design
 * "Dashboard HUD" gauge — a background track for every POD, and a shorter
 * colored arc that only "draws" the online ones, then a huge trailing gap
 * (1000) so the pattern never wraps around and repeats. */
function gaugeDashArrays(total: number, filled: number): { track: string; fill: string } {
  if (total <= 0) return { track: '0 1000', fill: '0 1000' };
  const gap = 5;
  const dash = Math.max(1, GAUGE_CIRCUMFERENCE / total - gap);
  const unit = `${dash.toFixed(2)} ${gap}`;
  const track = `${Array(total).fill(unit).join(' ')} 0 1000`;
  const fill = filled > 0 ? `${Array(filled).fill(unit).join(' ')} 0 1000` : '0 1000';
  return { track, fill };
}

const STATUS_VARIANT: Record<
  Station['status'],
  {
    border: string;
    bg: string;
    bar: string;
    dot: string;
    num: string;
    label: string;
    labelColor: string;
    pulse?: boolean;
  }
> = {
  online: {
    border: 'border-emerald-500/25',
    bg: 'bg-gradient-to-br from-emerald-500/10 to-dark-900/50',
    bar: 'bg-emerald-400',
    dot: 'bg-emerald-400 shadow-[0_0_9px_#24d17e]',
    num: 'text-emerald-400',
    label: 'En ligne',
    labelColor: 'text-emerald-400',
  },
  in_game: {
    border: 'border-racing-cyan/30',
    bg: 'bg-gradient-to-br from-racing-cyan/10 to-dark-900/50',
    bar: 'bg-gradient-to-b from-racing-blue to-racing-cyan',
    dot: 'bg-racing-cyan shadow-[0_0_9px_#00c2ff]',
    num: 'text-racing-cyan',
    label: 'En jeu',
    labelColor: 'text-racing-cyan',
    pulse: true,
  },
  updating: {
    border: 'border-purple-400/25',
    bg: 'bg-gradient-to-br from-purple-400/10 to-dark-900/50',
    bar: 'bg-purple-400',
    dot: 'bg-purple-400 shadow-[0_0_9px_#a855f7]',
    num: 'text-purple-300',
    label: 'Mise à jour',
    labelColor: 'text-purple-300',
    pulse: true,
  },
  offline: {
    border: 'border-orange-500/20',
    bg: 'bg-dark-900/45',
    bar: 'bg-orange-400',
    dot: 'bg-orange-400 shadow-[0_0_9px_#ff7a1a]',
    num: 'text-orange-400',
    label: 'Hors ligne',
    labelColor: 'text-orange-400',
  },
};

/**
 * Racing-blue HUD dashboard — from the same Claude Design mockup as the
 * kiosk (`Kiosk.tsx`) and the agent's in-game blanking screens. The sidebar
 * nav/topbar are NOT reimplemented here (they come from the shared
 * `Layout.tsx` every protected page already uses) — this component owns
 * only the page content that sits inside it.
 */
export function Dashboard() {
  const labelMap = useContentLabelMap();
  const { data: stations } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
    refetchInterval: 5000,
  });
  const { data: servers } = useQuery({
    queryKey: ['dedicated-servers'],
    queryFn: dedicatedServersApi.getAll,
    refetchInterval: 10000,
  });
  const { data: sessions } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: sessionsApi.getActive,
    refetchInterval: 10000,
  });

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const simulatorStations = useMemo(
    () =>
      (stations ?? [])
        .filter((s) => s.role === 'simulator')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [stations],
  );
  const adminStations = useMemo(
    () =>
      (stations ?? [])
        .filter((s) => s.role === 'admin')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [stations],
  );

  const onlinePods = simulatorStations.filter(
    (s) => s.status === 'online' || s.status === 'in_game',
  ).length;
  const inGamePods = simulatorStations.filter((s) => s.status === 'in_game').length;
  const offlinePods = simulatorStations.length - onlinePods;
  const fleetPct =
    simulatorStations.length > 0 ? Math.round((onlinePods / simulatorStations.length) * 100) : 0;

  const activeSessions = useMemo(() => sessions ?? [], [sessions]);
  const runningServers = useMemo(
    () => (servers ?? []).filter((s) => s.status === 'running'),
    [servers],
  );
  const serverOccupancy = useMemo(() => {
    const map = new Map<string, number>();
    activeSessions.forEach((s) => {
      if (!s.serverId) return;
      map.set(s.serverId, (map.get(s.serverId) ?? 0) + 1);
    });
    return map;
  }, [activeSessions]);

  const displayedOnline = useCountUp(onlinePods);
  const displayedInGame = useCountUp(inGamePods);
  const displayedRunning = useCountUp(runningServers.length);
  const displayedSessions = useCountUp(activeSessions.length);

  const gauge = gaugeDashArrays(simulatorStations.length, onlinePods);
  const totalServers = servers?.length ?? 0;

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* HERO */}
        <section className="flex flex-wrap items-start gap-9 border-b border-white/10 pb-7">
          <div className="min-w-[280px] flex-1">
            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="h-[5px] w-[5px] rotate-45 bg-racing-cyan shadow-[0_0_8px_#00c2ff]" />
              <span className="whitespace-nowrap font-hud text-xs font-semibold uppercase tracking-[0.16em] text-racing-cyan">
                Poste de contrôle · temps réel
              </span>
            </div>
            <h1 className="font-hud text-[clamp(38px,5.2vw,62px)] font-bold leading-[0.94] tracking-tight text-white">
              Dashboard
              <br />
              <span className="bg-gradient-to-r from-racing-blue to-racing-cyan bg-clip-text text-transparent">
                technique
              </span>
            </h1>
            <p className="mt-3.5 font-hud-mono text-xs text-gray-500">
              Infrastructure SimRacing · {simulatorStations.length} POD · {adminStations.length}{' '}
              poste
              {adminStations.length > 1 ? 's' : ''} admin · {totalServers} serveur
              {totalServers > 1 ? 's' : ''} dédié{totalServers > 1 ? 's' : ''}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                to="/dedicated-servers/create"
                className="flex items-center gap-2 whitespace-nowrap rounded-md bg-gradient-to-r from-racing-blue to-racing-cyan px-5 py-2.5 font-hud text-sm font-bold tracking-wide text-dark-950 shadow-[0_0_26px_rgba(0,120,255,0.3)] transition-shadow hover:shadow-[0_0_36px_rgba(0,150,255,0.5)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau serveur
              </Link>
              <Link
                to="/stations"
                className="flex items-center gap-2 whitespace-nowrap rounded-md border border-white/10 px-4 py-2.5 font-hud text-sm font-bold tracking-wide text-gray-300 transition-colors hover:border-racing-cyan/40 hover:text-sky-200"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Gérer le parc
              </Link>
            </div>
          </div>

          <div className="flex flex-none items-center gap-5">
            <svg viewBox="0 0 160 160" width="176" height="176" className="overflow-visible">
              <circle
                cx="80"
                cy="80"
                r={GAUGE_R}
                fill="none"
                stroke="rgba(255,255,255,.07)"
                strokeWidth="12"
                strokeDasharray={gauge.track}
                transform="rotate(135 80 80)"
              />
              <circle
                cx="80"
                cy="80"
                r={GAUGE_R}
                fill="none"
                stroke="#00c2ff"
                strokeWidth="12"
                strokeDasharray={gauge.fill}
                transform="rotate(135 80 80)"
                style={{ filter: 'drop-shadow(0 0 10px rgba(0,180,255,.5))' }}
              />
              <circle
                cx="80"
                cy="80"
                r="74"
                fill="none"
                stroke="rgba(0,194,255,.18)"
                strokeWidth="1"
                strokeDasharray="2 7"
              />
              <text
                x="80"
                y="84"
                textAnchor="middle"
                fill="#ffffff"
                style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 46, fontWeight: 700 }}
              >
                {fleetPct}
                <tspan fill="#00c2ff" style={{ fontSize: 24 }}>
                  %
                </tspan>
              </text>
              <text
                x="80"
                y="104"
                textAnchor="middle"
                fill="#7fdcff"
                style={{
                  fontFamily: 'Rajdhani, sans-serif',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '.2em',
                }}
              >
                PARC DISPO
              </text>
            </svg>
            <div className="flex flex-col gap-3.5 border-l border-white/10 pl-5">
              <div>
                <p className="font-hud text-[11px] font-semibold tracking-wider text-gray-400">
                  Disponibles
                </p>
                <p className="whitespace-nowrap font-hud text-2xl font-bold leading-none text-emerald-400">
                  {onlinePods} POD
                </p>
              </div>
              <div>
                <p className="font-hud text-[11px] font-semibold tracking-wider text-gray-400">
                  Hors ligne
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`whitespace-nowrap font-hud text-2xl font-bold leading-none ${
                      offlinePods > 0 ? 'text-orange-400' : 'text-gray-600'
                    }`}
                    style={
                      offlinePods > 0 ? { textShadow: '0 0 18px rgba(255,122,26,.4)' } : undefined
                    }
                  >
                    {offlinePods} POD
                  </span>
                  {offlinePods > 0 && <AlertTriangle className="h-4 w-4 text-orange-400" />}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TÉLÉMÉTRIE */}
        <section className="grid grid-cols-2 gap-4 border-y border-white/10 py-4 sm:grid-cols-4">
          <TelemetryStat
            icon={Monitor}
            label="Postes en ligne"
            value={displayedOnline}
            suffix={`/${simulatorStations.length}`}
            iconColor="text-racing-cyan"
          />
          <TelemetryStat
            icon={Zap}
            label="Postes en jeu"
            value={displayedInGame}
            iconColor="text-sky-300"
            bordered
          />
          <TelemetryStat
            icon={Server}
            label="Serveurs en course"
            value={displayedRunning}
            suffix={`/${totalServers}`}
            iconColor="text-sky-300"
            bordered
          />
          <TelemetryStat
            icon={Play}
            label="Sessions actives"
            value={displayedSessions}
            iconColor="text-sky-300"
            bordered
          />
        </section>

        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.85fr)_minmax(280px,1fr)]">
          {/* PARC */}
          <div className="flex min-w-0 flex-col gap-7">
            <section className="min-w-0">
              <div className="mb-3.5 flex flex-wrap items-center gap-3.5">
                <h2 className="whitespace-nowrap font-hud text-lg font-bold tracking-wide text-white">
                  Parc de simulateurs
                </h2>
                <span className="h-1 w-1 flex-none rotate-45 bg-racing-cyan" />
                <span className="whitespace-nowrap font-hud-mono text-[11px] text-gray-500">
                  {simulatorStations.length} POD · temps réel
                </span>
                <div className="h-px min-w-[12px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                <Link
                  to="/stations"
                  className="flex flex-none items-center gap-1.5 whitespace-nowrap font-hud text-sm font-bold text-racing-cyan hover:text-sky-300"
                >
                  Gérer <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {simulatorStations.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 py-8 text-center text-sm text-gray-500">
                  Aucun poste simulateur enregistré.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {simulatorStations.map((station, i) => (
                    <PodCard key={station.id} station={station} index={i + 1} />
                  ))}
                </div>
              )}
            </section>

            {adminStations.length > 0 && (
              <section className="min-w-0">
                <div className="mb-3.5 flex items-center gap-3.5">
                  <h2 className="whitespace-nowrap font-hud text-lg font-bold tracking-wide text-white">
                    Poste{adminStations.length > 1 ? 's' : ''} admin
                  </h2>
                  <span className="h-1 w-1 flex-none rotate-45 bg-purple-400" />
                  <span className="whitespace-nowrap font-hud-mono text-[11px] text-gray-500">
                    hors parc simulateur
                  </span>
                  <div className="h-px min-w-[12px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                </div>
                <div className="flex flex-col gap-2.5">
                  {adminStations.map((station) => (
                    <AdminStationRow key={station.id} station={station} />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* LATÉRAL */}
          <div className="flex min-w-0 flex-col gap-7">
            <section className="relative overflow-hidden rounded-xl border border-racing-cyan/40 bg-gradient-to-br from-racing-blue/20 via-racing-cyan/[0.06] to-dark-900/50 px-5 pb-[18px] pt-5 shadow-[0_0_34px_rgba(0,90,255,0.18)]">
              <span className="absolute left-2 top-2 h-3.5 w-3.5 border-l border-t border-racing-cyan/80" />
              <span className="absolute right-2 top-2 h-3.5 w-3.5 border-r border-t border-racing-cyan/80" />
              <span className="absolute bottom-2 left-2 h-3.5 w-3.5 border-b border-l border-racing-cyan/80" />
              <span className="absolute bottom-2 right-2 h-3.5 w-3.5 border-b border-r border-racing-cyan/80" />

              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 flex-none place-items-center rounded-md border border-racing-cyan/40 bg-racing-cyan/10 text-sky-300">
                  <Tv className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="whitespace-nowrap font-hud text-xl font-bold text-white">
                    Mode kiosque
                  </p>
                  <p className="whitespace-nowrap font-hud-mono text-[11px] text-sky-200/70">
                    affichage salle
                  </p>
                </div>
              </div>
              <p className="mt-3.5 text-xs leading-relaxed text-gray-400">
                Bascule l'écran en vue publique : état des {simulatorStations.length} POD et
                sessions en cours, sans commandes.
              </p>
              <Link
                to="/kiosk"
                className="mt-3.5 flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-gradient-to-r from-racing-blue to-racing-cyan font-hud text-base font-bold tracking-wide text-dark-950 shadow-[0_0_24px_rgba(0,120,255,0.35)] transition-shadow hover:shadow-[0_0_38px_rgba(0,150,255,0.6)]"
              >
                <Play className="h-3.5 w-3.5" />
                Lancer le kiosque
              </Link>
            </section>

            <section>
              <SidebarHeader title="Serveurs en course" to="/dedicated-servers" />
              {runningServers.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 py-6 text-center text-sm text-gray-500">
                  Aucun serveur en course
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {runningServers.map((server) => (
                    <RunningServerCard
                      key={server.id}
                      server={server}
                      labelMap={labelMap}
                      occupied={serverOccupancy.get(server.id) ?? 0}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <SidebarHeader title="Sessions actives" to="/en-cours" />
              {activeSessions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 py-6 text-center text-sm text-gray-500">
                  Aucune session active
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {activeSessions.map((session) => (
                    <SessionRow key={session.id} session={session} now={now} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

function TelemetryStat({
  icon: Icon,
  label,
  value,
  suffix,
  iconColor,
  bordered,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  suffix?: string;
  iconColor: string;
  bordered?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-1.5 px-4 first:pl-0 ${bordered ? 'sm:border-l sm:border-white/10' : ''}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 flex-none ${iconColor}`} />
        <span className="whitespace-nowrap font-hud text-[11.5px] font-semibold tracking-wide text-gray-400">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-hud text-3xl font-bold leading-none text-white">{value}</span>
        {suffix && <span className="font-hud text-base font-semibold text-gray-600">{suffix}</span>}
      </div>
    </div>
  );
}

function SidebarHeader({ title, to }: { title: string; to: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-3">
      <h2 className="whitespace-nowrap font-hud text-base font-bold tracking-wide text-white">
        {title}
      </h2>
      <div className="h-px min-w-[8px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      <Link to={to} className="flex-none text-racing-cyan hover:text-sky-300">
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function PodCard({ station, index }: { station: Station; index: number }) {
  const v = STATUS_VARIANT[station.status];
  return (
    <div className={`relative overflow-hidden rounded-lg border p-3 ${v.border} ${v.bg}`}>
      <span className={`absolute inset-y-0 left-0 w-[2px] ${v.bar}`} />
      <div className="flex items-center justify-between">
        <span className={`font-hud-mono text-[11px] font-bold ${v.num}`}>
          {String(index).padStart(2, '0')}
        </span>
        <span
          className={`h-1.5 w-1.5 rounded-full ${v.dot} ${v.pulse ? 'animate-pulse-glow' : ''}`}
        />
      </div>
      <p className="mt-2 truncate font-hud text-base font-bold tracking-wide text-white">
        {station.name}
      </p>
      <p className="truncate font-hud-mono text-xs text-gray-500">{station.localIp ?? '—'}</p>
      <p className={`mt-2 font-hud text-xs font-bold ${v.labelColor}`}>{v.label}</p>
    </div>
  );
}

function AdminStationRow({ station }: { station: Station }) {
  const online = station.status === 'online' || station.status === 'in_game';
  return (
    <div className="relative flex flex-wrap items-center gap-3.5 overflow-hidden rounded-lg border border-purple-400/25 bg-gradient-to-r from-purple-400/10 to-dark-900/50 p-3.5">
      <span className="absolute inset-y-0 left-0 w-[2px] bg-purple-400 shadow-[0_0_9px_rgba(145,132,217,.6)]" />
      <div className="grid h-9 w-9 flex-none place-items-center rounded-md border border-purple-400/30 bg-purple-400/10 text-purple-200">
        <ShieldCheck className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-1.5 w-1.5 flex-none rounded-full ${
              online ? 'animate-pulse-glow bg-emerald-400 shadow-[0_0_9px_#24d17e]' : 'bg-gray-600'
            }`}
          />
          <span className="truncate font-hud text-lg font-bold tracking-wide text-white">
            {station.name}
          </span>
        </div>
        <p className="mt-0.5 truncate pl-4 font-hud-mono text-[11.5px] text-gray-500">
          {station.localIp ?? '—'} · v{station.version ?? '—'}
        </p>
      </div>
      <span className="flex-none rounded border border-purple-400/35 px-2.5 py-1 font-hud text-xs font-bold text-purple-200">
        Admin
      </span>
      <span
        className={`flex-none font-hud text-sm font-bold ${online ? 'text-emerald-400' : 'text-orange-400'}`}
      >
        {online ? 'En ligne' : 'Hors ligne'}
      </span>
    </div>
  );
}

function RunningServerCard({
  server,
  labelMap,
  occupied,
}: {
  server: DedicatedServer;
  labelMap: ContentLabelMap;
  occupied: number;
}) {
  const trackName = findTrackName(
    server.track,
    server.station.content as { tracks?: { acId: string; name: string }[] } | undefined,
    labelMap,
  );
  return (
    <div className="relative overflow-hidden rounded-lg border border-racing-cyan/20 bg-gradient-to-br from-racing-blue/10 to-dark-900/50 p-4">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-emerald-400 shadow-[0_0_8px_#24d17e]" />
        <span className="font-hud text-xs font-bold tracking-wide text-emerald-400">En cours</span>
      </div>
      <p className="mt-2 truncate font-hud text-xl font-bold tracking-wide text-white">
        {server.name}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
        <div>
          <p className="font-hud text-[11px] font-semibold tracking-wide text-gray-400">Circuit</p>
          <p className="mt-0.5 truncate font-hud text-base font-bold text-sky-200">{trackName}</p>
        </div>
        <div>
          <p className="font-hud text-[11px] font-semibold tracking-wide text-gray-400">Slots</p>
          <p className="mt-0.5 font-hud text-base font-bold text-sky-200">
            {occupied} / {server.maxClients}
          </p>
        </div>
      </div>
    </div>
  );
}

function SessionRow({ session, now }: { session: ActiveSession; now: number }) {
  const timeText = session.startedAt
    ? formatClock(
        session.durationMinutes
          ? Math.max(
              0,
              Math.round(
                (new Date(session.startedAt).getTime() + session.durationMinutes * 60000 - now) /
                  1000,
              ),
            )
          : Math.max(0, Math.round((now - new Date(session.startedAt).getTime()) / 1000)),
      )
    : '—';
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-white/[0.06] bg-dark-900/50 px-3.5 py-2.5">
      <span className="h-1.5 w-1.5 flex-none rounded-full bg-racing-cyan shadow-[0_0_8px_#00c2ff]" />
      <span className="min-w-0 flex-1 truncate font-hud text-base font-bold text-white">
        {session.station.name}
      </span>
      <span className="flex-none font-hud-mono text-[11.5px] text-gray-500">{timeText}</span>
    </div>
  );
}
