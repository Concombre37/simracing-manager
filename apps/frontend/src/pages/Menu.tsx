import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, UtensilsCrossed, GlassWater } from 'lucide-react';
import { menuApi, type MenuCategory, type MenuItem, type MenuItemInput } from '../services/menu';
import { PageShell } from '../components/ui/PageShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea, Label } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

type CategoryEditing = MenuCategory | { section: 'food' | 'drinks' } | null;
type ItemEditing = { item: MenuItem | null; categoryId: string } | null;

export function Menu() {
  const [editingCategory, setEditingCategory] = useState<CategoryEditing>(null);
  const [editingItem, setEditingItem] = useState<ItemEditing>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['menu'],
    queryFn: menuApi.listGrouped,
  });

  return (
    <PageShell
      title="Carte"
      accent="resto/bar"
      subtitle="Plats et boissons affichés sur la page tablette publique (/tablet-menu)"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent-orange/30 border-t-accent-orange rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          <MenuSection
            icon={UtensilsCrossed}
            title="Cuisine"
            section="food"
            categories={categories.filter((c) => c.section === 'food')}
            onNewCategory={() => setEditingCategory({ section: 'food' })}
            onEditCategory={setEditingCategory}
            onNewItem={(categoryId) => setEditingItem({ item: null, categoryId })}
            onEditItem={(item) => setEditingItem({ item, categoryId: item.categoryId })}
          />
          <MenuSection
            icon={GlassWater}
            title="Bar"
            section="drinks"
            categories={categories.filter((c) => c.section === 'drinks')}
            onNewCategory={() => setEditingCategory({ section: 'drinks' })}
            onEditCategory={setEditingCategory}
            onNewItem={(categoryId) => setEditingItem({ item: null, categoryId })}
            onEditItem={(item) => setEditingItem({ item, categoryId: item.categoryId })}
          />
        </div>
      )}

      {editingCategory && (
        <CategoryFormModal category={editingCategory} onClose={() => setEditingCategory(null)} />
      )}
      {editingItem && (
        <ItemFormModal
          item={editingItem.item}
          categoryId={editingItem.categoryId}
          onClose={() => setEditingItem(null)}
        />
      )}
    </PageShell>
  );
}

function MenuSection({
  icon: Icon,
  title,
  section,
  categories,
  onNewCategory,
  onEditCategory,
  onNewItem,
  onEditItem,
}: {
  icon: React.ElementType;
  title: string;
  section: 'food' | 'drinks';
  categories: MenuCategory[];
  onNewCategory: () => void;
  onEditCategory: (c: MenuCategory) => void;
  onNewItem: (categoryId: string) => void;
  onEditItem: (item: MenuItem) => void;
}) {
  const queryClient = useQueryClient();
  const removeCategoryMutation = useMutation({
    mutationFn: menuApi.removeCategory,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['menu'] }),
  });
  const removeItemMutation = useMutation({
    mutationFn: menuApi.removeItem,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['menu'] }),
  });

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <Icon className="w-5 h-5 text-accent-orange" />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" onClick={onNewCategory}>
          <Plus className="w-3.5 h-3.5" />
          Nouvelle catégorie
        </Button>
      </div>

      {categories.length === 0 ? (
        <Card className="p-8 text-center text-gray-500 text-sm">
          Aucune catégorie {section === 'food' ? 'cuisine' : 'bar'} pour le moment.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => (
            <Card key={category.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white truncate">{category.title}</h3>
                  {category.subtitle && (
                    <p className="text-xs text-gray-400 truncate">{category.subtitle}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onEditCategory(category)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeCategoryMutation.mutate(category.id)}
                    isLoading={
                      removeCategoryMutation.isPending &&
                      removeCategoryMutation.variables === category.id
                    }
                    className="text-accent-red hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="divide-y divide-dark-700 border-t border-dark-700">
                {category.items.length === 0 ? (
                  <p className="py-3 text-xs text-gray-500">Aucun article.</p>
                ) : (
                  category.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-gray-500 truncate">{item.description}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-accent-orange">
                        {item.price}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => onEditItem(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItemMutation.mutate(item.id)}
                        isLoading={
                          removeItemMutation.isPending && removeItemMutation.variables === item.id
                        }
                        className="text-accent-red hover:text-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              <Button size="sm" variant="secondary" onClick={() => onNewItem(category.id)}>
                <Plus className="h-3.5 w-3.5" />
                Nouvel article
              </Button>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function CategoryFormModal({
  category,
  onClose,
}: {
  category: MenuCategory | { section: 'food' | 'drinks' };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isNew = !('id' in category);
  const [title, setTitle] = useState(isNew ? '' : category.title);
  const [subtitle, setSubtitle] = useState(isNew ? '' : (category.subtitle ?? ''));

  const canSubmit = title.trim().length > 0;

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        section: category.section,
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
      };
      return isNew ? menuApi.createCategory(payload) : menuApi.updateCategory(category.id, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
      onClose();
    },
  });

  return (
    <Modal title={isNew ? 'Nouvelle catégorie' : 'Modifier la catégorie'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) mutation.mutate();
        }}
      >
        <div>
          <Label htmlFor="cat-title">Titre</Label>
          <Input
            id="cat-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex: Tartes flambées"
            required
          />
        </div>
        <div>
          <Label htmlFor="cat-subtitle">Sous-titre (optionnel)</Label>
          <Input
            id="cat-subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="ex: Pâte fine, cuite au feu de bois"
          />
        </div>
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
            {isNew ? 'Créer' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ItemFormModal({
  item,
  categoryId,
  onClose,
}: {
  item: MenuItem | null;
  categoryId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item?.price ?? '');

  const canSubmit = name.trim().length > 0 && price.trim().length > 0;

  const mutation = useMutation({
    mutationFn: () => {
      const payload: MenuItemInput = {
        categoryId,
        name: name.trim(),
        description: description.trim() || undefined,
        price: price.trim(),
      };
      return item ? menuApi.updateItem(item.id, payload) : menuApi.createItem(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
      onClose();
    },
  });

  return (
    <Modal title={item ? "Modifier l'article" : 'Nouvel article'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) mutation.mutate();
        }}
      >
        <div>
          <Label htmlFor="item-name">Nom</Label>
          <Input
            id="item-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Traditionnelle"
            required
          />
        </div>
        <div>
          <Label htmlFor="item-description">Description (optionnel)</Label>
          <Textarea
            id="item-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="ex: Crème fraîche, oignons, lardons"
            rows={2}
          />
        </div>
        <div>
          <Label htmlFor="item-price">Prix</Label>
          <Input
            id="item-price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="ex: 9,50 €"
            required
          />
        </div>
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
            {item ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
