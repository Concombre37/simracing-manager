import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { dedicatedServersApi, type Car as AcCar, type Track } from '../services/dedicatedServers';
import { stationsApi, type Station } from '../services/stations';
import { formatTrackName, formatCarName } from '../utils/track';
import { useContentLabelMap, type ContentLabelMap } from '../services/contentLabels';
import { setWizardBackgroundStep } from '../components/PageBackground';
import { PageTransition } from '../components/PageTransition';
import { Input, Label } from '../components/ui/Input';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Monitor,
  MapPin,
  Car,
  Server,
  Search,
  Lock,
  Radio,
  Users,
  ImageOff,
  AlertCircle,
  RefreshCw,
  Flag,
  X,
  Minus,
  Layers,
  ChevronDown,
  Settings2,
  Eraser,
  ShieldCheck,
  CheckCircle2,
  CircleDashed,
} from 'lucide-react';

const DEFAULT_MAX_CLIENTS = 11;

/** Turns a per-car quantity map into the flat, possibly-repeated array the
 * backend expects — the dedicated server's entry list cycles through this
 * array round-robin to fill every slot (serverLauncher.ts), so a car
 * appearing N times here naturally ends up in ~N/total of the slots. */
function flattenCarCounts(counts: Record<string, number>): string[] {
  return Object.entries(counts).flatMap(([acId, count]) => Array(count).fill(acId) as string[]);
}

const STEPS = [
  { id: 1, label: 'Simulateur', icon: Monitor },
  { id: 2, label: 'Circuit', icon: MapPin },
  { id: 3, label: 'Configuration', icon: Server },
];

export function CreateDedicatedServer() {
  const navigate = useNavigate();
  const location = useLocation();
  // Also mounted at /kiosk/dedicated-servers/create (no sidebar, see
  // App.tsx) — must return there instead of the admin page, or "Annuler"/a
  // successful creation would drop the operator out of the kiosk shell.
  const backPath = location.pathname.startsWith('/kiosk') ? '/kiosk' : '/dedicated-servers';
  const queryClient = useQueryClient();
  const labelMap = useContentLabelMap();

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  useEffect(() => {
    setWizardBackgroundStep(step);
  }, [step]);

  const [stationId, setStationId] = useState('');
  const [trackId, setTrackId] = useState('');
  const [trackLayout, setTrackLayout] = useState('');
  const [trackSearch, setTrackSearch] = useState('');
  const [carSearch, setCarSearch] = useState('');
  const [carCounts, setCarCounts] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [maxClients, setMaxClients] = useState(DEFAULT_MAX_CLIENTS);
  const [password, setPassword] = useState('');
  const [rconPassword, setRconPassword] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const totalSelectedCars = useMemo(
    () => Object.values(carCounts).reduce((sum, n) => sum + n, 0),
    [carCounts],
  );

  // A lower slot count picked in Advanced must never leave more cars
  // selected than there is room for — trim the excess (highest counts
  // first, arbitrarily but deterministically by object key order) rather
  // than silently letting totalSelectedCars exceed maxClients.
  useEffect(() => {
    setCarCounts((prev) => {
      let total = Object.values(prev).reduce((sum, n) => sum + n, 0);
      if (total <= maxClients) return prev;
      const next = { ...prev };
      const keys = Object.keys(next);
      let i = 0;
      while (total > maxClients && keys.length > 0) {
        const key = keys[i % keys.length];
        if (next[key] > 0) {
          next[key] -= 1;
          total -= 1;
        }
        i += 1;
      }
      return next;
    });
  }, [maxClients]);

  const { data: stations, isLoading: stationsLoading } = useQuery({
    queryKey: ['stations'],
    queryFn: stationsApi.getAll,
  });

  const onlineStations = useMemo(
    () =>
      stations?.filter(
        (s) => s.role === 'admin' && (s.status === 'online' || s.status === 'in_game'),
      ) ?? [],
    [stations],
  );

  const selectedStation = useMemo(
    () => stations?.find((s) => s.id === stationId),
    [stations, stationId],
  );

  const content = useMemo<{ cars: AcCar[]; tracks: Track[] }>(() => {
    if (!selectedStation?.content) return { cars: [], tracks: [] };
    const c = selectedStation.content as { cars?: AcCar[]; tracks?: Track[] };
    return { cars: c.cars ?? [], tracks: c.tracks ?? [] };
  }, [selectedStation]);

  const selectedTrack = useMemo(
    () => content.tracks.find((t) => t.acId === trackId),
    [content.tracks, trackId],
  );

  const filteredTracks = useMemo(() => {
    const q = trackSearch.trim().toLowerCase();
    if (!q) return content.tracks;
    return content.tracks.filter(
      (t) =>
        formatTrackName(t.name, t.acId, labelMap).toLowerCase().includes(q) || t.acId.includes(q),
    );
  }, [content.tracks, trackSearch, labelMap]);

  const filteredCars = useMemo(() => {
    const q = carSearch.trim().toLowerCase();
    if (!q) return content.cars;
    return content.cars.filter(
      (c) => c.name.toLowerCase().includes(q) || c.acId.toLowerCase().includes(q),
    );
  }, [content.cars, carSearch]);

  const syncMutation = useMutation({
    mutationFn: (id: string) => stationsApi.syncContent(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['stations'] }),
  });

  const createMutation = useMutation({
    mutationFn: dedicatedServersApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dedicated-servers'] });
      navigate(backPath);
    },
  });

  function selectStation(id: string) {
    setStationId(id);
    setTrackId('');
    setTrackLayout('');
    setCarCounts({});
  }

  function selectTrack(track: Track) {
    setTrackId(track.acId);
    setTrackLayout(track.layouts.length > 0 ? track.layouts[0].name : '');
    if (!name) {
      setName(`Serveur ${formatTrackName(track.name, track.acId, labelMap)}`);
    }
  }

  function addCar(carAcId: string) {
    setCarCounts((prev) => {
      const total = Object.values(prev).reduce((sum, n) => sum + n, 0);
      // Picking a first car is the common case ("un seul type de voiture") —
      // fill every slot with it right away instead of leaving it at a count
      // of 1 and requiring a separate "remplir tous les slots" click.
      if (total === 0) return { [carAcId]: maxClients };
      if (total < maxClients) {
        return { ...prev, [carAcId]: (prev[carAcId] ?? 0) + 1 };
      }
      // Already at capacity (the common single-car case fills it in one
      // click) — picking a *different* car here must never be a dead end,
      // or mixing several cars would be impossible without first manually
      // removing slots one by one. Take a slot from whichever car currently
      // has the most, rather than blocking the click.
      const [donorId, donorCount] =
        Object.entries(prev)
          .filter(([id]) => id !== carAcId)
          .sort((a, b) => b[1] - a[1])[0] ?? [];
      if (!donorId || !donorCount) return prev;
      const next = { ...prev, [donorId]: donorCount - 1, [carAcId]: (prev[carAcId] ?? 0) + 1 };
      if (next[donorId] <= 0) delete next[donorId];
      return next;
    });
  }

  function removeCar(carAcId: string) {
    setCarCounts((prev) => {
      const current = prev[carAcId] ?? 0;
      if (current <= 0) return prev;
      const next = { ...prev, [carAcId]: current - 1 };
      if (next[carAcId] <= 0) delete next[carAcId];
      return next;
    });
  }

  function fillAllSlotsWith(carAcId: string) {
    setCarCounts({ [carAcId]: maxClients });
  }

  function clearCarSelection() {
    setCarCounts({});
  }

  function goNext() {
    if (!canProceed()) return;
    setDirection('next');
    setStep((s) => Math.min(3, s + 1));
  }

  function goPrev() {
    setDirection('prev');
    setStep((s) => Math.max(1, s - 1));
  }

  function canProceed(): boolean {
    if (step === 1) return !!stationId;
    if (step === 2) return !!trackId;
    return false;
  }

  const canSubmit =
    !!name.trim() && !!stationId && !!trackId && totalSelectedCars > 0 && maxClients >= 1;

  function handleSubmit() {
    if (!canSubmit) return;
    createMutation.mutate({
      name: name.trim(),
      stationId,
      track: trackId,
      ...(trackLayout && { trackLayout }),
      cars: flattenCarCounts(carCounts),
      maxClients,
      ...(password && { password }),
      ...(rconPassword && { rconPassword }),
    });
  }

  const slideVariants = {
    enter: (dir: 'next' | 'prev') => ({ opacity: 0, x: dir === 'next' ? 64 : -64 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: 'next' | 'prev') => ({ opacity: 0, x: dir === 'next' ? -64 : 64 }),
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* HERO */}
        <div className="flex flex-wrap items-end gap-6">
          <div className="min-w-[260px] flex-1">
            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="h-[5px] w-[5px] flex-none rotate-45 bg-racing-cyan shadow-[0_0_8px_#00c2ff]" />
              <span className="whitespace-nowrap font-hud text-xs font-semibold uppercase tracking-[0.16em] text-racing-cyan">
                Configuration en 3 étapes
              </span>
            </div>
            <h1 className="font-hud text-[clamp(34px,4.4vw,48px)] font-bold leading-none tracking-tight text-white">
              Nouveau{' '}
              <span className="bg-gradient-to-r from-racing-blue to-racing-cyan bg-clip-text text-transparent">
                serveur
              </span>
            </h1>
            <p className="mt-2.5 font-hud-mono text-xs text-gray-500">
              Configure un serveur dédié Assetto Corsa en 3 étapes
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(backPath)}
            className="flex items-center gap-2 whitespace-nowrap rounded-md border border-white/10 px-4 py-2.5 font-hud text-sm font-bold tracking-wide text-gray-300 transition-colors hover:border-red-500/40 hover:text-red-300"
          >
            <X className="h-4 w-4" />
            Annuler
          </button>
        </div>

        <Stepper current={step} onGo={(s) => (s <= step || canProceed()) && setStep(s)} />

        <div>
          <StepBadge
            icon={STEPS[step - 1].icon}
            label={`Étape ${step} · ${STEPS[step - 1].label}`}
          />

          <div className="relative mt-5 min-h-[420px] overflow-hidden">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={step}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as const }}
              >
                {step === 1 && (
                  <StepStation
                    stations={onlineStations}
                    loading={stationsLoading}
                    selectedId={stationId}
                    onSelect={selectStation}
                  />
                )}

                {step === 2 && (
                  <StepTrack
                    stationId={stationId}
                    station={selectedStation}
                    tracks={filteredTracks}
                    totalTracks={content.tracks.length}
                    search={trackSearch}
                    onSearch={setTrackSearch}
                    selectedTrack={selectedTrack}
                    trackLayout={trackLayout}
                    onSelectTrack={selectTrack}
                    onSelectLayout={setTrackLayout}
                    onSync={() => selectedStation && syncMutation.mutate(selectedStation.id)}
                    isSyncing={syncMutation.isPending}
                  />
                )}

                {step === 3 && (
                  <StepConfig
                    name={name}
                    onName={setName}
                    maxClients={maxClients}
                    onMaxClients={setMaxClients}
                    password={password}
                    onPassword={setPassword}
                    rconPassword={rconPassword}
                    onRconPassword={setRconPassword}
                    showAdvanced={showAdvanced}
                    onToggleAdvanced={() => setShowAdvanced((v) => !v)}
                    cars={filteredCars}
                    allCars={content.cars}
                    totalCars={content.cars.length}
                    carCounts={carCounts}
                    totalSelectedCars={totalSelectedCars}
                    onAddCar={addCar}
                    onRemoveCar={removeCar}
                    onFillAllWith={fillAllSlotsWith}
                    onClearCars={clearCarSelection}
                    carSearch={carSearch}
                    onCarSearch={setCarSearch}
                    station={selectedStation}
                    track={selectedTrack}
                    trackLayout={trackLayout}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* PIED */}
        <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-5">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 1}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-md border border-white/10 px-4 font-hud text-sm font-bold text-gray-300 transition-colors hover:border-racing-cyan/40 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Précédent
          </button>

          <span className="min-w-[8px] flex-1 text-center font-hud-mono text-xs text-gray-500">
            Étape {step} / 3
          </span>

          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canProceed()}
              className="flex h-10 items-center gap-2 whitespace-nowrap rounded-md bg-gradient-to-r from-racing-blue to-racing-cyan px-5 font-hud text-sm font-bold tracking-wide text-dark-950 shadow-[0_0_24px_rgba(0,120,255,0.3)] transition-shadow hover:shadow-[0_0_34px_rgba(0,150,255,0.5)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              Suivant
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || createMutation.isPending}
              className="flex h-10 items-center gap-2 whitespace-nowrap rounded-md bg-gradient-to-r from-racing-blue to-racing-cyan px-5 font-hud text-sm font-bold tracking-wide text-dark-950 shadow-[0_0_24px_rgba(0,120,255,0.3)] transition-shadow hover:shadow-[0_0_34px_rgba(0,150,255,0.5)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {createMutation.isPending ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-dark-950/40 border-t-dark-950" />
              ) : (
                <Flag className="h-3.5 w-3.5" />
              )}
              Créer le serveur
            </button>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

function StepBadge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-[30px] flex-none items-center gap-2 whitespace-nowrap rounded-md border border-racing-cyan/40 bg-gradient-to-r from-racing-blue/20 to-racing-cyan/10 px-3.5">
        <Icon className="h-3.5 w-3.5 text-sky-300" />
        <span className="font-hud text-[13.5px] font-bold tracking-wide text-white">{label}</span>
      </div>
      <div className="h-px min-w-[8px] flex-1 bg-gradient-to-r from-racing-cyan/30 to-transparent" />
    </div>
  );
}

function Stepper({ current, onGo }: { current: number; onGo: (step: number) => void }) {
  return (
    <div className="flex items-center gap-3 border-y border-white/10 py-4">
      {STEPS.map((s, i) => {
        const done = current > s.id;
        const active = current === s.id;
        const Icon = s.icon;
        return (
          <div key={s.id} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={() => onGo(s.id)}
              className="flex items-center gap-3 text-left"
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-lg transition-all ${
                  done
                    ? 'bg-gradient-to-br from-racing-blue to-racing-cyan text-dark-950'
                    : active
                      ? 'border border-racing-cyan/60 bg-gradient-to-br from-racing-blue/30 to-racing-cyan/10 text-sky-300 shadow-[0_0_20px_rgba(0,120,255,0.3)]'
                      : 'border border-white/10 bg-dark-900/50 text-gray-500'
                }`}
              >
                {done ? <Check className="h-4.5 w-4.5" /> : <Icon className="h-4.5 w-4.5" />}
              </div>
              <div className="hidden sm:block">
                <p className="whitespace-nowrap font-hud text-[11.5px] font-semibold tracking-wide text-gray-400">
                  Étape {s.id}
                </p>
                <p className="whitespace-nowrap font-hud text-base font-bold text-white">
                  {s.label}
                </p>
              </div>
            </button>
            {i < STEPS.length - 1 && (
              <div
                className="mx-3.5 h-px flex-1"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(0,194,255,.35), transparent)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepStation({
  stations,
  loading,
  selectedId,
  onSelect,
}: {
  stations: Station[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (loading) {
    return <p className="text-gray-500">Chargement des postes...</p>;
  }

  if (stations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-dark-900/50 py-16 text-center">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-gray-600" />
        <p className="text-gray-400">Aucun poste admin en ligne pour le moment.</p>
        <p className="mt-1 text-sm text-gray-600">
          Seul un poste de type "Admin" peut héberger un serveur dédié. Configure le type d'un poste
          depuis la page Postes.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-4 flex items-center gap-2.5 font-hud text-xl font-bold tracking-wide text-white">
        <Monitor className="h-5 w-5 text-racing-cyan" />
        Choisis le poste hôte
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stations.map((station) => {
          const selected = selectedId === station.id;
          const content = station.content as { cars?: unknown[]; tracks?: unknown[] } | null;
          const hasNoContent = !content?.cars?.length || !content?.tracks?.length;
          return (
            <button
              key={station.id}
              type="button"
              onClick={() => onSelect(station.id)}
              className={`relative overflow-hidden rounded-lg border p-4 text-left transition-all ${
                selected
                  ? 'border-racing-cyan/50 bg-gradient-to-br from-racing-blue/15 to-dark-900/50 shadow-[0_0_22px_rgba(0,120,255,0.2)]'
                  : 'border-white/[0.06] bg-dark-900/45 hover:border-racing-cyan/35'
              }`}
            >
              <span
                className={`absolute inset-y-0 left-0 w-[3px] ${
                  selected ? 'bg-gradient-to-b from-racing-blue to-racing-cyan' : 'bg-gray-700'
                }`}
              />
              {selected && (
                <span className="absolute right-2 top-2 h-3.5 w-3.5 border-r border-t border-racing-cyan/70" />
              )}
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 flex-none place-items-center rounded-md border border-purple-400/30 bg-purple-400/10 text-purple-200">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-hud text-xl font-bold text-white">{station.name}</p>
                  <p className="truncate font-hud-mono text-xs text-sky-200/60">
                    {station.localIp ?? '—'} · poste admin
                  </p>
                </div>
                {selected && <CheckCircle2 className="h-5 w-5 flex-none text-racing-cyan" />}
              </div>
              <div className="mt-3 flex items-center gap-3.5 border-t border-white/10 pt-3">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      station.status === 'in_game'
                        ? 'bg-racing-cyan shadow-[0_0_8px_#00c2ff]'
                        : 'bg-emerald-400 shadow-[0_0_8px_#24d17e]'
                    }`}
                  />
                  <span
                    className={`font-hud text-[13px] font-bold ${
                      station.status === 'in_game' ? 'text-racing-cyan' : 'text-emerald-400'
                    }`}
                  >
                    {station.status === 'in_game' ? 'En jeu' : 'En ligne'}
                  </span>
                </span>
                <span className="whitespace-nowrap font-hud-mono text-xs text-gray-500">
                  agent v{station.version ?? '—'}
                </span>
              </div>
              {hasNoContent && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-yellow-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Aucune voiture/circuit détecté sur ce poste
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepTrack({
  stationId,
  station,
  tracks,
  totalTracks,
  search,
  onSearch,
  selectedTrack,
  trackLayout,
  onSelectTrack,
  onSelectLayout,
  onSync,
  isSyncing,
}: {
  stationId: string;
  station?: Station;
  tracks: Track[];
  totalTracks: number;
  search: string;
  onSearch: (v: string) => void;
  selectedTrack?: Track;
  trackLayout: string;
  onSelectTrack: (t: Track) => void;
  onSelectLayout: (l: string) => void;
  onSync: () => void;
  isSyncing: boolean;
}) {
  const labelMap = useContentLabelMap();
  const layoutSectionRef = useRef<HTMLDivElement>(null);

  // The track grid caps its own height (see max-h below) precisely so a
  // selection doesn't blow past the viewport, but on a short window (or a
  // track with several layout rows) it still can — this nudges the layout
  // picker into view instead of leaving the user to notice it needs
  // scrolling on their own.
  useEffect(() => {
    if (selectedTrack && selectedTrack.layouts.length > 0) {
      layoutSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrack?.acId]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="flex flex-none items-center gap-2.5 font-hud text-xl font-bold tracking-wide text-white">
          <MapPin className="h-5 w-5 text-racing-cyan" />
          Choisis le circuit
        </h3>
        <div className="h-px min-w-[8px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
        {totalTracks > 0 && (
          <div className="relative w-full flex-none sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Rechercher un circuit..."
              className="w-full rounded-md border border-white/10 bg-black/30 py-2 pl-9 pr-3 font-hud-mono text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-racing-cyan/50"
            />
          </div>
        )}
      </div>

      {!stationId ? null : totalTracks === 0 ? (
        <div className="space-y-3 rounded-xl border border-dashed border-white/10 bg-dark-900/50 py-16 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-gray-600" />
          <p className="text-gray-400">Aucun circuit détecté sur ce poste.</p>
          {station && (
            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              className="mx-auto flex items-center gap-2 rounded-md border border-white/10 px-4 py-2 font-hud text-sm font-bold text-gray-300 transition-colors hover:border-racing-cyan/40 hover:text-sky-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              Synchroniser le contenu
            </button>
          )}
        </div>
      ) : (
        // Circuit grid and layout picker share a single scroll region instead
        // of each capping their own height independently: on a short/small
        // display the fixed-size header above (hero, stepper, step badge)
        // eats a bigger share of the viewport, so a flat `vh` cap for the
        // grid alone could still push "LAYOUT" below the fold even after
        // shrinking. Bounding the *combined* region to the space actually
        // left below that header (`calc(100vh-...)`, not a fraction of the
        // full viewport) keeps both reachable with at most one small
        // internal scroll, at any resolution — see layoutSectionRef's
        // scrollIntoView effect above for what still nudges "LAYOUT" into
        // view within this region once a track is picked.
        <div className="max-h-[calc(100vh-430px)] min-h-[240px] overflow-y-auto p-1 pr-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tracks.map((track) => {
              const selected = selectedTrack?.acId === track.acId;
              return (
                <button
                  key={track.acId}
                  type="button"
                  onClick={() => onSelectTrack(track)}
                  className={`group relative overflow-hidden rounded-lg border text-left transition-all ${
                    selected
                      ? 'border-racing-cyan/60 shadow-[0_0_22px_rgba(0,120,255,0.2)]'
                      : 'border-white/[0.06] hover:border-racing-cyan/35'
                  }`}
                >
                  <div className="flex aspect-video items-center justify-center bg-dark-900">
                    {track.preview ? (
                      <img
                        src={track.preview}
                        alt={track.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-gray-600">
                        <ImageOff className="mb-1 h-8 w-8" />
                        <span className="text-xs">Pas d'aperçu</span>
                      </div>
                    )}
                    {selected && (
                      <CheckCircle2 className="absolute right-2.5 top-2.5 h-5 w-5 text-racing-cyan drop-shadow-[0_0_6px_rgba(0,194,255,0.8)]" />
                    )}
                  </div>
                  <div
                    className={`p-3 ${
                      selected
                        ? 'bg-gradient-to-r from-racing-blue/15 to-dark-900/60'
                        : 'bg-dark-900/60'
                    }`}
                  >
                    <p
                      className={`truncate font-hud text-lg font-bold ${selected ? 'text-white' : 'text-gray-200'}`}
                    >
                      {formatTrackName(track.name, track.acId, labelMap)}
                    </p>
                    <p className="mt-0.5 truncate font-hud-mono text-[11.5px] text-gray-500">
                      {track.acId}
                    </p>
                  </div>
                </button>
              );
            })}
            {tracks.length === 0 && (
              <p className="col-span-full py-8 text-center text-gray-500">
                Aucun circuit ne correspond à la recherche.
              </p>
            )}
          </div>

          {selectedTrack && selectedTrack.layouts.length > 0 && (
            <div ref={layoutSectionRef} className="mt-4">
              <Label>Layout</Label>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                {selectedTrack.layouts.map((layout) => {
                  const active = trackLayout === layout.name;
                  return (
                    <button
                      key={layout.name}
                      type="button"
                      onClick={() => onSelectLayout(layout.name)}
                      className={`group relative overflow-hidden rounded-md border text-left transition-all ${
                        active
                          ? 'border-racing-cyan/60 shadow-[0_0_16px_rgba(0,120,255,0.2)]'
                          : 'border-white/[0.06] hover:border-racing-cyan/35'
                      }`}
                    >
                      <div className="flex aspect-video items-center justify-center bg-dark-900">
                        {layout.preview ? (
                          <img
                            src={layout.preview}
                            alt={layout.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <MapPin className="h-6 w-6 text-gray-600" />
                        )}
                        {active && (
                          <CheckCircle2 className="absolute right-1.5 top-1.5 h-4 w-4 text-racing-cyan" />
                        )}
                      </div>
                      <div className="bg-dark-900/60 p-1.5">
                        <p className="truncate font-hud text-xs font-bold text-white">
                          {layout.name}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface StepConfigProps {
  name: string;
  onName: (v: string) => void;
  maxClients: number;
  onMaxClients: (v: number) => void;
  password: string;
  onPassword: (v: string) => void;
  rconPassword: string;
  onRconPassword: (v: string) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  cars: AcCar[];
  allCars: AcCar[];
  totalCars: number;
  carCounts: Record<string, number>;
  totalSelectedCars: number;
  onAddCar: (id: string) => void;
  onRemoveCar: (id: string) => void;
  onFillAllWith: (id: string) => void;
  onClearCars: () => void;
  carSearch: string;
  onCarSearch: (v: string) => void;
  station?: Station;
  track?: Track;
  trackLayout: string;
}

function StepConfig({
  name,
  onName,
  maxClients,
  onMaxClients,
  password,
  onPassword,
  rconPassword,
  onRconPassword,
  showAdvanced,
  onToggleAdvanced,
  cars,
  allCars,
  totalCars,
  carCounts,
  totalSelectedCars,
  onAddCar,
  onRemoveCar,
  onFillAllWith,
  onClearCars,
  carSearch,
  onCarSearch,
  station,
  track,
  trackLayout,
}: StepConfigProps) {
  const labelMap = useContentLabelMap();
  const atCapacity = totalSelectedCars >= maxClients;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr,280px]">
      {/* Colonne principale : voitures d'abord, options avancées repliées */}
      <div className="space-y-6">
        <section className="overflow-hidden rounded-lg border border-white/10 bg-dark-900/50">
          <button
            type="button"
            onClick={onToggleAdvanced}
            className="flex w-full flex-wrap items-center gap-2.5 px-4 py-3.5 text-left"
          >
            <Settings2 className="h-4.5 w-4.5 flex-none text-racing-cyan" />
            <span className="font-hud text-base font-bold text-white">Options avancées</span>
            <span className="font-hud-mono text-[11.5px] text-gray-500">
              nom, slots, mot de passe...
            </span>
            <div className="min-w-[8px] flex-1" />
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 ${
                showAdvanced ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showAdvanced && (
            <div className="space-y-4 border-t border-white/10 p-4">
              <div>
                <Label htmlFor="server-name">Nom du serveur</Label>
                <Input
                  id="server-name"
                  value={name}
                  onChange={(e) => onName(e.target.value)}
                  placeholder="Ex: Course du soir"
                  required
                />
              </div>

              <div>
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  Slots joueurs ({maxClients}/24)
                </Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => onMaxClients(n)}
                      className={`h-9 w-9 rounded-md font-hud text-sm font-bold transition-all ${
                        maxClients === n
                          ? 'scale-110 bg-gradient-to-br from-racing-blue to-racing-cyan text-dark-950 shadow-[0_0_16px_rgba(0,120,255,0.4)]'
                          : 'bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="password" className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-gray-400" />
                    Mot de passe (optionnel)
                  </Label>
                  <Input
                    id="password"
                    type="text"
                    value={password}
                    onChange={(e) => onPassword(e.target.value)}
                    placeholder="laisser vide = public"
                  />
                </div>
                <div>
                  <Label htmlFor="rcon" className="flex items-center gap-2">
                    <Radio className="h-3.5 w-3.5 text-gray-400" />
                    Mot de passe RCON (optionnel)
                  </Label>
                  <Input
                    id="rcon"
                    type="text"
                    value={rconPassword}
                    onChange={(e) => onRconPassword(e.target.value)}
                    placeholder="administration"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h3 className="flex flex-none items-center gap-2.5 font-hud text-xl font-bold tracking-wide text-white">
              <Car className="h-5 w-5 text-racing-cyan" />
              Choix des voitures
            </h3>
            <span
              className={`flex-none whitespace-nowrap font-hud-mono text-xs ${atCapacity ? 'text-orange-400' : 'text-gray-500'}`}
            >
              {totalSelectedCars} / {maxClients} slots
            </span>
            <div className="h-px min-w-[8px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
            {totalCars > 0 && (
              <div className="relative flex-none">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={carSearch}
                  onChange={(e) => onCarSearch(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-36 rounded-md border border-white/10 bg-black/30 py-1.5 pl-8 pr-3 font-hud-mono text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-racing-cyan/50"
                />
              </div>
            )}
            <button
              type="button"
              onClick={onClearCars}
              disabled={totalSelectedCars === 0}
              className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 px-3 py-1.5 font-hud text-[13.5px] font-bold text-gray-300 transition-colors hover:border-racing-cyan/40 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Eraser className="h-3.5 w-3.5" />
              Vider
            </button>
          </div>

          {totalCars === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-dark-900/50 py-10 text-center">
              <AlertCircle className="mx-auto mb-2 h-10 w-10 text-gray-600" />
              <p className="text-gray-400">Aucune voiture détectée sur ce poste.</p>
            </div>
          ) : (
            <div className="grid max-h-[65vh] grid-cols-2 gap-2.5 overflow-y-auto p-1 sm:grid-cols-3 lg:grid-cols-4">
              {cars.map((car) => {
                const count = carCounts[car.acId] ?? 0;
                return (
                  <div
                    key={car.acId}
                    className={`group relative overflow-hidden rounded-lg border transition-all ${
                      count > 0
                        ? 'border-racing-cyan/55 shadow-[0_0_18px_rgba(0,120,255,0.2)]'
                        : 'border-white/[0.06] hover:border-racing-cyan/35'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onAddCar(car.acId)}
                      title={
                        atCapacity && count === 0
                          ? 'Prendre un emplacement à une autre voiture'
                          : 'Ajouter une voiture'
                      }
                      className="block w-full text-left"
                    >
                      <div className="flex aspect-video items-center justify-center bg-dark-900">
                        {car.preview ? (
                          <img
                            src={car.preview}
                            alt={formatCarName(car.name, car.acId, labelMap)}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <Car className="h-8 w-8 text-gray-600" />
                        )}
                      </div>
                      <div
                        className={`p-2 ${count > 0 ? 'bg-gradient-to-r from-racing-blue/15 to-dark-900/60' : 'bg-dark-900/60'}`}
                      >
                        <p
                          className={`truncate font-hud text-sm font-bold ${count > 0 ? 'text-white' : 'text-gray-200'}`}
                        >
                          {formatCarName(car.name, car.acId, labelMap)}
                        </p>
                        <p className="mt-0.5 truncate font-hud-mono text-[10.5px] text-gray-500">
                          {car.acId}
                        </p>
                      </div>
                    </button>

                    {/* Remplir tous les slots avec cette voiture — visible au survol */}
                    <button
                      type="button"
                      onClick={() => onFillAllWith(car.acId)}
                      title={`Remplir les ${maxClients} slots avec cette voiture`}
                      className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-dark-900/80 text-gray-300 opacity-0 backdrop-blur transition-opacity duration-150 hover:bg-racing-cyan hover:text-dark-950 group-hover:opacity-100"
                    >
                      <Layers className="h-3 w-3" />
                    </button>

                    {/* Badge de quantité — cliquer retire un exemplaire */}
                    {count > 0 && (
                      <button
                        type="button"
                        onClick={() => onRemoveCar(car.acId)}
                        title="Retirer un exemplaire"
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-racing-cyan text-xs font-bold text-dark-950 shadow"
                      >
                        {count > 1 ? (
                          <span className="font-hud-mono">×{count}</span>
                        ) : (
                          <Minus className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
              {cars.length === 0 && (
                <p className="col-span-full py-8 text-center text-gray-500">
                  Aucune voiture ne correspond à la recherche.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Récapitulatif sticky : toujours visible pendant la configuration */}
      <aside className="relative overflow-hidden rounded-lg border border-racing-cyan/30 bg-gradient-to-br from-racing-blue/[0.14] to-dark-900/50 p-4.5 lg:sticky lg:top-20">
        <span className="absolute left-2 top-2 h-3 w-3 border-l border-t border-racing-cyan/70" />
        <span className="absolute bottom-2 right-2 h-3 w-3 border-b border-r border-racing-cyan/70" />

        <p className="font-hud text-lg font-bold tracking-wide text-white">Récapitulatif</p>
        <div className="mt-3.5 flex flex-col gap-3">
          <RecapItem icon={Monitor} label="Poste" value={station?.name ?? '—'} />
          <RecapItem
            icon={MapPin}
            label="Circuit"
            value={
              track
                ? `${formatTrackName(track.name, track.acId, labelMap)}${trackLayout ? ` (${trackLayout})` : ''}`
                : '—'
            }
          />
          <RecapItem icon={Users} label="Slots" value={String(maxClients)} />
          <RecapItem icon={Lock} label="Accès" value={password ? 'Protégé' : 'Public'} />
        </div>

        <div className="mt-4 border-t border-white/[0.09] pt-3.5">
          <div className="flex items-center gap-2.5">
            <Car className="h-3.5 w-3.5 flex-none text-racing-cyan" />
            <span className="whitespace-nowrap font-hud text-[13.5px] font-bold text-gray-300">
              Grille de voitures
            </span>
            <div className="flex-1" />
            <span
              className={`whitespace-nowrap font-hud-mono text-xs ${atCapacity ? 'text-orange-400' : 'text-gray-500'}`}
            >
              {totalSelectedCars}/{maxClients}
            </span>
          </div>
          <div className="mt-2.5">
            <CarSlotsGrid
              carCounts={carCounts}
              cars={allCars}
              maxClients={maxClients}
              labelMap={labelMap}
              onRemoveCar={onRemoveCar}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.09] pt-3.5">
          <CheckRow ok={!!name.trim()}>Nom défini</CheckRow>
          <CheckRow ok={totalSelectedCars > 0}>Au moins une voiture</CheckRow>
        </div>
      </aside>
    </div>
  );
}

/** "Team select" style roster: one tile per occupied slot (a car picked 3
 * times shows up as 3 separate tiles, not a badge with "×3") plus dashed
 * placeholders for the remaining empty slots — makes the actual 11-slot
 * distribution visible at a glance instead of just a text counter. Clicking
 * a filled tile removes that one instance (mirrors the "−" badge in the
 * grid above). */
function CarSlotsGrid({
  carCounts,
  cars,
  maxClients,
  labelMap,
  onRemoveCar,
}: {
  carCounts: Record<string, number>;
  cars: AcCar[];
  maxClients: number;
  labelMap: ContentLabelMap;
  onRemoveCar: (id: string) => void;
}) {
  const carByAcId = useMemo(() => new Map(cars.map((c) => [c.acId, c])), [cars]);
  const slots = useMemo(() => {
    const flat: string[] = [];
    for (const [acId, count] of Object.entries(carCounts)) {
      for (let i = 0; i < count; i++) flat.push(acId);
    }
    return flat;
  }, [carCounts]);

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {Array.from({ length: maxClients }, (_, i) => {
        const acId = slots[i];
        if (!acId) {
          return (
            <div
              key={`empty-${i}`}
              className="aspect-square rounded-md border border-dashed border-white/[0.12]"
            />
          );
        }
        const car = carByAcId.get(acId);
        const displayName = formatCarName(car?.name, acId, labelMap);
        return (
          <button
            key={`slot-${i}`}
            type="button"
            onClick={() => onRemoveCar(acId)}
            title={`${displayName} — cliquer pour retirer`}
            className="group relative aspect-square overflow-hidden rounded-md border border-white/10 bg-dark-900 transition-colors hover:border-red-500/60"
          >
            {car?.preview ? (
              <img
                src={car.preview}
                alt={displayName}
                className="h-full w-full object-cover transition-opacity group-hover:opacity-30"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Car className="h-4 w-4 text-gray-600" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <X className="h-4 w-4 text-white drop-shadow" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function RecapItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-racing-cyan" />
      <div className="min-w-0">
        <p className="font-hud text-[11px] font-semibold tracking-wide text-sky-200/70">{label}</p>
        <p className="mt-0.5 truncate font-hud text-base font-bold text-white" title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

function CheckRow({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p
      className={`flex items-center gap-2 font-hud text-sm font-semibold ${ok ? 'text-emerald-400' : 'text-gray-500'}`}
    >
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}
      {children}
    </p>
  );
}
