import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Tag,
  Search,
  Check,
  RotateCcw,
  Car as CarIcon,
  MapPin,
  FlipHorizontal,
} from 'lucide-react';
import { contentLabelsApi, type KnownContentItem } from '../services/contentLabels';
import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';

export function ContentNames() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['content-labels-known'],
    queryFn: contentLabelsApi.getKnown,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false;
      if (!term) return true;
      return (
        item.rawName.toLowerCase().includes(term) ||
        item.acId.toLowerCase().includes(term) ||
        (item.displayName ?? '').toLowerCase().includes(term)
      );
    });
  }, [items, search, typeFilter]);

  const stats = useMemo(() => {
    const cars = items.filter((i) => i.type === 'car').length;
    const tracks = items.filter((i) => i.type === 'track').length;
    const renamed = items.filter((i) => i.displayName).length;
    return { total: items.length, cars, tracks, renamed };
  }, [items]);

  return (
    <PageShell
      title="Noms"
      accent="affichés"
      subtitle="Donne un nom plus joli aux voitures et circuits vus par les agents, une catégorie et une difficulté — affichés partout dans le dashboard, et sur la page tablette /tablet-menu"
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="gray">Total {stats.total}</Badge>
          <Badge variant="blue">Voitures {stats.cars}</Badge>
          <Badge variant="green">Circuits {stats.tracks}</Badge>
          <Badge variant="purple">Renommés {stats.renamed}</Badge>
        </div>
      }
    >
      <Card padding="sm" className="space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-400 mb-1">Recherche</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom technique, acId ou nom affiché..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="lg:w-48">
            <label className="block text-xs font-medium text-gray-400 mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-dark-600 bg-dark-900 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-orange"
            >
              <option value="">Tous</option>
              <option value="car">Voitures</option>
              <option value="track">Circuits</option>
            </select>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent-orange/30 border-t-accent-orange rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Tag className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">
            {items.length === 0
              ? "Aucun contenu connu pour le moment — attends qu'un poste envoie son contenu."
              : 'Aucun résultat pour cette recherche.'}
          </p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="divide-y divide-dark-700">
            {filtered.map((item) => (
              <ContentNameRow key={`${item.type}:${item.acId}`} item={item} />
            ))}
          </div>
        </Card>
      )}
    </PageShell>
  );
}

interface RowPayload {
  displayName: string;
  category?: string;
  difficulty?: number;
  year?: number;
  country?: string;
  countryCode?: string;
  description?: string;
  powerHp?: number;
  weightKg?: number;
  mirrored?: boolean;
  visible?: boolean;
}

/** Emoji drapeau à partir d'un code ISO 3166-1 alpha-2 (ex: "FR" -> 🇫🇷) —
 * combinaison Unicode de deux "regional indicator symbols", pas d'image. */
function flagEmoji(countryCode: string | null): string {
  if (!countryCode || countryCode.length !== 2) return '';
  return countryCode
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

function ContentNameRow({ item }: { item: KnownContentItem }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item.displayName ?? '');
  const [category, setCategory] = useState(item.category ?? '');
  const [difficulty, setDifficulty] = useState<number | null>(item.difficulty);
  const [year, setYear] = useState(item.year ? String(item.year) : '');
  const [country, setCountry] = useState(item.country ?? '');
  const [countryCode, setCountryCode] = useState(item.countryCode ?? '');
  const [description, setDescription] = useState(item.description ?? '');
  const [powerHp, setPowerHp] = useState(item.powerHp ? String(item.powerHp) : '');
  const [weightKg, setWeightKg] = useState(item.weightKg ? String(item.weightKg) : '');
  const [mirrored, setMirrored] = useState(item.mirrored);
  const [visible, setVisible] = useState(item.visible);

  useEffect(() => {
    setName(item.displayName ?? '');
    setCategory(item.category ?? '');
    setDifficulty(item.difficulty);
    setYear(item.year ? String(item.year) : '');
    setCountry(item.country ?? '');
    setCountryCode(item.countryCode ?? '');
    setDescription(item.description ?? '');
    setPowerHp(item.powerHp ? String(item.powerHp) : '');
    setWeightKg(item.weightKg ? String(item.weightKg) : '');
    setMirrored(item.mirrored);
    setVisible(item.visible);
  }, [
    item.displayName,
    item.category,
    item.difficulty,
    item.year,
    item.country,
    item.countryCode,
    item.description,
    item.powerHp,
    item.weightKg,
    item.mirrored,
    item.visible,
  ]);

  const mutation = useMutation({
    mutationFn: (payload: RowPayload) =>
      contentLabelsApi.upsert({ type: item.type, acId: item.acId, ...payload }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['content-labels-known'] });
      void queryClient.invalidateQueries({ queryKey: ['content-labels-map'] });
    },
  });

  const trimmedName = name.trim();
  const trimmedCategory = category.trim();
  const trimmedCountry = country.trim();
  const trimmedCountryCode = countryCode.trim().toUpperCase();
  const trimmedDescription = description.trim();
  const parsedYear = year.trim() ? Number(year.trim()) : null;
  const parsedPowerHp = powerHp.trim() ? Number(powerHp.trim()) : null;
  const parsedWeightKg = weightKg.trim() ? Number(weightKg.trim()) : null;
  const hasChanged =
    trimmedName !== (item.displayName ?? '') ||
    trimmedCategory !== (item.category ?? '') ||
    difficulty !== item.difficulty ||
    parsedYear !== item.year ||
    trimmedCountry !== (item.country ?? '') ||
    trimmedCountryCode !== (item.countryCode ?? '') ||
    trimmedDescription !== (item.description ?? '') ||
    parsedPowerHp !== item.powerHp ||
    parsedWeightKg !== item.weightKg ||
    mirrored !== item.mirrored ||
    visible !== item.visible;
  const hasOverride = Boolean(
    item.displayName ||
    item.category ||
    item.difficulty ||
    item.year ||
    item.country ||
    item.countryCode ||
    item.description ||
    item.powerHp ||
    item.weightKg ||
    item.mirrored ||
    !item.visible,
  );

  function save(overrides: Partial<RowPayload> = {}) {
    mutation.mutate({
      displayName: trimmedName,
      category: trimmedCategory || undefined,
      difficulty: difficulty ?? undefined,
      year: parsedYear ?? undefined,
      country: trimmedCountry || undefined,
      countryCode: trimmedCountryCode || undefined,
      description: trimmedDescription || undefined,
      powerHp: parsedPowerHp ?? undefined,
      weightKg: parsedWeightKg ?? undefined,
      mirrored: mirrored || undefined,
      visible,
      ...overrides,
    });
  }

  return (
    <div
      className={`flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-dark-700/30 ${!visible ? 'opacity-50' : ''}`}
    >
      {/* Identité (lecture seule) + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={item.type === 'car' ? 'blue' : 'green'}>
          {item.type === 'car' ? <CarIcon className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
          {item.type === 'car' ? 'Voiture' : 'Circuit'}
        </Badge>

        <div className="min-w-0">
          <p className="truncate text-sm text-white" title={item.rawName}>
            {item.rawName}
          </p>
          <p className="truncate text-[10px] text-gray-500" title={item.acId}>
            {item.acId}
          </p>
        </div>

        <label className="flex flex-none cursor-pointer items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
            className="h-4 w-4 rounded border-dark-500 bg-dark-800 text-accent-orange focus:ring-accent-orange"
          />
          Afficher sur le catalogue
        </label>

        <div className="ml-auto flex flex-none items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={!hasChanged}
            isLoading={mutation.isPending}
            onClick={() => save()}
          >
            <Check className="w-3.5 h-3.5" />
            Enregistrer
          </Button>
          {hasOverride && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setName('');
                setCategory('');
                setDifficulty(null);
                setYear('');
                setCountry('');
                setCountryCode('');
                setDescription('');
                setPowerHp('');
                setWeightKg('');
                setMirrored(false);
                setVisible(true);
                save({
                  displayName: '',
                  category: undefined,
                  difficulty: undefined,
                  year: undefined,
                  country: undefined,
                  countryCode: undefined,
                  description: undefined,
                  powerHp: undefined,
                  weightKg: undefined,
                  mirrored: undefined,
                  visible: true,
                });
              }}
              title="Tout réinitialiser"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Champs éditables, groupés et étiquetés pour rester lisibles même une
          fois remplis (le placeholder seul disparaît dès qu'on tape). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Nom affiché" className="col-span-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={item.rawName}
            className="w-full"
          />
        </Field>

        <Field label="Catégorie">
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="ex: GT3"
            className="w-full"
          />
        </Field>

        <Field label="Difficulté">
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        </Field>

        {item.type === 'car' && (
          <Field label="Photo">
            <button
              type="button"
              onClick={() => setMirrored((v) => !v)}
              title="Retourner la photo horizontalement sur /tablet-menu (capot à droite)"
              className={`flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
                mirrored
                  ? 'border-accent-orange bg-accent-orange/15 text-accent-orange'
                  : 'border-dark-600 bg-dark-900 text-gray-400 hover:bg-dark-700'
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              Miroir
            </button>
          </Field>
        )}

        <Field label="Année">
          <Input
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder="ex: 2024"
            inputMode="numeric"
            className="w-full"
          />
        </Field>

        <Field label="Pays">
          <Input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="ex: Italie"
            className="w-full"
          />
        </Field>

        <Field label="Code pays">
          <div className="flex items-center gap-1.5">
            <Input
              value={countryCode}
              onChange={(e) =>
                setCountryCode(
                  e.target.value
                    .replace(/[^a-zA-Z]/g, '')
                    .slice(0, 2)
                    .toUpperCase(),
                )
              }
              placeholder="FR"
              className="w-full"
            />
            {trimmedCountryCode.length === 2 && (
              <span className="text-lg" title={trimmedCountryCode}>
                {flagEmoji(trimmedCountryCode)}
              </span>
            )}
          </div>
        </Field>

        <Field label="Puissance (ch)">
          <Input
            value={powerHp}
            onChange={(e) => setPowerHp(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
            placeholder="ex: 450"
            inputMode="numeric"
            className="w-full"
          />
        </Field>

        <Field label="Poids (kg)">
          <Input
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
            placeholder="ex: 1200"
            inputMode="numeric"
            className="w-full"
          />
        </Field>

        <Field label="Description" className="col-span-2 sm:col-span-3 lg:col-span-6">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optionnel"
            className="w-full"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function DifficultyPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex flex-none items-center gap-1" title="Difficulté (1-5)">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={`h-5 w-3 rounded-sm transition-colors ${
            value !== null && n <= value ? 'bg-accent-orange' : 'bg-dark-600 hover:bg-dark-500'
          }`}
          title={`Difficulté ${n}/5`}
        />
      ))}
    </div>
  );
}
