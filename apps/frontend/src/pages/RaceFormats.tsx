import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, Plus, Pencil, Trash2, Clock, Users, CloudSun } from 'lucide-react';
import { RaceMode, GridType } from '@simracing/shared';
import { raceFormatsApi, type RaceFormat, type RaceFormatInput } from '../services/raceFormats';
import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input, Select, Textarea, Label } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

const GRID_TYPE_LABELS: Record<GridType, string> = {
  [GridType.NORMAL]: 'Grille normale',
  [GridType.REVERSED_TOP_3]: 'Top 3 inversé',
  [GridType.REVERSED_TOP_8]: 'Top 8 inversé',
  [GridType.REVERSED_FULL]: 'Grille inversée',
};

const DEFAULT_INPUT: RaceFormatInput = {
  name: '',
  description: '',
  practiceEnabled: true,
  practiceMinutes: 720,
  qualifyingEnabled: false,
  qualifyingMinutes: 15,
  raceEnabled: false,
  raceMode: RaceMode.LAPS,
  raceLaps: 5,
  raceMinutes: 20,
  gridType: GridType.NORMAL,
  weatherGraphics: ['3_clear'],
};

export function RaceFormats() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RaceFormat | 'new' | null>(null);

  const { data: formats = [], isLoading } = useQuery({
    queryKey: ['race-formats'],
    queryFn: raceFormatsApi.list,
  });

  const removeMutation = useMutation({
    mutationFn: raceFormatsApi.remove,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['race-formats'] }),
  });

  return (
    <PageShell
      title="Formats"
      accent="de course"
      subtitle="Practice, Qualifying, Race — les presets réutilisables proposés à la création d'un serveur dédié"
      actions={
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" />
          Nouveau format
        </Button>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent-orange/30 border-t-accent-orange rounded-full animate-spin" />
        </div>
      ) : formats.length === 0 ? (
        <Card className="p-12 text-center">
          <Flag className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Aucun format de course pour le moment.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {formats.map((format) => (
            <RaceFormatCard
              key={format.id}
              format={format}
              onEdit={() => setEditing(format)}
              onRemove={() => removeMutation.mutate(format.id)}
              isRemoving={removeMutation.isPending && removeMutation.variables === format.id}
            />
          ))}
        </div>
      )}

      {editing && (
        <RaceFormatFormModal
          format={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </PageShell>
  );
}

function RaceFormatCard({
  format,
  onEdit,
  onRemove,
  isRemoving,
}: {
  format: RaceFormat;
  onEdit: () => void;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-white">{format.name}</h3>
          {format.description && (
            <p className="mt-1 text-sm text-gray-400 line-clamp-2">{format.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit} title="Modifier">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            isLoading={isRemoving}
            title="Supprimer"
            className="text-accent-red hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {format.practiceEnabled && (
          <Badge variant="blue">
            <Clock className="h-3 w-3" />
            Practice {formatMinutes(format.practiceMinutes)}
          </Badge>
        )}
        {format.qualifyingEnabled && (
          <Badge variant="purple">
            <Clock className="h-3 w-3" />
            Qualifying {formatMinutes(format.qualifyingMinutes)}
          </Badge>
        )}
        {format.raceEnabled && (
          <Badge variant="green">
            <Flag className="h-3 w-3" />
            Race{' '}
            {format.raceMode === RaceMode.LAPS
              ? `${format.raceLaps} tours`
              : formatMinutes(format.raceMinutes)}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        {format.raceEnabled && (
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {GRID_TYPE_LABELS[format.gridType]}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <CloudSun className="h-3.5 w-3.5" />
          {format.weatherGraphics.join(', ')}
        </span>
      </div>
    </Card>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes % 60 === 0 && minutes >= 60) return `${minutes / 60}h`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
  return `${minutes} min`;
}

function RaceFormatFormModal({
  format,
  onClose,
}: {
  format: RaceFormat | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState<RaceFormatInput>(
    format
      ? {
          name: format.name,
          description: format.description ?? '',
          practiceEnabled: format.practiceEnabled,
          practiceMinutes: format.practiceMinutes,
          qualifyingEnabled: format.qualifyingEnabled,
          qualifyingMinutes: format.qualifyingMinutes,
          raceEnabled: format.raceEnabled,
          raceMode: format.raceMode,
          raceLaps: format.raceLaps,
          raceMinutes: format.raceMinutes,
          gridType: format.gridType,
          weatherGraphics: format.weatherGraphics,
        }
      : DEFAULT_INPUT,
  );
  const [weatherText, setWeatherText] = useState(input.weatherGraphics.join(', '));

  const atLeastOneEnabled = input.practiceEnabled || input.qualifyingEnabled || input.raceEnabled;
  const canSubmit = input.name.trim().length > 0 && atLeastOneEnabled;

  const mutation = useMutation({
    mutationFn: () => {
      const weatherGraphics = weatherText
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      const payload: RaceFormatInput = {
        ...input,
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
        weatherGraphics: weatherGraphics.length > 0 ? weatherGraphics : ['3_clear'],
      };
      return format ? raceFormatsApi.update(format.id, payload) : raceFormatsApi.create(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['race-formats'] });
      onClose();
    },
  });

  return (
    <Modal
      title={format ? 'Modifier le format' : 'Nouveau format de course'}
      onClose={onClose}
      size="lg"
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) mutation.mutate();
        }}
      >
        <div>
          <Label htmlFor="rf-name">Nom</Label>
          <Input
            id="rf-name"
            value={input.name}
            onChange={(e) => setInput({ ...input, name: e.target.value })}
            placeholder="ex: Week-end de course"
            required
          />
        </div>

        <div>
          <Label htmlFor="rf-description">Description</Label>
          <Textarea
            id="rf-description"
            value={input.description}
            onChange={(e) => setInput({ ...input, description: e.target.value })}
            placeholder="Optionnel — un rappel de quand utiliser ce format"
            rows={2}
          />
        </div>

        <SessionToggleSection
          title="Practice"
          enabled={input.practiceEnabled}
          onToggle={(enabled) => setInput({ ...input, practiceEnabled: enabled })}
        >
          <div>
            <Label htmlFor="rf-practice-minutes">Durée (minutes)</Label>
            <Input
              id="rf-practice-minutes"
              type="number"
              min={1}
              max={1440}
              value={input.practiceMinutes}
              onChange={(e) => setInput({ ...input, practiceMinutes: Number(e.target.value) })}
            />
          </div>
        </SessionToggleSection>

        <SessionToggleSection
          title="Qualifying"
          enabled={input.qualifyingEnabled}
          onToggle={(enabled) => setInput({ ...input, qualifyingEnabled: enabled })}
        >
          <div>
            <Label htmlFor="rf-qualifying-minutes">Durée (minutes)</Label>
            <Input
              id="rf-qualifying-minutes"
              type="number"
              min={1}
              max={180}
              value={input.qualifyingMinutes}
              onChange={(e) => setInput({ ...input, qualifyingMinutes: Number(e.target.value) })}
            />
          </div>
        </SessionToggleSection>

        <SessionToggleSection
          title="Race"
          enabled={input.raceEnabled}
          onToggle={(enabled) => setInput({ ...input, raceEnabled: enabled })}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rf-race-mode">Type</Label>
              <Select
                id="rf-race-mode"
                value={input.raceMode}
                onChange={(e) => setInput({ ...input, raceMode: e.target.value as RaceMode })}
              >
                <option value={RaceMode.LAPS}>Nombre de tours</option>
                <option value={RaceMode.TIME}>Durée</option>
              </Select>
            </div>
            {input.raceMode === RaceMode.LAPS ? (
              <div>
                <Label htmlFor="rf-race-laps">Tours</Label>
                <Input
                  id="rf-race-laps"
                  type="number"
                  min={1}
                  max={500}
                  value={input.raceLaps}
                  onChange={(e) => setInput({ ...input, raceLaps: Number(e.target.value) })}
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="rf-race-minutes">Minutes</Label>
                <Input
                  id="rf-race-minutes"
                  type="number"
                  min={1}
                  max={360}
                  value={input.raceMinutes}
                  onChange={(e) => setInput({ ...input, raceMinutes: Number(e.target.value) })}
                />
              </div>
            )}
            <div className="col-span-2">
              <Label htmlFor="rf-grid-type">Grille de départ</Label>
              <Select
                id="rf-grid-type"
                value={input.gridType}
                onChange={(e) => setInput({ ...input, gridType: e.target.value as GridType })}
              >
                {Object.entries(GRID_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-gray-500">
                Basée sur le résultat de Qualifying — sans effet si Qualifying est désactivé.
              </p>
            </div>
          </div>
        </SessionToggleSection>

        <div>
          <Label htmlFor="rf-weather">Météo</Label>
          <Input
            id="rf-weather"
            value={weatherText}
            onChange={(e) => setWeatherText(e.target.value)}
            placeholder="3_clear, 3_mid_clouds, rain"
          />
          <p className="mt-1 text-xs text-gray-500">
            Un ou plusieurs identifiants météo AC séparés par des virgules — le serveur alterne
            entre eux d'un lancement à l'autre s'il y en a plusieurs.
          </p>
        </div>

        {!atLeastOneEnabled && (
          <p className="text-sm text-accent-red">
            Au moins une session (Practice, Qualifying ou Race) doit être activée.
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-dark-600 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit}
            isLoading={mutation.isPending}
          >
            {format ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SessionToggleSection({
  title,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dark-600 bg-dark-900/50 p-4">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 rounded border-dark-500 bg-dark-800 text-accent-orange focus:ring-accent-orange"
        />
        <span className="font-semibold text-white">{title}</span>
      </label>
      {enabled && <div className="mt-4">{children}</div>}
    </div>
  );
}
