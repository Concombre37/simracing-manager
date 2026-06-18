import { useMemo, useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Server,
  Plus,
  Check,
  Car,
  MapPin,
  ImageOff,
  Users,
  Lock,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input, Label } from './ui/Input';
import { Badge } from './ui/Badge';
import { type Station } from '../services/stations';
import { stationsApi } from '../services/stations';
import { type Car as AcCar, type Track } from '../services/dedicatedServers';
import { formatTrackName } from '../utils/track';

interface CreateServerModalProps {
  stations: Station[];
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    stationId: string;
    track: string;
    trackLayout?: string;
    cars: string[];
    maxClients: number;
    password?: string;
    rconPassword?: string;
  }) => void;
  isSubmitting: boolean;
}

export function CreateServerModal({
  stations,
  onClose,
  onSubmit,
  isSubmitting,
}: CreateServerModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [stationId, setStationId] = useState('');
  const [trackId, setTrackId] = useState('');
  const [trackLayout, setTrackLayout] = useState('');
  const [selectedCars, setSelectedCars] = useState<string[]>([]);
  const [maxClients, setMaxClients] = useState(10);
  const [password, setPassword] = useState('');
  const [rconPassword, setRconPassword] = useState('');

  const selectedStation = useMemo(
    () => stations.find((s) => s.id === stationId),
    [stations, stationId],
  );

  const content = useMemo<{ cars: AcCar[]; tracks: Track[] }>(() => {
    if (!selectedStation?.content) return { cars: [], tracks: [] };
    const c = selectedStation.content as { cars?: AcCar[]; tracks?: Track[] };
    return {
      cars: c.cars ?? [],
      tracks: c.tracks ?? [],
    };
  }, [selectedStation]);

  const selectedTrack = useMemo(
    () => content.tracks.find((t) => t.acId === trackId),
    [content.tracks, trackId],
  );

  const onlineStations = stations.filter((s) => s.status === 'online' || s.status === 'in_game');

  const syncMutation = useMutation({
    mutationFn: (id: string) => stationsApi.syncContent(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stations'] });
    },
  });

  function toggleCar(carAcId: string) {
    setSelectedCars((prev) =>
      prev.includes(carAcId) ? prev.filter((c) => c !== carAcId) : [...prev, carAcId],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      stationId,
      track: trackId,
      ...(trackLayout && { trackLayout }),
      cars: selectedCars,
      maxClients,
      ...(password && { password }),
      ...(rconPassword && { rconPassword }),
    });
  }

  const canSubmit =
    name.trim() && stationId && trackId && selectedCars.length > 0 && maxClients >= 1;

  return (
    <Modal title="Nouveau serveur" onClose={onClose} size="xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header info */}
        <div className="bg-gradient-to-r from-accent-orange/10 to-transparent border-l-4 border-accent-orange rounded-r-lg p-4">
          <p className="text-sm text-gray-300">
            Configure ton serveur Assetto Corsa. Choisis un simulateur, un circuit, une voiture et
            le nombre de slots.
          </p>
        </div>

        {/* Name + Simulator */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="server-name">Nom du serveur</Label>
            <Input
              id="server-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Course du soir"
              required
            />
          </div>
          <div>
            <Label htmlFor="station-select">Simulateur</Label>
            <select
              id="station-select"
              value={stationId}
              onChange={(e) => {
                setStationId(e.target.value);
                setTrackId('');
                setTrackLayout('');
                setSelectedCars([]);
              }}
              className="w-full rounded-lg border border-dark-600 bg-dark-900 text-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-accent-orange"
              required
            >
              <option value="">Sélectionner un simulateur</option>
              {onlineStations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name} ({station.stationId})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Track selection */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-accent-orange" />
              Choix du circuit
            </h3>
            {selectedTrack && (
              <Badge variant="green">
                {formatTrackName(selectedTrack.name, selectedTrack.acId)}
                {selectedTrack.layouts.length > 0 && (
                  <span className="ml-1 text-green-200">
                    ({selectedTrack.layouts.length} layout)
                  </span>
                )}
              </Badge>
            )}
          </div>

          {!stationId ? (
            <div className="text-center py-10 bg-dark-800/50 rounded-xl border border-dashed border-dark-600">
              <AlertCircle className="w-10 h-10 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400">
                Sélectionne d’abord un simulateur pour voir les circuits.
              </p>
            </div>
          ) : content.tracks.length === 0 ? (
            <div className="text-center py-10 bg-dark-800/50 rounded-xl border border-dashed border-dark-600 space-y-3">
              <AlertCircle className="w-10 h-10 text-gray-600 mx-auto" />
              <p className="text-gray-400">Aucun circuit détecté sur ce simulateur.</p>
              {selectedStation && (
                <Button
                  size="sm"
                  variant="secondary"
                  isLoading={syncMutation.isPending}
                  onClick={() => syncMutation.mutate(selectedStation.id)}
                >
                  <RefreshCw className="w-4 h-4" />
                  Synchroniser le contenu
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto p-1">
              {content.tracks.map((track) => {
                const selected = trackId === track.acId;
                return (
                  <button
                    key={track.acId}
                    type="button"
                    onClick={() => {
                      setTrackId(track.acId);
                      setTrackLayout(track.layouts.length > 0 ? track.layouts[0] : '');
                      if (!name) {
                        setName(`Serveur ${formatTrackName(track.name, track.acId)}`);
                      }
                    }}
                    className={`relative text-left rounded-xl border overflow-hidden transition-all duration-200 hover:scale-[1.02] group ${
                      selected
                        ? 'border-accent-orange ring-2 ring-accent-orange shadow-lg shadow-accent-orange/20'
                        : 'border-dark-600 bg-dark-800 hover:border-accent-orange/50'
                    }`}
                  >
                    <div className="aspect-video bg-dark-900 flex items-center justify-center">
                      {track.preview ? (
                        <img
                          src={track.preview}
                          alt={track.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center text-gray-600">
                          <ImageOff className="w-8 h-8 mb-1" />
                          <span className="text-xs">Pas d’aperçu</span>
                        </div>
                      )}
                      {selected && (
                        <div className="absolute top-2 right-2 bg-accent-orange text-dark-900 rounded-full p-1">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-white truncate">
                        {formatTrackName(track.name, track.acId)}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{track.acId}</p>
                      {track.layouts.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {track.layouts.map((layout) => (
                            <span
                              key={layout}
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                selected && trackLayout === layout
                                  ? 'bg-accent-orange text-dark-900'
                                  : 'bg-dark-700 text-gray-400'
                              }`}
                            >
                              {layout}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedTrack && (
            <div className="mt-4">
              <Label htmlFor="track-layout">Layout</Label>
              <select
                id="track-layout"
                value={trackLayout}
                onChange={(e) => setTrackLayout(e.target.value)}
                disabled={selectedTrack.layouts.length === 0}
                className="w-full rounded-lg border border-dark-600 bg-dark-900 text-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-accent-orange disabled:opacity-50"
              >
                {selectedTrack.layouts.length === 0 ? (
                  <option value="">Aléatoire</option>
                ) : (
                  selectedTrack.layouts.map((layout) => (
                    <option key={layout} value={layout}>
                      {layout}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
        </section>

        {/* Car selection */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Car className="w-5 h-5 text-accent-orange" />
              Choix des voitures
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">
                {selectedCars.length} / {content.cars.length}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelectedCars(content.cars.map((c) => c.acId))}
                disabled={content.cars.length === 0}
              >
                Tout
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelectedCars([])}
                disabled={selectedCars.length === 0}
              >
                Aucune
              </Button>
            </div>
          </div>

          {!stationId ? (
            <div className="text-center py-10 bg-dark-800/50 rounded-xl border border-dashed border-dark-600">
              <AlertCircle className="w-10 h-10 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400">
                Sélectionne d’abord un simulateur pour voir les voitures.
              </p>
            </div>
          ) : content.cars.length === 0 ? (
            <div className="text-center py-10 bg-dark-800/50 rounded-xl border border-dashed border-dark-600">
              <AlertCircle className="w-10 h-10 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400">Aucune voiture détectée sur ce simulateur.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-80 overflow-y-auto p-1">
              {content.cars.map((car) => {
                const selected = selectedCars.includes(car.acId);
                return (
                  <button
                    key={car.acId}
                    type="button"
                    onClick={() => toggleCar(car.acId)}
                    className={`relative text-left rounded-xl border overflow-hidden transition-all duration-200 hover:scale-[1.03] group ${
                      selected
                        ? 'border-accent-orange ring-2 ring-accent-orange shadow-lg shadow-accent-orange/20'
                        : 'border-dark-600 bg-dark-800 hover:border-accent-orange/50'
                    }`}
                  >
                    <div className="aspect-video bg-dark-900 flex items-center justify-center">
                      {car.preview ? (
                        <img
                          src={car.preview}
                          alt={car.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Car className="w-8 h-8 text-gray-600" />
                      )}
                      {selected && (
                        <div className="absolute top-2 right-2 bg-accent-orange text-dark-900 rounded-full p-1">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-sm font-medium text-white truncate">{car.name}</p>
                      <p className="text-[10px] text-gray-500 truncate">{car.acId}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Settings */}
        <section className="bg-dark-800/50 rounded-xl p-4 border border-dark-600 space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-accent-orange" />
            Paramètres du serveur
          </h3>

          <div>
            <Label className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              Slots joueurs ({maxClients}/12)
            </Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxClients(n)}
                  className={`w-10 h-10 rounded-lg font-bold text-sm transition-all ${
                    maxClients === n
                      ? 'bg-accent-orange text-dark-900 shadow-lg shadow-accent-orange/30 scale-110'
                      : 'bg-dark-700 text-gray-300 hover:bg-dark-600'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-gray-400" />
                Mot de passe (optionnel)
              </Label>
              <Input
                id="password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="laisser vide = public"
              />
            </div>
            <div>
              <Label htmlFor="rcon">Mot de passe RCON (optionnel)</Label>
              <Input
                id="rcon"
                type="text"
                value={rconPassword}
                onChange={(e) => setRconPassword(e.target.value)}
                placeholder="administration"
              />
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting} disabled={!canSubmit}>
            <Plus className="w-4 h-4" />
            Créer et démarrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
