import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { dedicatedServersApi, type Car as AcCar, type Track } from '../services/dedicatedServers';
import { stationsApi, type Station } from '../services/stations';
import { formatTrackName } from '../utils/track';
import { setWizardBackgroundStep } from '../components/PageBackground';
import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
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
  Wifi,
  Flag,
  X,
} from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Simulateur', icon: Monitor },
  { id: 2, label: 'Circuit', icon: MapPin },
  { id: 3, label: 'Configuration', icon: Server },
];

export function CreateDedicatedServer() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
  const [selectedCars, setSelectedCars] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [maxClients, setMaxClients] = useState(10);
  const [password, setPassword] = useState('');
  const [rconPassword, setRconPassword] = useState('');

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
      (t) => formatTrackName(t.name, t.acId).toLowerCase().includes(q) || t.acId.includes(q),
    );
  }, [content.tracks, trackSearch]);

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
      navigate('/dedicated-servers');
    },
  });

  function selectStation(id: string) {
    setStationId(id);
    setTrackId('');
    setTrackLayout('');
    setSelectedCars([]);
  }

  function selectTrack(track: Track) {
    setTrackId(track.acId);
    setTrackLayout(track.layouts.length > 0 ? track.layouts[0] : '');
    if (!name) {
      setName(`Serveur ${formatTrackName(track.name, track.acId)}`);
    }
  }

  function toggleCar(carAcId: string) {
    setSelectedCars((prev) =>
      prev.includes(carAcId) ? prev.filter((c) => c !== carAcId) : [...prev, carAcId],
    );
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
    !!name.trim() && !!stationId && !!trackId && selectedCars.length > 0 && maxClients >= 1;

  function handleSubmit() {
    if (!canSubmit) return;
    createMutation.mutate({
      name: name.trim(),
      stationId,
      track: trackId,
      ...(trackLayout && { trackLayout }),
      cars: selectedCars,
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
    <PageShell
      title="Nouveau"
      accent="serveur"
      subtitle="Configure un serveur dédié Assetto Corsa en 3 étapes"
      actions={
        <Button variant="ghost" onClick={() => navigate('/dedicated-servers')}>
          <X className="h-4 w-4" />
          Annuler
        </Button>
      }
    >
      <Stepper current={step} />

      <Card padding="lg" className="flex min-h-[480px] flex-col">
        <div className="relative flex-1 overflow-hidden">
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
                  cars={filteredCars}
                  totalCars={content.cars.length}
                  selectedCars={selectedCars}
                  onToggleCar={toggleCar}
                  onSelectAll={() => setSelectedCars(content.cars.map((c) => c.acId))}
                  onSelectNone={() => setSelectedCars([])}
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

        {/* Navigation du wizard */}
        <div className="mt-6 flex items-center justify-between border-t border-dark-600 pt-6">
          <Button variant="secondary" onClick={goPrev} disabled={step === 1}>
            <ArrowLeft className="h-4 w-4" />
            Précédent
          </Button>

          <span className="font-mono text-xs tabular-nums text-gray-500">Étape {step} / 3</span>

          {step < 3 ? (
            <Button variant="primary" onClick={goNext} disabled={!canProceed()}>
              Suivant
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
              isLoading={createMutation.isPending}
            >
              <Flag className="h-4 w-4" />
              Créer le serveur
            </Button>
          )}
        </div>
      </Card>
    </PageShell>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center">
      {STEPS.map((s, i) => {
        const done = current > s.id;
        const active = current === s.id;
        const Icon = s.icon;
        return (
          <div key={s.id} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-3">
              <div className="relative">
                {active && (
                  <span className="absolute inset-0 animate-ring-pulse rounded-xl bg-accent-orange" />
                )}
                <div
                  className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 transition-all ${
                    done
                      ? 'border-accent-orange bg-accent-orange text-white'
                      : active
                        ? 'border-accent-orange bg-accent-orange/10 text-accent-orange shadow-glow-orange'
                        : 'border-dark-600 bg-dark-800 text-gray-500'
                  }`}
                >
                  {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
              </div>
              <div className="hidden sm:block">
                <p className="text-[10px] uppercase tracking-widest text-gray-500">Étape {s.id}</p>
                <p
                  className={`text-sm font-semibold ${active || done ? 'text-white' : 'text-gray-500'}`}
                >
                  {s.label}
                </p>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className="mx-4 h-0.5 flex-1 overflow-hidden rounded-full bg-dark-700">
                <motion.div
                  className="h-full bg-accent-orange"
                  initial={false}
                  animate={{ width: done ? '100%' : '0%' }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }}
                />
              </div>
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
      <div className="rounded-xl border border-dashed border-dark-600 bg-dark-900/50 py-16 text-center">
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
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
        <Monitor className="h-5 w-5 text-accent-orange" />
        Choisis le poste hôte
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stations.map((station) => {
          const selected = selectedId === station.id;
          return (
            <button
              key={station.id}
              type="button"
              onClick={() => onSelect(station.id)}
              className={`relative rounded-xl border p-4 text-left transition-all duration-200 hover:scale-[1.02] ${
                selected
                  ? 'border-accent-orange bg-accent-orange/5 shadow-lg shadow-accent-orange/10 ring-2 ring-accent-orange'
                  : 'border-dark-600 bg-dark-900 hover:border-accent-orange/50'
              }`}
            >
              {selected && (
                <div className="absolute right-3 top-3 rounded-full bg-accent-orange p-1 text-dark-900">
                  <Check className="h-3.5 w-3.5" />
                </div>
              )}
              <div className="mb-3 flex items-center gap-3">
                <div
                  className={`rounded-lg p-2 ${station.status === 'in_game' ? 'bg-blue-400/10' : 'bg-green-400/10'}`}
                >
                  <Monitor
                    className={`h-5 w-5 ${station.status === 'in_game' ? 'text-blue-400' : 'text-green-400'}`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{station.name}</p>
                  <p className="truncate font-mono text-xs text-gray-500">{station.stationId}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Badge variant={station.status === 'in_game' ? 'blue' : 'green'}>
                  {station.status === 'in_game' ? 'En jeu' : 'En ligne'}
                </Badge>
                <span className="flex items-center gap-1 font-mono text-xs text-gray-500">
                  <Wifi className="h-3 w-3" />
                  {station.localIp ?? '—'}
                </span>
              </div>
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
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
          <MapPin className="h-5 w-5 text-accent-orange" />
          Choisis le circuit
        </h3>
        {totalTracks > 0 && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Rechercher un circuit..."
              className="w-full rounded-lg border border-dark-600 bg-dark-900 py-2 pl-9 pr-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-orange"
            />
          </div>
        )}
      </div>

      {!stationId ? null : totalTracks === 0 ? (
        <div className="space-y-3 rounded-xl border border-dashed border-dark-600 bg-dark-900/50 py-16 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-gray-600" />
          <p className="text-gray-400">Aucun circuit détecté sur ce poste.</p>
          {station && (
            <Button size="sm" variant="secondary" isLoading={isSyncing} onClick={onSync}>
              <RefreshCw className="h-4 w-4" />
              Synchroniser le contenu
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid max-h-[22rem] grid-cols-1 gap-4 overflow-y-auto p-1 sm:grid-cols-2 lg:grid-cols-3">
            {tracks.map((track) => {
              const selected = selectedTrack?.acId === track.acId;
              return (
                <button
                  key={track.acId}
                  type="button"
                  onClick={() => onSelectTrack(track)}
                  className={`group relative overflow-hidden rounded-xl border text-left transition-all duration-200 hover:scale-[1.02] ${
                    selected
                      ? 'border-accent-orange shadow-lg shadow-accent-orange/20 ring-2 ring-accent-orange'
                      : 'border-dark-600 bg-dark-800 hover:border-accent-orange/50'
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
                      <div className="absolute right-2 top-2 rounded-full bg-accent-orange p-1 text-dark-900">
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate font-semibold text-white">
                      {formatTrackName(track.name, track.acId)}
                    </p>
                    <p className="truncate text-xs text-gray-500">{track.acId}</p>
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
            <div className="mt-4">
              <Label>Layout</Label>
              <div className="flex flex-wrap gap-2">
                {selectedTrack.layouts.map((layout) => (
                  <button
                    key={layout}
                    type="button"
                    onClick={() => onSelectLayout(layout)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      trackLayout === layout
                        ? 'bg-accent-orange text-dark-900 shadow-lg shadow-accent-orange/30'
                        : 'bg-dark-700 text-gray-300 hover:bg-dark-600'
                    }`}
                  >
                    {layout}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
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
  cars: AcCar[];
  totalCars: number;
  selectedCars: string[];
  onToggleCar: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
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
  cars,
  totalCars,
  selectedCars,
  onToggleCar,
  onSelectAll,
  onSelectNone,
  carSearch,
  onCarSearch,
  station,
  track,
  trackLayout,
}: StepConfigProps) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr,280px]">
      {/* Colonne principale : formulaire + voitures */}
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border border-dark-600 bg-dark-900/50 p-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Server className="h-5 w-5 text-accent-orange" />
            Paramètres du serveur
          </h3>

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
              Slots joueurs ({maxClients}/12)
            </Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onMaxClients(n)}
                  className={`h-10 w-10 rounded-lg text-sm font-bold transition-all ${
                    maxClients === n
                      ? 'scale-110 bg-accent-orange text-dark-900 shadow-lg shadow-accent-orange/30'
                      : 'bg-dark-700 text-gray-300 hover:bg-dark-600'
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
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Car className="h-5 w-5 text-accent-orange" />
              Choix des voitures
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="whitespace-nowrap text-sm text-gray-400">
                {selectedCars.length} / {totalCars}
              </span>
              {totalCars > 0 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={carSearch}
                    onChange={(e) => onCarSearch(e.target.value)}
                    placeholder="Rechercher..."
                    className="w-36 rounded-lg border border-dark-600 bg-dark-900 py-1.5 pl-8 pr-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-orange"
                  />
                </div>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onSelectAll}
                disabled={totalCars === 0}
              >
                Tout
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onSelectNone}
                disabled={selectedCars.length === 0}
              >
                Aucune
              </Button>
            </div>
          </div>

          {totalCars === 0 ? (
            <div className="rounded-xl border border-dashed border-dark-600 bg-dark-900/50 py-10 text-center">
              <AlertCircle className="mx-auto mb-2 h-10 w-10 text-gray-600" />
              <p className="text-gray-400">Aucune voiture détectée sur ce poste.</p>
            </div>
          ) : (
            <div className="grid max-h-72 grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 lg:grid-cols-4">
              {cars.map((car) => {
                const selected = selectedCars.includes(car.acId);
                return (
                  <button
                    key={car.acId}
                    type="button"
                    onClick={() => onToggleCar(car.acId)}
                    className={`group relative overflow-hidden rounded-xl border text-left transition-all duration-200 hover:scale-[1.03] ${
                      selected
                        ? 'border-accent-orange shadow-lg shadow-accent-orange/20 ring-2 ring-accent-orange'
                        : 'border-dark-600 bg-dark-800 hover:border-accent-orange/50'
                    }`}
                  >
                    <div className="flex aspect-video items-center justify-center bg-dark-900">
                      {car.preview ? (
                        <img
                          src={car.preview}
                          alt={car.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <Car className="h-8 w-8 text-gray-600" />
                      )}
                      {selected && (
                        <div className="absolute right-2 top-2 rounded-full bg-accent-orange p-1 text-dark-900">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="truncate text-sm font-medium text-white">{car.name}</p>
                      <p className="truncate text-[10px] text-gray-500">{car.acId}</p>
                    </div>
                  </button>
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
      <aside className="overflow-hidden rounded-xl border border-dark-600 bg-dark-800/70 lg:sticky lg:top-20">
        <div className="border-b border-dark-700 bg-accent-orange/10 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-orange">
            Récapitulatif
          </p>
        </div>
        <div className="space-y-3 p-4">
          <RecapItem icon={Monitor} label="Poste" value={station?.name ?? '—'} />
          <RecapItem
            icon={MapPin}
            label="Circuit"
            value={
              track
                ? `${formatTrackName(track.name, track.acId)}${trackLayout ? ` (${trackLayout})` : ''}`
                : '—'
            }
          />
          <RecapItem
            icon={Car}
            label="Voitures"
            value={`${selectedCars.length} sélectionnée${selectedCars.length > 1 ? 's' : ''}`}
          />
          <RecapItem icon={Users} label="Slots" value={String(maxClients)} />
          <RecapItem icon={Lock} label="Accès" value={password ? 'Protégé' : 'Public'} />
        </div>
        <div className="space-y-1.5 border-t border-dark-700 px-4 py-3">
          <CheckRow ok={!!name.trim()}>Nom défini</CheckRow>
          <CheckRow ok={selectedCars.length > 0}>Au moins une voiture</CheckRow>
        </div>
      </aside>
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
      <Icon className="h-4 w-4 shrink-0 text-accent-orange" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
        <p className="truncate text-sm font-medium text-white" title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

function CheckRow({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-400' : 'text-gray-500'}`}>
      {ok ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <span className="mx-1 h-1.5 w-1.5 rounded-full bg-gray-600" />
      )}
      {children}
    </p>
  );
}
