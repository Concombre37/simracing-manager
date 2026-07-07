import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { dedicatedServersApi, type Car as AcCar } from '../services/dedicatedServers';
import { stationsApi, type Station } from '../services/stations';
import { PageShell } from '../components/ui/PageShell';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Label } from '../components/ui/Input';
import {
  ArrowLeft,
  Send,
  Check,
  Clock,
  Infinity as InfinityIcon,
  User,
  Car as CarIcon,
  Feather,
  Target,
  Flame,
  Monitor,
  Settings2,
} from 'lucide-react';

type Difficulty = 'EASY' | 'PRO' | 'CUSTOM';
type Gearbox = 'MANUAL' | 'AUTO';

interface PodConfig {
  clientName: string;
  difficulty: Difficulty;
  gearbox: Gearbox;
  carAcId: string;
}

const DIFFICULTIES: {
  value: Difficulty;
  label: string;
  description: string;
  icon: typeof Feather;
}[] = [
  {
    value: 'EASY',
    label: 'Easy',
    description: 'Ligne idéale, aides maximales',
    icon: Feather,
  },
  {
    value: 'PRO',
    label: 'Pro',
    description: 'TC / ABS actifs',
    icon: Target,
  },
  {
    value: 'CUSTOM',
    label: 'Custom',
    description: 'Aucune aide, contrôle total',
    icon: Flame,
  },
];

const GEARBOXES: { value: Gearbox; label: string }[] = [
  { value: 'MANUAL', label: 'Manuelle' },
  { value: 'AUTO', label: 'Automatique' },
];

const DURATION_OPTIONS: { value: number | undefined; label: string }[] = [
  { value: undefined, label: 'Illimité' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
];

export function JoinServer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: server, isLoading } = useQuery({
    queryKey: ['dedicated-server', id],
    queryFn: () => dedicatedServersApi.getById(id as string),
    enabled: Boolean(id),
  });
  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: stationsApi.getAll });

  const [durationMinutes, setDurationMinutes] = useState<number | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [configs, setConfigs] = useState<Record<string, PodConfig>>({});
  const [error, setError] = useState<string | null>(null);

  const availableCars = useMemo(() => server?.cars ?? [], [server]);

  const carMap = useMemo(() => {
    const cars = (server?.station.content as { cars?: AcCar[] } | undefined)?.cars ?? [];
    return new Map(cars.map((c) => [c.acId, c]));
  }, [server]);

  const onlineStations = useMemo(
    () =>
      (stations ?? []).filter(
        (s) =>
          s.id !== server?.stationId &&
          s.role === 'simulator' &&
          (s.status === 'online' || s.status === 'in_game'),
      ),
    [stations, server],
  );

  function toggleStation(stationId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(stationId)) {
        return prev.filter((x) => x !== stationId);
      }
      setConfigs((c) => ({
        ...c,
        [stationId]: c[stationId] ?? {
          clientName: '',
          difficulty: 'PRO',
          gearbox: 'MANUAL',
          carAcId: availableCars[0] ?? '',
        },
      }));
      return [...prev, stationId];
    });
  }

  function updateConfig(stationId: string, patch: Partial<PodConfig>) {
    setConfigs((prev) => ({ ...prev, [stationId]: { ...prev[stationId], ...patch } }));
  }

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!id) return;
      const pods = selectedIds.map((stationId) => {
        const cfg = configs[stationId];
        return {
          stationId,
          carAcId: cfg.carAcId,
          clientName: cfg.clientName || undefined,
          difficulty: cfg.difficulty,
          gearbox: cfg.gearbox,
        };
      });
      await dedicatedServersApi.join(id, pods, durationMinutes);
    },
    onSuccess: () => navigate('/en-cours'),
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : "Échec de l'envoi des POD"),
  });

  if (isLoading || !server) {
    return (
      <PageShell title="Envoyer les POD" subtitle="Chargement du serveur...">
        <p className="text-gray-500">Chargement...</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Envoyer les POD"
      accent={`sur ${server.name}`}
      subtitle={`${server.station.localIp ?? '127.0.0.1'}:${server.tcpPort ?? 9600}`}
      actions={
        <Link to="/dedicated-servers">
          <Button variant="secondary">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
        </Link>
      }
    >
      <div
        className="h-1.5 w-full shrink-0 rounded-full"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, #0a0a0f 0, #0a0a0f 8px, #e8e8e8 8px, #e8e8e8 16px)',
          opacity: 0.5,
        }}
      />

      {/* Durée */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-gray-400">
          <Clock className="h-4 w-4 text-accent-orange" />
          Durée de session
        </h2>
        <div className="flex flex-wrap gap-2">
          {DURATION_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setDurationMinutes(option.value)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
                durationMinutes === option.value
                  ? 'bg-accent-orange text-dark-900 shadow-lg shadow-accent-orange/30'
                  : 'bg-dark-700 text-gray-300 hover:bg-dark-600'
              }`}
            >
              {option.value === undefined && <InfinityIcon className="h-4 w-4" />}
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {/* Sélection des postes */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-gray-400">
          <Monitor className="h-4 w-4 text-accent-orange" />
          Sélectionner les postes
        </h2>
        {onlineStations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-dark-600 bg-dark-900/50 py-10 text-center">
            <p className="text-gray-500">Aucun POD en ligne</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {onlineStations.map((station) => {
              const selected = selectedIds.includes(station.stationId);
              return (
                <button
                  key={station.stationId}
                  type="button"
                  onClick={() => toggleStation(station.stationId)}
                  className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 hover:scale-[1.02] ${
                    selected
                      ? 'border-accent-orange bg-dark-900 shadow-lg shadow-accent-orange/20 ring-2 ring-accent-orange'
                      : 'border-dark-600 bg-dark-800 hover:border-accent-orange/50'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <Monitor
                      className={`h-5 w-5 ${selected ? 'text-accent-orange' : 'text-gray-500'}`}
                    />
                    {selected && (
                      <div className="rounded-full bg-accent-orange p-1 text-dark-900">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                  <p className="truncate font-bold text-white">{station.name}</p>
                  <p className="truncate font-mono text-[10px] text-gray-500">
                    {station.stationId}
                  </p>
                  <div className="mt-2">
                    <Badge variant={station.status === 'in_game' ? 'blue' : 'green'}>
                      {station.status === 'in_game' ? 'En jeu' : 'En ligne'}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Configuration par pilote */}
      <AnimatePresence initial={false}>
        {selectedIds.map((stationId) => {
          const station = onlineStations.find((s) => s.stationId === stationId);
          const cfg = configs[stationId];
          if (!station || !cfg) return null;
          return (
            <motion.div
              key={stationId}
              layout
              initial={{ opacity: 0, y: 12, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <DriverSetupCard
                station={station}
                config={cfg}
                cars={availableCars}
                carMap={carMap}
                onChange={(patch) => updateConfig(stationId, patch)}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>

      {error && (
        <p className="rounded-lg border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Barre d'action persistante */}
      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-xl border border-dark-600 bg-dark-800/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-md">
        <p className="text-sm text-gray-400">
          <span className="text-lg font-black text-white">{selectedIds.length}</span> pilote
          {selectedIds.length > 1 ? 's' : ''} prêt{selectedIds.length > 1 ? 's' : ''}
        </p>
        <Button
          variant="success"
          size="lg"
          onClick={() => joinMutation.mutate()}
          disabled={selectedIds.length === 0 || joinMutation.isPending}
          isLoading={joinMutation.isPending}
          className="shadow-glow-orange"
        >
          <Send className="h-4 w-4" />
          Envoyer {selectedIds.length > 0 && `(${selectedIds.length})`}
        </Button>
      </div>
    </PageShell>
  );
}

function DriverSetupCard({
  station,
  config,
  cars,
  carMap,
  onChange,
}: {
  station: Station;
  config: PodConfig;
  cars: string[];
  carMap: Map<string, AcCar>;
  onChange: (patch: Partial<PodConfig>) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-dark-600 bg-dark-800/70 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-dark-700 bg-gradient-to-r from-accent-orange/10 to-transparent px-5 py-3">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-accent-orange" />
          <span className="font-bold text-white">{station.name}</span>
          <span className="font-mono text-xs text-gray-500">{station.stationId}</span>
        </div>
        <Badge variant={station.status === 'in_game' ? 'blue' : 'green'}>
          {station.status === 'in_game' ? 'En jeu' : 'En ligne'}
        </Badge>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[280px,1fr]">
        <div className="space-y-5">
          <div>
            <Label>Pilote</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={config.clientName}
                onChange={(e) => onChange({ clientName: e.target.value })}
                placeholder="Nom du pilote"
                className="w-full rounded-lg border border-dark-600 bg-dark-900 py-2.5 pl-9 pr-3 font-semibold uppercase tracking-wide text-white placeholder-gray-600 placeholder:normal-case placeholder:tracking-normal placeholder:font-normal focus:border-accent-orange focus:outline-none"
              />
            </div>
          </div>

          <div>
            <Label>Difficulté</Label>
            <div className="space-y-2">
              {DIFFICULTIES.map((d) => {
                const Icon = d.icon;
                const active = config.difficulty === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => onChange({ difficulty: d.value })}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${
                      active
                        ? 'border-accent-orange bg-accent-orange/10 ring-1 ring-accent-orange'
                        : 'border-dark-600 bg-dark-900 hover:border-dark-500'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon
                        className={`h-4 w-4 ${active ? 'text-accent-orange' : 'text-gray-500'}`}
                      />
                      <span
                        className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}
                      >
                        {d.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-tight text-gray-500">{d.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>
              <Settings2 className="mr-1 inline h-3.5 w-3.5" />
              Boîte de vitesses
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {GEARBOXES.map((g) => {
                const active = config.gearbox === g.value;
                return (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => onChange({ gearbox: g.value })}
                    className={`rounded-lg border py-2 text-sm font-bold transition-all ${
                      active
                        ? 'border-accent-orange bg-accent-orange/10 text-white ring-1 ring-accent-orange'
                        : 'border-dark-600 bg-dark-900 text-gray-300 hover:border-dark-500'
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <Label>Voiture</Label>
          {cars.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune voiture disponible sur ce serveur.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {cars.map((acId) => {
                const car = carMap.get(acId);
                const selected = config.carAcId === acId;
                return (
                  <button
                    key={acId}
                    type="button"
                    onClick={() => onChange({ carAcId: acId })}
                    className={`group relative overflow-hidden rounded-xl border text-left transition-all duration-200 hover:scale-[1.03] ${
                      selected
                        ? 'border-accent-orange shadow-lg shadow-accent-orange/20 ring-2 ring-accent-orange'
                        : 'border-dark-600 bg-dark-900 hover:border-accent-orange/50'
                    }`}
                  >
                    <div className="flex aspect-video items-center justify-center bg-dark-950">
                      {car?.preview ? (
                        <img
                          src={car.preview}
                          alt={car.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <CarIcon className="h-8 w-8 text-gray-600" />
                      )}
                      {selected && (
                        <div className="absolute right-2 top-2 rounded-full bg-accent-orange p-1 text-dark-900">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="truncate text-xs font-semibold text-white">
                        {car?.name ?? acId}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
