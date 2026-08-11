import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Car, Flag, UtensilsCrossed, GlassWater, X, Hand, ImageOff, Rotate3d } from 'lucide-react';
import { tabletMenuApi, type CatalogItem } from '../services/tabletMenu';
import type { MenuCategory } from '../services/menu';

/** Emoji drapeau à partir d'un code ISO 3166-1 alpha-2 (ex: "FR" -> 🇫🇷) —
 * même principe que `ContentNames.tsx`, dupliqué ici (page publique
 * indépendante, pas de code partagé entre les deux). */
function flagEmoji(countryCode: string | null): string {
  if (!countryCode || countryCode.length !== 2) return '';
  return countryCode
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Regroupe les catégories très spécifiques renseignées sur `/content-names`
 * (ex: "Coupé sportif préparé", "Supercar historique préparée") en une
 * poignée de familles pour la barre de filtres — sinon un catalogue de 259
 * voitures avec des tags quasi-uniques par modèle produit ~80 pastilles de
 * filtre, illisible sur un écran tactile. Le tag exact reste affiché tel
 * quel sur la carte/fiche détail, seul le regroupement du filtre est lissé
 * ici (règles par mot-clé, ordre = priorité). */
const CATEGORY_GROUP_RULES: [RegExp, string][] = [
  [/kart/i, 'Kart'],
  [/formule 1.*historique|historique.*formule 1/i, 'Formule 1 historique'],
  [/formule 1/i, 'Formule 1'],
  [/formule|monoplace/i, 'Monoplace'],
  [/gt ?1\b/i, 'GT1'],
  [/gt ?2\b/i, 'GT2'],
  [/gt ?3\b/i, 'GT3'],
  [/gt ?4\b/i, 'GT4'],
  [/dtm/i, 'DTM'],
  [/nascar/i, 'NASCAR'],
  [/rallycross/i, 'Rallycross'],
  [/rallye|wrc/i, 'Rallye'],
  [/drift/i, 'Drift'],
  [/lmh|hypercar\/lmh/i, 'Hypercar/LMH'],
  [/hypercar/i, 'Hypercar'],
  [/lmp1/i, 'Prototype LMP1'],
  [/lmp2/i, 'Prototype LMP2'],
  [/lmp3/i, 'Prototype LMP3'],
  [/prototype|groupe c|groupe 5|groupe 6|can-am/i, 'Prototype historique'],
  [/gt le mans|gt \/ le mans/i, 'GT Le Mans'],
  [/gt historique/i, 'GT historique'],
  [/tourisme|cup|tcr/i, 'Tourisme/Cup'],
  [/muscle|trans-am/i, 'Muscle car'],
  [/supercar/i, 'Supercar'],
  [/roadster/i, 'Roadster'],
  [/coupé/i, 'Coupé sportif'],
  [/citadine/i, 'Citadine'],
  [/berline/i, 'Berline sportive'],
  [/suv/i, 'SUV sportif'],
  [/compacte/i, 'Compacte sportive'],
  [/voiture de piste|de c(o|ô)te/i, 'Voiture de piste'],
];

function categoryGroup(category: string): string {
  for (const [pattern, group] of CATEGORY_GROUP_RULES) {
    if (pattern.test(category)) return group;
  }
  return category;
}

// Nom réel de l'établissement (voir Layout.tsx — même logo/wordmark déjà
// utilisé ailleurs sur le dashboard). Pas de compte utilisateur sur cette
// page publique, donc pas d'accès à `useSiteLogo()` (endpoint protégé par
// JWT/clé station) — un texte simple suffit, le design d'origine n'affiche
// de toute façon que du texte ici, jamais une image de logo.
const VENUE_NAME = 'ELSASS SIMRACING HAGUENAU';

const IDLE_MS = 90_000;
const TAGLINE_INTERVAL_MS = 4600;

type TabKey = 'cars' | 'tracks' | 'food' | 'drinks';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'cars', label: 'Voitures', icon: Car },
  { key: 'tracks', label: 'Circuits', icon: Flag },
  { key: 'food', label: 'Cuisine', icon: UtensilsCrossed },
  { key: 'drinks', label: 'Bar', icon: GlassWater },
];

const TAB_COPY: Record<TabKey, { kicker: string; title: string; sub: string }> = {
  cars: {
    kicker: 'Le garage',
    title: 'Choisissez votre voiture',
    sub: 'Le catalogue de voitures disponibles sur nos simulateurs.',
  },
  tracks: {
    kicker: 'Les tracés',
    title: 'Choisissez votre circuit',
    sub: 'Les circuits disponibles sur nos simulateurs.',
  },
  food: {
    kicker: 'La cuisine',
    title: 'À table',
    sub: 'Servi en salle comme au bord des simulateurs.',
  },
  drinks: {
    kicker: 'Le bar',
    title: 'À boire',
    sub: 'Pressions locales, softs et boissons chaudes.',
  },
};

export function TabletMenu() {
  const [tab, setTab] = useState<TabKey>('cars');
  const [filter, setFilter] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<CatalogItem | null>(null);
  const [idle, setIdle] = useState(true);
  const [now, setNow] = useState(new Date());
  const [taglineIdx, setTaglineIdx] = useState(0);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const lastActivity = useRef(Date.now());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { data: catalog } = useQuery({
    queryKey: ['tablet-content'],
    queryFn: tabletMenuApi.getContent,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const { data: menuCategories = [] } = useQuery({
    queryKey: ['tablet-menu'],
    queryFn: tabletMenuApi.getMenu,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!idle && Date.now() - lastActivity.current > IDLE_MS) {
        setIdle(true);
        setTab('cars');
        setFilter(null);
        setOpenItem(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [idle]);

  useEffect(() => {
    const id = setInterval(() => setTaglineIdx((i) => (i + 1) % 3), TAGLINE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const taglines = useMemo(
    () => [
      `${catalog?.cars.length ?? 0} voitures disponibles`,
      `${catalog?.tracks.length ?? 0} circuits`,
      'Cuisine & bar sur place',
    ],
    [catalog],
  );

  const portrait = viewport.h > viewport.w * 1.05;

  function ping() {
    lastActivity.current = Date.now();
  }

  function wake() {
    ping();
    setIdle(false);
  }

  function selectTab(key: TabKey) {
    ping();
    setTab(key);
    setFilter(null);
    setOpenItem(null);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  const currentItems: CatalogItem[] = useMemo(
    () =>
      tab === 'cars' ? (catalog?.cars ?? []) : tab === 'tracks' ? (catalog?.tracks ?? []) : [],
    [tab, catalog],
  );
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          currentItems
            .map((i) => i.category)
            .filter(Boolean)
            .map((c) => categoryGroup(c as string)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [currentItems],
  );
  const filteredItems = filter
    ? currentItems.filter((i) => i.category && categoryGroup(i.category) === filter)
    : currentItems;

  const foodCategories = menuCategories.filter((c) => c.section === 'food');
  const drinkCategories = menuCategories.filter((c) => c.section === 'drinks');
  const menuGroups: MenuCategory[] = tab === 'food' ? foodCategories : drinkCategories;

  const copy = TAB_COPY[tab];
  const isCatalogTab = tab === 'cars' || tab === 'tracks';
  const isMenuTab = tab === 'food' || tab === 'drinks';

  return (
    <div
      onPointerDown={ping}
      className="tablet-menu"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: portrait ? 'column-reverse' : 'row',
        overflow: 'hidden',
        background: 'var(--tm-bg)',
        color: 'var(--tm-text)',
        fontFamily: 'var(--tm-font-body)',
      }}
    >
      <TabletMenuStyles />

      <div
        style={{
          position: 'absolute',
          inset: '-25%',
          pointerEvents: 'none',
          zIndex: 0,
          background:
            'radial-gradient(42% 42% at 24% 20%, color-mix(in srgb, var(--tm-accent) 18%, transparent), transparent 68%)',
          animation: 'tmGlow 20s ease-in-out infinite',
        }}
      />

      {/* Navigation */}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          display: 'flex',
          flexDirection: portrait ? 'row' : 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          gap: 8,
          flex: 'none',
          width: portrait ? '100%' : 150,
          height: portrait ? 108 : '100%',
          padding: portrait ? '10px 14px' : '18px 12px',
          background: 'color-mix(in srgb, var(--tm-surface) 62%, var(--tm-bg))',
        }}
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectTab(key)}
              style={{
                position: 'relative',
                flex: '1 1 0',
                minWidth: 0,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
                padding: '10px 4px',
                border: 0,
                borderRadius: 14,
                cursor: 'pointer',
                fontFamily: 'var(--tm-font-heading)',
                background: active
                  ? 'color-mix(in srgb, var(--tm-accent) 14%, transparent)'
                  : 'transparent',
                color: active
                  ? 'var(--tm-accent-300)'
                  : 'color-mix(in srgb, var(--tm-text) 62%, transparent)',
                transition: 'background .28s ease, color .28s ease',
              }}
            >
              <Icon size={28} />
              <span style={{ fontSize: 12.5, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                {label}
              </span>
              <span
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 6,
                  transform: 'translateX(-50%)',
                  width: active ? 22 : 0,
                  height: 2,
                  borderRadius: 2,
                  background: 'var(--tm-accent)',
                  transition: 'width .3s cubic-bezier(.16,1,.3,1)',
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Colonne principale */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          flex: '1 1 auto',
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: portrait ? '18px 26px 6px' : '20px 34px 6px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              marginRight: 'auto',
              minWidth: 0,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                flex: 'none',
                borderRadius: '50%',
                background: 'var(--tm-accent)',
                boxShadow: '0 0 16px var(--tm-accent)',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--tm-font-heading)',
                fontSize: 14,
                letterSpacing: '.24em',
                whiteSpace: 'nowrap',
              }}
            >
              {VENUE_NAME}
            </span>
          </div>
          <span
            style={{
              fontSize: 13,
              letterSpacing: '.08em',
              color: 'color-mix(in srgb, var(--tm-text) 50%, transparent)',
            }}
          >
            {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div style={{ flex: 'none', padding: portrait ? '10px 26px 18px' : '10px 34px 20px' }}>
          <div
            style={{
              fontSize: 11.5,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: 'var(--tm-accent)',
            }}
          >
            {copy.kicker}
          </div>
          <h1
            style={{
              margin: '8px 0 0',
              fontSize: portrait ? 36 : 40,
              letterSpacing: '-.02em',
              fontFamily: 'var(--tm-font-heading)',
            }}
          >
            {copy.title}
          </h1>
          <p
            style={{
              margin: '8px 0 0',
              maxWidth: '62ch',
              fontSize: 14.5,
              color: 'color-mix(in srgb, var(--tm-text) 58%, transparent)',
            }}
          >
            {copy.sub}
          </p>
        </div>

        <div
          ref={scrollRef}
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            padding: portrait ? '0 26px 34px' : '0 34px 40px',
          }}
        >
          {isCatalogTab && (
            <>
              {categories.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 22 }}>
                  <FilterChip active={filter === null} onClick={() => setFilter(null)}>
                    Toutes
                  </FilterChip>
                  {categories.map((cat) => (
                    <FilterChip key={cat} active={filter === cat} onClick={() => setFilter(cat)}>
                      {cat}
                    </FilterChip>
                  ))}
                </div>
              )}
              {filteredItems.length === 0 ? (
                <EmptyState
                  label={
                    tab === 'cars'
                      ? 'Aucune voiture pour le moment.'
                      : 'Aucun circuit pour le moment.'
                  }
                />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${portrait ? 2 : 3}, minmax(0,1fr))`,
                    gap: portrait ? 16 : 20,
                  }}
                >
                  {filteredItems.map((item) => (
                    <CatalogCard key={item.acId} item={item} onOpen={() => setOpenItem(item)} />
                  ))}
                </div>
              )}
            </>
          )}

          {isMenuTab && (
            <>
              {menuGroups.length === 0 ? (
                <EmptyState label="Aucun article pour le moment." />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${portrait ? 1 : 2}, minmax(0,1fr))`,
                    gap: portrait ? 18 : 22,
                  }}
                >
                  {menuGroups.map((group) => (
                    <MenuGroupCard key={group.id} group={group} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {openItem && (
        <DetailModal item={openItem} onClose={() => setOpenItem(null)} portrait={portrait} />
      )}

      {idle && (
        <IdleScreen portrait={portrait} tagline={taglines[taglineIdx]} now={now} onWake={wake} />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 18px',
        borderRadius: 999,
        cursor: 'pointer',
        fontFamily: 'var(--tm-font-heading)',
        fontSize: 13.5,
        border: `1px solid ${active ? 'var(--tm-accent)' : 'var(--tm-divider)'}`,
        background: active
          ? 'color-mix(in srgb, var(--tm-accent) 16%, transparent)'
          : 'transparent',
        color: active
          ? 'var(--tm-accent-200)'
          : 'color-mix(in srgb, var(--tm-text) 66%, transparent)',
        transition: 'all .22s ease',
      }}
    >
      {children}
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px dashed var(--tm-divider)',
        background: 'color-mix(in srgb, var(--tm-surface) 50%, transparent)',
        padding: '64px 0',
        textAlign: 'center',
        color: 'color-mix(in srgb, var(--tm-text) 50%, transparent)',
      }}
    >
      {label}
    </div>
  );
}

function DifficultyDots({ value }: { value: number }) {
  return (
    <span style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          style={{
            width: 16,
            height: 4,
            borderRadius: 2,
            background:
              n <= value
                ? 'var(--tm-accent)'
                : 'color-mix(in srgb, var(--tm-text) 14%, transparent)',
          }}
        />
      ))}
    </span>
  );
}

function CatalogCard({ item, onOpen }: { item: CatalogItem; onOpen: () => void }) {
  const flag = flagEmoji(item.countryCode);
  const subtitle = [flag ? `${flag} ${item.country ?? ''}`.trim() : item.country, item.year]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      role="button"
      onClick={onOpen}
      className="tm-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--tm-surface)',
        boxShadow: '0 0 0 1px color-mix(in srgb, var(--tm-text) 10%, transparent)',
        cursor: 'pointer',
        transition: 'box-shadow .25s ease, transform .18s ease',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: 176,
          background: 'color-mix(in srgb, #000 70%, var(--tm-surface))',
        }}
      >
        {item.previewUrl ? (
          <img
            src={item.previewUrl}
            alt={item.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ImageOff size={28} color="color-mix(in srgb, var(--tm-text) 30%, transparent)" />
          </div>
        )}
        {item.category && (
          <span
            style={{
              position: 'absolute',
              left: 12,
              top: 12,
              padding: '3px 10px',
              borderRadius: 8,
              fontSize: 11,
              background: 'var(--tm-accent-800)',
              color: 'var(--tm-accent-100)',
            }}
          >
            {item.category}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px 16px' }}>
        <span style={{ fontFamily: 'var(--tm-font-heading)', fontSize: 17 }}>{item.name}</span>
        {subtitle && (
          <span
            style={{ fontSize: 12.5, color: 'color-mix(in srgb, var(--tm-text) 55%, transparent)' }}
          >
            {subtitle}
          </span>
        )}
        {item.difficulty !== null && <DifficultyDots value={item.difficulty} />}
      </div>
    </div>
  );
}

/** Image inclinable au doigt/à la souris (effet "on tourne la voiture") —
 * pas un vrai modèle 3D (voir décision produit : seule une photo 2D existe
 * réellement en base, aucun modèle .kn5 n'est accessible côté serveur),
 * juste une bascule/parallaxe CSS pilotée par le glissement du pointeur,
 * bornée pour rester crédible sur une simple photo à plat. */
function Tilt3DImage({ src, alt }: { src: string; alt: string }) {
  const [rot, setRot] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const dragStart = useRef<{ x: number; y: number; rotX: number; rotY: number } | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setInteracted(true);
    dragStart.current = { x: e.clientX, y: e.clientY, rotX: rot.x, rotY: rot.y };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setRot({
      x: clamp(dragStart.current.rotX - dy * 0.35, -16, 16),
      y: clamp(dragStart.current.rotY + dx * 0.35, -28, 28),
    });
  }
  function onPointerUp() {
    setDragging(false);
    dragStart.current = null;
    setRot({ x: 0, y: 0 });
  }

  return (
    <div style={{ position: 'absolute', inset: 0, perspective: 900 }}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={interacted ? undefined : 'tm-tilt-hint'}
        style={{
          width: '100%',
          height: '100%',
          touchAction: 'none',
          cursor: dragging ? 'grabbing' : 'grab',
          transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg) scale(${dragging ? 1.04 : 1})`,
          transition: dragging ? 'none' : 'transform .6s cubic-bezier(.16,1,.3,1)',
          transformStyle: 'preserve-3d',
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `linear-gradient(${115 + rot.y}deg, color-mix(in srgb, #fff ${dragging ? 16 : 8}%, transparent), transparent 55%)`,
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 14,
          top: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderRadius: 999,
          fontSize: 11,
          pointerEvents: 'none',
          background: 'color-mix(in srgb, #05060c 55%, transparent)',
          color: 'color-mix(in srgb, var(--tm-text) 80%, transparent)',
        }}
      >
        <Rotate3d size={13} />
        Glissez pour incliner
      </div>
    </div>
  );
}

function MenuGroupCard({ group }: { group: MenuCategory }) {
  return (
    <div
      style={{
        padding: '22px 24px 12px',
        borderRadius: 14,
        background: 'color-mix(in srgb, var(--tm-surface) 70%, transparent)',
      }}
    >
      <div style={{ fontFamily: 'var(--tm-font-heading)', fontSize: 21 }}>{group.title}</div>
      {group.subtitle && (
        <div
          style={{
            marginTop: 4,
            fontSize: 13,
            color: 'color-mix(in srgb, var(--tm-text) 50%, transparent)',
          }}
        >
          {group.subtitle}
        </div>
      )}
      <div
        style={{
          height: 1,
          margin: '16px 0 6px',
          background: 'linear-gradient(to right, var(--tm-divider), transparent)',
        }}
      />
      {group.items.length === 0 ? (
        <p
          style={{
            fontSize: 13,
            color: 'color-mix(in srgb, var(--tm-text) 45%, transparent)',
            padding: '11px 0',
          }}
        >
          Rien pour le moment.
        </p>
      ) : (
        group.items.map((item) => (
          <div key={item.id} style={{ padding: '11px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--tm-font-heading)', fontSize: 17.5 }}>
                {item.name}
              </span>
              <span
                style={{
                  flex: '1 1 auto',
                  height: 1,
                  background:
                    'linear-gradient(to right, color-mix(in srgb, var(--tm-text) 14%, transparent), transparent)',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--tm-font-heading)',
                  fontSize: 17.5,
                  color: 'var(--tm-accent-300)',
                }}
              >
                {item.price}
              </span>
            </div>
            {item.description && (
              <div
                style={{
                  marginTop: 3,
                  fontSize: 13,
                  maxWidth: '48ch',
                  color: 'color-mix(in srgb, var(--tm-text) 55%, transparent)',
                }}
              >
                {item.description}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function DetailModal({
  item,
  onClose,
  portrait,
}: {
  item: CatalogItem;
  onClose: () => void;
  portrait: boolean;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: portrait ? 28 : 40,
        background: 'color-mix(in srgb, #05060c 72%, transparent)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: 'min(680px, 100%)',
          maxHeight: '100%',
          borderRadius: 14,
          overflow: 'hidden',
          background: 'var(--tm-surface)',
          boxShadow: '0 16px 40px rgba(0,0,0,.65)',
        }}
      >
        <div
          style={{
            position: 'relative',
            flex: 'none',
            height: portrait ? 240 : 300,
            background: 'color-mix(in srgb, #000 70%, var(--tm-surface))',
          }}
        >
          {item.previewUrl ? (
            <Tilt3DImage src={item.previewUrl} alt={item.name} />
          ) : (
            <div
              style={{
                display: 'flex',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ImageOff size={40} color="color-mix(in srgb, var(--tm-text) 30%, transparent)" />
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: 'linear-gradient(to top, var(--tm-surface), transparent 55%)',
            }}
          />
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute',
              right: 14,
              top: 14,
              width: 48,
              height: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              cursor: 'pointer',
              border: '1px solid var(--tm-divider)',
              background: 'color-mix(in srgb, #05060c 55%, transparent)',
              color: 'var(--tm-text)',
            }}
          >
            <X size={20} />
          </button>
          <div
            style={{ position: 'absolute', left: 26, bottom: 18, right: 26, pointerEvents: 'none' }}
          >
            {item.category && (
              <span
                style={{
                  display: 'inline-flex',
                  padding: '3px 10px',
                  borderRadius: 8,
                  fontSize: 11,
                  background: 'var(--tm-accent-800)',
                  color: 'var(--tm-accent-100)',
                }}
              >
                {item.category}
              </span>
            )}
            <h2
              style={{
                margin: '10px 0 0',
                fontSize: portrait ? 28 : 32,
                letterSpacing: '-.02em',
                fontFamily: 'var(--tm-font-heading)',
              }}
            >
              {item.name}
            </h2>
          </div>
        </div>
        {(item.country || item.year || item.description || item.difficulty !== null) && (
          <div
            style={{ padding: '20px 26px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            {(item.country || item.year) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5 }}>
                {flagEmoji(item.countryCode) && <span>{flagEmoji(item.countryCode)}</span>}
                <span>{[item.country, item.year].filter(Boolean).join(' · ')}</span>
              </div>
            )}
            {item.description && (
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: 'color-mix(in srgb, var(--tm-text) 68%, transparent)',
                }}
              >
                {item.description}
              </p>
            )}
            {item.difficulty !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    color: 'color-mix(in srgb, var(--tm-text) 45%, transparent)',
                  }}
                >
                  Difficulté
                </span>
                <DifficultyDots value={item.difficulty} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function IdleScreen({
  portrait,
  tagline,
  now,
  onWake,
}: {
  portrait: boolean;
  tagline: string;
  now: Date;
  onWake: () => void;
}) {
  return (
    <div
      onClick={onWake}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        cursor: 'pointer',
        background: 'var(--tm-bg)',
        padding: portrait ? '54px 34px' : '0 54px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '-25%',
          pointerEvents: 'none',
          background:
            'radial-gradient(38% 38% at 30% 45%, color-mix(in srgb, var(--tm-accent) 22%, transparent), transparent 70%)',
          animation: 'tmGlow 16s ease-in-out infinite',
        }}
      />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 11 }}>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: 'var(--tm-accent)',
            boxShadow: '0 0 16px var(--tm-accent)',
          }}
        />
        <span
          style={{
            fontSize: 11.5,
            letterSpacing: '.24em',
            textTransform: 'uppercase',
            color: 'color-mix(in srgb, var(--tm-text) 55%, transparent)',
          }}
        >
          Simracing · Bar · Cuisine
        </span>
      </div>
      <h1
        style={{
          position: 'relative',
          margin: 0,
          fontSize: portrait ? 46 : 72,
          lineHeight: 0.98,
          letterSpacing: '-.035em',
          fontFamily: 'var(--tm-font-heading)',
        }}
      >
        {VENUE_NAME}
      </h1>
      <div
        style={{
          position: 'relative',
          fontFamily: 'var(--tm-font-heading)',
          fontSize: portrait ? 17 : 21,
          color: 'var(--tm-accent-300)',
          minHeight: '1.3em',
        }}
      >
        {tagline}
      </div>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginTop: 6,
        }}
      >
        <Hand size={26} color="var(--tm-accent)" />
        <span
          style={{ fontSize: 15.5, color: 'color-mix(in srgb, var(--tm-text) 70%, transparent)' }}
        >
          Touchez l'écran pour consulter la carte
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          fontSize: 12,
          color: 'color-mix(in srgb, var(--tm-text) 40%, transparent)',
        }}
      >
        {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}

/** Thème "Nocturne" repris de la maquette Claude Design (styles.css du
 * projet importé) — scopé à `.tablet-menu` plutôt que posé sur `:root`
 * pour ne jamais teinter le reste du dashboard (Tailwind + thème
 * dark-orange existant). */
function TabletMenuStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      .tablet-menu {
        --tm-bg: #161826;
        --tm-surface: #232532;
        --tm-text: #e9e9ed;
        --tm-accent: #9184d9;
        --tm-accent-100: #f5f4ff;
        --tm-accent-200: #e7e5fe;
        --tm-accent-300: #d2cefd;
        --tm-accent-800: #423a6a;
        --tm-divider: color-mix(in srgb, #e9e9ed 16%, transparent);
        --tm-font-heading: "Inter", system-ui, sans-serif;
        --tm-font-body: "Inter", system-ui, sans-serif;
        -webkit-tap-highlight-color: transparent;
        overscroll-behavior: none;
        user-select: none;
      }
      .tablet-menu * { box-sizing: border-box; }
      .tablet-menu ::-webkit-scrollbar { width: 0; height: 0; }
      .tablet-menu .tm-card { transform: perspective(900px) rotateX(0deg); }
      @media (hover: hover) {
        .tablet-menu .tm-card:hover {
          transform: perspective(900px) rotateX(4deg) scale(1.015);
          box-shadow: 0 14px 30px rgba(0,0,0,.35);
        }
      }
      .tablet-menu .tm-tilt-hint { animation: tmTiltHint 5s ease-in-out 1; }
      @keyframes tmGlow {
        0%, 100% { opacity: .5; transform: translate(-3%, 1%) scale(1); }
        50% { opacity: .95; transform: translate(5%, -4%) scale(1.14); }
      }
      @keyframes tmTiltHint {
        0%, 20%, 100% { transform: rotateX(0deg) rotateY(0deg); }
        35% { transform: rotateX(4deg) rotateY(-12deg); }
        55% { transform: rotateX(-3deg) rotateY(10deg); }
        75% { transform: rotateX(2deg) rotateY(-5deg); }
      }
    `}</style>
  );
}
