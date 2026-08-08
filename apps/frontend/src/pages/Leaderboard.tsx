import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { formatCarName, formatTrackAcId, formatTrackName } from '@simracing/shared';
import { PageTransition } from '../components/PageTransition';
import { useContentLabelMap } from '../services/contentLabels';
import {
  useLeaderboard,
  type LeaderboardCarGroup,
  type LeaderboardCircuit,
  type LeaderboardEntry,
} from '../services/leaderboard';
import { formatDuration } from '../utils/time';
import {
  Calendar,
  Car,
  CircleGauge,
  Crown,
  Flag,
  Image as ImageIcon,
  MapPin,
  Trophy,
  Users,
} from 'lucide-react';

// Écart affiché au centième, cohérent avec formatDuration() et avec la
// précision à laquelle les temps sont désormais arrondis côté backend
// (roundToCentiseconds dans leaderboard.service.ts).
function formatGap(ms: number): string {
  return `+${(ms / 1000).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const MEDAL_HEX = ['#f5c451', '#c9d4de', '#cd8b4f'];

export function Leaderboard() {
  const { data: circuits, isLoading } = useLeaderboard();
  const labelMap = useContentLabelMap();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...(circuits ?? [])].sort((a, b) => b.sessionsCount - a.sessionsCount),
    [circuits],
  );
  const key = (c: LeaderboardCircuit) => `${c.track}::${c.trackLayout}`;
  const selected = sorted.find((c) => key(c) === selectedKey) ?? sorted[0];

  const totals = useMemo(() => {
    const drivers = new Set<string>();
    const cars = new Set<string>();
    let sessions = 0;
    for (const c of sorted) {
      sessions += c.sessionsCount;
      for (const g of c.cars) {
        cars.add(g.carAcId);
        for (const e of g.entries) drivers.add(e.driver);
      }
    }
    return { circuits: sorted.length, sessions, drivers: drivers.size, cars: cars.size };
  }, [sorted]);

  return (
    <PageTransition>
      <div className="flex flex-col gap-6">
        <Header />

        {isLoading ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-md border border-white/[0.07] bg-dark-800/40 text-gray-500">
            Chargement…
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <StatBand totals={totals} />

            <div className="flex flex-col gap-3">
              <SectionLabel>Sélection du circuit</SectionLabel>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(215px,1fr))] gap-3">
                {sorted.map((c, i) => (
                  <CircuitCard
                    key={key(c)}
                    circuit={c}
                    index={i}
                    active={key(c) === key(selected)}
                    labelMap={labelMap}
                    onSelect={() => setSelectedKey(key(c))}
                  />
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {selected && (
                <motion.div
                  key={key(selected)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-6"
                >
                  <div className="grid grid-cols-1 items-stretch gap-[18px] lg:grid-cols-[minmax(0,1fr),minmax(0,1.15fr)]">
                    <CircuitHero circuit={selected} labelMap={labelMap} />
                    <RecordBanner circuit={selected} labelMap={labelMap} />
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2.5">
                      <Diamond />
                      <span className="whitespace-nowrap font-hud text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                        Classement par voiture
                      </span>
                      <span className="h-px flex-1 bg-gradient-to-r from-white/[0.09] to-transparent" />
                      <span className="whitespace-nowrap font-hud-mono text-[11.5px] text-gray-600">
                        {selected.cars.length} voiture{selected.cars.length > 1 ? 's' : ''} · top 3
                        par voiture
                      </span>
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
                      {selected.cars.map((group, i) => (
                        <CarLeaderboardCard
                          key={group.carAcId}
                          group={group}
                          index={i}
                          isCircuitRecord={group.carAcId === selected.record.carAcId}
                          circuitRecordMs={selected.record.timeMs}
                          labelMap={labelMap}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </PageTransition>
  );
}

function Diamond({ color = 'bg-racing-cyan' }: { color?: string }) {
  return (
    <span className={`h-[5px] w-[5px] shrink-0 rotate-45 ${color} shadow-[0_0_8px_currentColor]`} />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <Diamond />
      <span className="whitespace-nowrap font-hud text-xs font-bold uppercase tracking-[0.16em] text-racing-cyan">
        {children}
      </span>
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-wrap items-end gap-6">
      <div className="min-w-[260px] flex-1">
        <div className="mb-2.5 flex items-center gap-2.5">
          <Diamond />
          <span className="font-hud text-xs font-semibold uppercase tracking-[0.16em] text-racing-cyan">
            Meilleurs tours par circuit et par voiture
          </span>
        </div>
        <h1 className="font-hud text-[clamp(34px,4.4vw,48px)] font-bold leading-none tracking-tight text-white">
          Classe
          <span className="bg-gradient-to-r from-racing-blue to-racing-cyan bg-clip-text text-transparent">
            ment
          </span>
        </h1>
        <p className="mt-2.5 font-hud-mono text-xs text-gray-500">
          Agrégé depuis les sessions terminées — meilleur tour par pilote et voiture
        </p>
      </div>
      <div className="flex h-[38px] items-center gap-2 whitespace-nowrap rounded-md border border-white/[0.09] bg-white/[0.03] px-3.5 font-hud text-sm font-semibold text-gray-300">
        <Calendar className="h-3.5 w-3.5 text-racing-cyan" /> Depuis toujours
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-md border border-white/[0.07] bg-dark-800/40">
      <div className="flex max-w-[440px] flex-col items-center gap-3.5 p-10 text-center">
        <div className="flex h-[62px] w-[62px] items-center justify-center rounded-full border border-racing-cyan/30 bg-racing-cyan/[0.06] text-racing-cyan">
          <Trophy className="h-7 w-7" />
        </div>
        <h3 className="font-hud text-2xl font-bold text-white">Aucune session terminée</h3>
        <p className="text-[13.5px] leading-relaxed text-gray-400">
          Le classement se remplit automatiquement dès qu'une course se termine sur un poste, avec
          au moins un tour sans coupure. Les temps sont extraits des résultats de session.
        </p>
      </div>
    </div>
  );
}

function StatBand({
  totals,
}: {
  totals: { circuits: number; sessions: number; drivers: number; cars: number };
}) {
  const items = [
    { icon: MapPin, label: 'Circuits courus', value: totals.circuits },
    { icon: Flag, label: 'Sessions terminées', value: totals.sessions },
    { icon: Users, label: 'Pilotes classés', value: totals.drivers },
    { icon: Car, label: 'Voitures classées', value: totals.cars },
  ];
  return (
    <div className="grid grid-cols-2 border-y border-white/[0.07] py-4 sm:grid-cols-4">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`flex min-w-0 flex-col px-4 first:pl-0 last:pr-0 ${
            i > 0 ? 'border-l border-white/[0.06]' : ''
          }`}
        >
          <div className="flex items-center gap-1.5">
            <item.icon className="h-3.5 w-3.5 shrink-0 text-racing-cyan" />
            <span className="whitespace-nowrap font-hud text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
              {item.label}
            </span>
          </div>
          <div className="mt-1.5 font-hud text-[30px] font-bold leading-none text-white">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function CircuitCard({
  circuit,
  index,
  active,
  labelMap,
  onSelect,
}: {
  circuit: LeaderboardCircuit;
  index: number;
  active: boolean;
  labelMap: ReturnType<typeof useContentLabelMap>;
  onSelect: () => void;
}) {
  const name = formatTrackName(undefined, circuit.track, labelMap);
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative overflow-hidden rounded-md text-left transition-colors ${
        active
          ? 'border border-racing-cyan/55 shadow-[0_0_0_1px_rgba(0,194,255,.12),0_0_26px_rgba(0,120,255,.18)]'
          : 'border border-white/[0.07] hover:border-racing-cyan/45'
      }`}
    >
      <div className="absolute inset-0 opacity-40">
        {circuit.previewUrl ? (
          <img
            src={circuit.previewUrl}
            alt={name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-dark-900">
            <ImageIcon className="h-6 w-6 text-gray-700" />
          </div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-dark-950/35 to-dark-950/[0.92]" />
      {active && (
        <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-racing-blue to-racing-cyan shadow-[0_0_12px_rgba(0,160,255,.7)]" />
      )}
      <div className="relative flex min-h-[104px] flex-col justify-end gap-1 px-[13px] py-3">
        <div className="text-balance font-hud text-[19px] font-bold leading-[1.05] text-white">
          {name}
        </div>
        <div className="font-hud-mono text-[11px] text-gray-500">
          {circuit.trackLayout ? formatTrackAcId(circuit.trackLayout) : circuit.track}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="font-hud-mono text-[12.5px] text-[#7fdcff]">
            {formatDuration(circuit.record.timeMs)}
          </span>
          <span className="whitespace-nowrap font-hud text-xs font-semibold text-gray-500">
            {circuit.sessionsCount} sess.
          </span>
        </div>
      </div>
    </motion.button>
  );
}

function CornerBrackets({ color }: { color: string }) {
  return (
    <>
      <span
        className="absolute right-2 top-2 h-3.5 w-3.5 border-t border-r"
        style={{ borderColor: color }}
      />
      <span
        className="absolute bottom-2 left-2 h-3.5 w-3.5 border-b border-l"
        style={{ borderColor: color }}
      />
    </>
  );
}

function CircuitHero({
  circuit,
  labelMap,
}: {
  circuit: LeaderboardCircuit;
  labelMap: ReturnType<typeof useContentLabelMap>;
}) {
  const name = formatTrackName(undefined, circuit.track, labelMap);
  return (
    <div className="relative min-h-[300px] animate-fade-in-up overflow-hidden rounded-md border border-racing-cyan/[0.22] bg-gradient-to-br from-racing-blue/10 to-dark-800/60">
      <span className="absolute inset-y-0 left-0 z-[3] w-[3px] bg-gradient-to-b from-racing-blue to-racing-cyan shadow-[0_0_12px_rgba(0,160,255,.7)]" />
      <CornerBrackets color="rgba(0,194,255,.55)" />

      <div className="absolute inset-0">
        {circuit.previewUrl ? (
          <img src={circuit.previewUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-dark-900">
            <MapPin className="h-12 w-12 text-gray-700" />
          </div>
        )}
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,rgba(8,8,12,.15),rgba(8,8,12,.9)_78%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-dark-950/55 via-transparent to-dark-950/[0.94]" />
      {/* Balayage HUD décoratif — pas une trajectoire réelle : aucune position
          GPS n'est enregistrée après coup aujourd'hui (seulement en direct
          pendant une session), donc ce n'est pas le tracé du tour record,
          juste un effet "scan radar" cohérent avec le thème racing. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="absolute inset-y-0 w-[22%] animate-circuit-sweep bg-gradient-to-r from-transparent via-racing-cyan/10 to-transparent" />
      </div>

      <div className="relative z-[2] flex min-h-full flex-col justify-between gap-5 p-4 sm:p-[18px]">
        <div>
          {circuit.previewUrl ? (
            <span className="flex w-fit items-center gap-1.5 rounded border border-racing-cyan/40 bg-racing-cyan/10 px-2.5 py-1 font-hud text-xs font-bold uppercase tracking-wider text-[#7fdcff]">
              <ImageIcon className="h-3.5 w-3.5" /> Preview scannée
            </span>
          ) : (
            <span className="flex w-fit items-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-2.5 py-1 font-hud text-xs font-bold uppercase tracking-wider text-gray-500">
              <ImageIcon className="h-3.5 w-3.5" /> Pas de preview
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="font-hud text-[clamp(26px,2.6vw,34px)] font-bold leading-none text-white">
            {name}
          </div>
          <div className="font-hud-mono text-xs text-[#8fb6cf]">
            {circuit.track}
            {circuit.trackLayout ? ` · ${formatTrackAcId(circuit.trackLayout)}` : ''}
          </div>
          <div className="mt-1 flex items-stretch gap-0 border-t border-white/[0.09] pt-2.5">
            <HeroStat label="Sessions" value={circuit.sessionsCount} />
            <HeroStat label="Pilotes" value={circuit.driversCount} bordered />
            <HeroStat label="Voitures" value={circuit.carsCount} bordered />
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  bordered,
}: {
  label: string;
  value: number;
  bordered?: boolean;
}) {
  return (
    <div
      className={`min-w-0 flex-1 px-3.5 first:pl-0 ${bordered ? 'border-l border-white/[0.08]' : ''}`}
    >
      <div className="font-hud text-[11.5px] font-semibold uppercase tracking-[0.12em] text-gray-500">
        {label}
      </div>
      <div className="mt-1 font-hud text-[19px] font-bold text-white">{value}</div>
    </div>
  );
}

function RecordBanner({
  circuit,
  labelMap,
}: {
  circuit: LeaderboardCircuit;
  labelMap: ReturnType<typeof useContentLabelMap>;
}) {
  return (
    <div className="relative flex min-h-[300px] animate-[fade-in-up_0.5s_ease_both,gold-glow_4.5s_ease-in-out_infinite] flex-col justify-between gap-[18px] overflow-hidden rounded-md border border-gold/40 bg-gradient-to-br from-gold/[0.14] to-dark-800/60 p-4 sm:p-5">
      <span
        className="absolute inset-y-0 left-0 bg-gradient-to-b from-gold to-gold-dark"
        style={{ width: 3 }}
      />
      <span className="absolute right-2 top-2 h-3.5 w-3.5 border-r border-t border-gold/50" />

      <div className="flex items-center gap-2.5">
        <Diamond color="bg-gold" />
        <span className="whitespace-nowrap font-hud text-xs font-bold uppercase tracking-[0.16em] text-gold">
          Record du circuit
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-gold/30 to-transparent" />
        <span className="whitespace-nowrap font-hud text-[11.5px] font-semibold uppercase tracking-wider text-gray-500">
          Toutes voitures
        </span>
      </div>

      <PodiumRow podium={circuit.podium} labelMap={labelMap} />

      <div className="grid grid-cols-3 items-stretch border-t border-gold/[0.18] pt-3">
        <div className="min-w-0 pr-3.5">
          <div className="font-hud text-[11.5px] font-semibold uppercase tracking-[0.12em] text-gray-500">
            {circuit.record.sessionType ? 'Session' : 'Poste'}
          </div>
          <div className="mt-1 truncate text-[13px] text-gray-200">
            {circuit.record.sessionType ?? circuit.record.stationName}
          </div>
        </div>
        <div className="border-l border-white/[0.07] px-3.5">
          <div className="font-hud text-[11.5px] font-semibold uppercase tracking-[0.12em] text-gray-500">
            Poste
          </div>
          <div className="mt-1 truncate text-[13px] text-gray-200">
            {circuit.record.stationName}
          </div>
        </div>
        <div className="border-l border-white/[0.07] pl-3.5 text-right">
          <div className="whitespace-nowrap font-hud text-[11.5px] font-semibold uppercase tracking-[0.12em] text-gray-500">
            Avance sur le 2e
          </div>
          <div className="mt-1 font-hud-mono text-[13px] text-[#7fdcff]">
            {circuit.recordGapMs === null ? '—' : formatGap(circuit.recordGapMs)}
          </div>
          <div className="mt-0.5 font-hud-mono text-[10.5px] text-gray-600">
            {formatDate(circuit.record.date)}
          </div>
        </div>
      </div>
    </div>
  );
}

const PODIUM_PLACE_STYLE = {
  1: {
    order: 'order-2',
    width: 'w-[38%] max-w-[160px]',
    pad: 'pt-4 pb-6',
    border: 'border-gold/55',
    bg: 'bg-gold/[0.1]',
    glow: 'shadow-[0_0_26px_-6px_rgba(245,196,81,0.4)]',
    nameSize: 'text-[15px]',
    timeSize: 'text-lg',
    timeColor: 'text-gold-text',
  },
  2: {
    order: 'order-1',
    width: 'w-[31%] max-w-[130px]',
    pad: 'pt-3 pb-4',
    border: 'border-white/10',
    bg: 'bg-white/[0.03]',
    glow: '',
    nameSize: 'text-[13px]',
    timeSize: 'text-sm',
    timeColor: 'text-gray-200',
  },
  3: {
    order: 'order-3',
    width: 'w-[31%] max-w-[130px]',
    pad: 'pt-3 pb-3',
    border: 'border-white/10',
    bg: 'bg-white/[0.03]',
    glow: '',
    nameSize: 'text-[13px]',
    timeSize: 'text-sm',
    timeColor: 'text-gray-200',
  },
} as const;

/** Podium propre à 3 marches (2e à gauche, 1er au centre en plus grand, 3e
 * à droite) — dégrade proprement à 1 ou 2 marches si le circuit n'a pas
 * encore assez de temps classés, sans placeholders vides. */
function PodiumRow({
  podium,
  labelMap,
}: {
  podium: (LeaderboardEntry & { carAcId: string })[];
  labelMap: ReturnType<typeof useContentLabelMap>;
}) {
  return (
    <div className="flex flex-1 items-end justify-center gap-3">
      {podium.map((entry, i) => (
        <PodiumStep
          key={entry.sessionId}
          entry={entry}
          place={(i + 1) as 1 | 2 | 3}
          labelMap={labelMap}
        />
      ))}
    </div>
  );
}

function PodiumStep({
  entry,
  place,
  labelMap,
}: {
  entry: LeaderboardEntry & { carAcId: string };
  place: 1 | 2 | 3;
  labelMap: ReturnType<typeof useContentLabelMap>;
}) {
  const carName = formatCarName(undefined, entry.carAcId, labelMap);
  const color = MEDAL_HEX[place - 1];
  const style = PODIUM_PLACE_STYLE[place];

  return (
    <Link
      to={`/sessions/${entry.sessionId}`}
      className={`flex flex-col items-center rounded-lg border px-2.5 text-center transition-transform hover:-translate-y-0.5 ${style.order} ${style.width} ${style.pad} ${style.border} ${style.bg} ${style.glow}`}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-hud text-xs font-black"
        style={{ color, borderColor: `${color}55`, backgroundColor: `${color}18`, borderWidth: 1 }}
      >
        {place === 1 ? <Crown className="h-4 w-4" /> : place}
      </span>
      <p className={`mt-2 w-full truncate font-hud font-bold text-white ${style.nameSize}`}>
        {entry.driver}
      </p>
      <p className="w-full truncate text-[11px] text-gray-400">{carName}</p>
      <p className={`mt-1.5 font-hud-mono font-bold ${style.timeSize} ${style.timeColor}`}>
        {formatDuration(entry.timeMs)}
      </p>
    </Link>
  );
}

function CarLeaderboardCard({
  group,
  index,
  isCircuitRecord,
  circuitRecordMs,
  labelMap,
}: {
  group: LeaderboardCarGroup;
  index: number;
  isCircuitRecord: boolean;
  circuitRecordMs: number;
  labelMap: ReturnType<typeof useContentLabelMap>;
}) {
  const carName = formatCarName(undefined, group.carAcId, labelMap);
  const best = group.entries[0];
  const extra = group.totalEntries - group.entries.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.06 + index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className={`relative flex flex-col overflow-hidden rounded-md bg-dark-800/50 transition-colors ${
        isCircuitRecord
          ? 'border border-gold/35 shadow-[0_0_0_1px_rgba(245,196,81,.06)]'
          : 'border border-white/[0.07] hover:border-racing-cyan/30'
      }`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-0.5 ${
          isCircuitRecord
            ? 'bg-gradient-to-b from-gold to-gold-dark'
            : 'bg-gradient-to-b from-racing-blue to-racing-cyan opacity-55'
        }`}
      />

      <div className="flex items-center gap-3 border-b border-white/[0.06] px-3.5 py-3">
        <div className="flex h-[38px] w-[58px] shrink-0 items-center justify-center overflow-hidden rounded border border-white/[0.08] bg-white/[0.03]">
          {group.previewUrl ? (
            <img src={group.previewUrl} alt={carName} className="h-full w-full object-cover" />
          ) : (
            <Car className="h-4 w-4 text-gray-700" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-balance font-hud text-[17px] font-bold leading-[1.15] text-white">
            {carName}
          </div>
          <div className="mt-0.5 truncate font-hud-mono text-[10.5px] text-gray-600">
            {group.carAcId}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-hud-mono text-base font-bold text-[#7fdcff]">
            {formatDuration(best.timeMs)}
          </div>
          <div className="mt-0.5 font-hud-mono text-[11px] text-gray-600">
            {isCircuitRecord ? (
              <span className="font-hud font-bold uppercase tracking-wide text-gold">Record</span>
            ) : (
              `${formatGap(best.timeMs - circuitRecordMs)} / record`
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col px-2 py-1.5">
        {group.entries.map((entry: LeaderboardEntry, i: number) => (
          <Link
            key={entry.sessionId}
            to={`/sessions/${entry.sessionId}`}
            style={{ animationDelay: `${0.06 * index + 0.04 * i + 0.12}s` }}
            className="grid animate-row-in grid-cols-[24px,minmax(110px,1fr),76px,58px] items-center gap-2 rounded px-2 py-[7px] transition-colors hover:bg-white/[0.045]"
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full font-hud text-xs font-bold"
              style={{
                color: MEDAL_HEX[i],
                borderColor: `${MEDAL_HEX[i]}55`,
                backgroundColor: `${MEDAL_HEX[i]}18`,
                borderWidth: 1,
              }}
            >
              {i + 1}
            </span>
            <span className="min-w-0 truncate text-sm font-medium text-gray-200">
              {entry.driver}
            </span>
            <span className="text-right font-hud-mono text-[13.5px] text-gray-200">
              {formatDuration(entry.timeMs)}
            </span>
            <span className="text-right font-hud-mono text-[11.5px] text-gray-600">
              {i === 0 ? '—' : formatGap(entry.timeMs - best.timeMs)}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-0.5 flex items-center justify-between gap-2.5 border-t border-white/[0.05] px-2.5 py-2">
        <span className="whitespace-nowrap font-hud text-xs font-semibold tracking-wide text-gray-600">
          {extra > 0 ? `+${extra} temps` : `${group.totalEntries} temps`}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-700">
          <CircleGauge className="h-3 w-3" /> tours propres uniquement
        </span>
      </div>
    </motion.div>
  );
}
