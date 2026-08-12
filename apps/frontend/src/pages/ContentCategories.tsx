import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ChevronUp, ChevronDown, Search, Car as CarIcon, MapPin } from 'lucide-react';
import {
  contentCategoriesApi,
  type ContentCategory,
  type ContentCategoryType,
} from '../services/contentCategories';
import { PageShell } from '../components/ui/PageShell';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function ContentCategories() {
  const { data: carCategories = [], isLoading: carLoading } = useQuery({
    queryKey: ['content-categories', 'car'],
    queryFn: () => contentCategoriesApi.list('car'),
  });
  const { data: trackCategories = [], isLoading: trackLoading } = useQuery({
    queryKey: ['content-categories', 'track'],
    queryFn: () => contentCategoriesApi.list('track'),
  });

  return (
    <PageShell
      title="Catégories"
      accent="voitures & circuits"
      subtitle="La liste utilisée par le sélecteur de catégorie sur /content-names et par les filtres de /tablet-menu — renommer ou supprimer une catégorie ici met aussi à jour toutes les voitures/circuits déjà tagués avec."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <CategorySection
          type="car"
          label="Voitures"
          icon={CarIcon}
          categories={carCategories}
          isLoading={carLoading}
        />
        <CategorySection
          type="track"
          label="Circuits"
          icon={MapPin}
          categories={trackCategories}
          isLoading={trackLoading}
        />
      </div>
    </PageShell>
  );
}

function CategorySection({
  type,
  label,
  icon: Icon,
  categories,
  isLoading,
}: {
  type: ContentCategoryType;
  label: string;
  icon: React.ElementType;
  categories: ContentCategory[];
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(term));
  }, [categories, search]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['content-categories', type] });
    // Un renommage/suppression change aussi le champ `category` des
    // ContentLabel concernés côté backend — resynchroniser /content-names.
    void queryClient.invalidateQueries({ queryKey: ['content-labels-known'] });
  }

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      contentCategoriesApi.create({ type, name, sortOrder: categories.length }),
    onSuccess: () => {
      setNewName('');
      invalidate();
    },
  });

  const swapMutation = useMutation({
    mutationFn: ({ a, b }: { a: ContentCategory; b: ContentCategory }) =>
      Promise.all([
        contentCategoriesApi.update(a.id, { sortOrder: b.sortOrder }),
        contentCategoriesApi.update(b.id, { sortOrder: a.sortOrder }),
      ]),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => contentCategoriesApi.remove(id),
    onSuccess: invalidate,
  });

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    swapMutation.mutate({ a: categories[index], b: categories[target] });
  }

  return (
    <Card padding="sm" className="flex flex-col">
      <CardHeader
        title={label}
        subtitle={`${categories.length} catégorie${categories.length > 1 ? 's' : ''}`}
        action={<Icon className="h-5 w-5 text-gray-500" />}
      />

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-accent-orange/30 border-t-accent-orange rounded-full animate-spin" />
        </div>
      ) : categories.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">Aucune catégorie pour le moment.</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">Aucun résultat pour ce filtre.</p>
      ) : (
        <div className="max-h-[440px] space-y-1 overflow-y-auto pr-1">
          {filtered.map((category) => {
            const index = categories.findIndex((c) => c.id === category.id);
            return (
              <CategoryRow
                key={category.id}
                category={category}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                canMoveUp={index > 0}
                canMoveDown={index < categories.length - 1}
                onRemove={() => removeMutation.mutate(category.id)}
                isRemoving={removeMutation.isPending && removeMutation.variables === category.id}
                isReordering={swapMutation.isPending}
              />
            );
          })}
        </div>
      )}

      <form
        className="mt-4 flex gap-2 border-t border-dark-700 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = newName.trim();
          if (trimmed) createMutation.mutate(trimmed);
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nouvelle catégorie..."
          className="flex-1"
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!newName.trim()}
          isLoading={createMutation.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </Button>
      </form>
      {createMutation.isError && (
        <p className="mt-2 text-xs text-accent-red">
          Cette catégorie existe déjà pour {label.toLowerCase()}.
        </p>
      )}
    </Card>
  );
}

function CategoryRow({
  category,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onRemove,
  isRemoving,
  isReordering,
}: {
  category: ContentCategory;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: () => void;
  isRemoving: boolean;
  isReordering: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(category.name);
  const [confirming, setConfirming] = useState(false);

  const renameMutation = useMutation({
    mutationFn: (value: string) => contentCategoriesApi.update(category.id, { name: value }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['content-categories', category.type] });
      void queryClient.invalidateQueries({ queryKey: ['content-labels-known'] });
    },
    onError: () => setName(category.name),
  });

  const trimmed = name.trim();
  const hasChanged = trimmed.length > 0 && trimmed !== category.name;

  return (
    <div className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-dark-700/40">
      <div className="flex flex-none flex-col">
        <button
          type="button"
          disabled={!canMoveUp || isReordering}
          onClick={onMoveUp}
          className="text-gray-500 hover:text-gray-300 disabled:opacity-20"
          title="Monter"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={!canMoveDown || isReordering}
          onClick={onMoveDown}
          className="text-gray-500 hover:text-gray-300 disabled:opacity-20"
          title="Descendre"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (hasChanged) renameMutation.mutate(trimmed);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="h-8 flex-1 px-2.5 py-1 text-sm"
      />

      {confirming ? (
        <div className="flex flex-none items-center gap-1">
          <Button size="sm" variant="danger" isLoading={isRemoving} onClick={onRemove}>
            Confirmer
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Annuler
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(true)}
          title="Supprimer"
          className="flex-none text-accent-red hover:text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
