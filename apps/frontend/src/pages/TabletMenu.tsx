import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ImageOff, Rotate3d } from 'lucide-react';
import {
  tabletMenuApi,
  type CatalogItem,
  type CategoryTag,
  type ArcadeAttraction,
} from '../services/tabletMenu';
import type { MenuCategory } from '../services/menu';

/** Emoji drapeau à partir d'un code ISO 3166-1 alpha-2 (ex: "FR" -> 🇫🇷) —
 * même principe que `ContentNames.tsx`, dupliqué ici (page publique
 * indépendante, pas de code partagé entre les deux). Préféré à un jeu de
 * drapeaux SVG dessinés à la main (voir la maquette v2 importée) : un
 * dessin manuel ne couvrirait que les quelques pays anticipés, alors que
 * l'emoji fonctionne pour n'importe quel code pays réellement renseigné. */
function flagEmoji(countryCode: string | null): string {
  if (!countryCode || countryCode.length !== 2) return '';
  return countryCode
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Nom réel de l'établissement (voir Layout.tsx — même logo/wordmark déjà
// utilisé ailleurs sur le dashboard, et le vrai site vitrine
// elsass-simracing.fr). Pas de compte utilisateur sur cette page publique,
// donc pas d'accès à `useSiteLogo()` (endpoint protégé par JWT/clé
// station) — texte stylé pour reprendre le wordmark réel du site.
const VENUE_WORD_1 = 'ELSASS';
const VENUE_WORD_2 = 'SIMRACING';
const VENUE_CITY = 'HAGUENAU';

const IDLE_MS = 90_000;
const TAGLINE_INTERVAL_MS = 4600;

type TabKey = 'cars' | 'tracks' | 'food' | 'drinks' | 'arcade';

const TAB_TITLES: Record<TabKey, string> = {
  cars: 'Le garage',
  tracks: 'Les circuits',
  food: 'La cuisine',
  drinks: 'Le bar',
  arcade: "L'arcade",
};

/** Icônes de navigation dessinées au trait, reprises de la maquette v2
 * (identité visuelle du vrai site elsass-simracing.fr — Montserrat,
 * bleu #245E97) plutôt que des icônes génériques lucide, pour coller à la
 * marque réelle. Purement présentationnel (aucune donnée). */
function NavIconCars({ size = 26 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M3.3 10.6h5.6M15.1 10.6h5.6M12 14.6v6.3" />
    </svg>
  );
}
function NavIconTracks({ size = 26 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13.4 4.3c4.1.4 7 2.6 7 5.5 0 2.5-2.1 4-5.1 4.8-2.4.6-4 1.3-4 2.5 0 1.3 1.3 2 3.3 2.1" />
      <path d="M13.4 4.3c-.9-.1-1.8-.1-2.7 0C6.4 4.7 3.6 7 3.6 10c0 2.7 2.3 4.2 4.9 5.3 2.2.9 3.7 1.9 3.7 3.2 0 1-.6 1.7-1.6 2.1" />
      <path d="M9.6 3.1v2.6" />
    </svg>
  );
}
function NavIconKitchen({ size = 26 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.6 3v6.2a2.3 2.3 0 0 0 4.6 0V3M8.9 11.5V21M17.4 3c-1.6 1.6-2.3 3.2-2.3 5.3 0 1.8.9 3 2.3 3.2V21" />
    </svg>
  );
}
function NavIconBar({ size = 26 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.4 4.6h15.2L12 12.6 4.4 4.6ZM12 12.6V20M8.6 20h6.8" />
    </svg>
  );
}
function NavIconArcade({ size = 26 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.6" y="8.4" width="18.8" height="11.4" rx="3.4" />
      <path d="M6.6 12.2v3.8M8.5 14.1H4.7" />
      <circle cx="16" cy="13.4" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="18.4" cy="16" r="1.15" fill="currentColor" stroke="none" />
      <path d="M12 8.4V6.2a2 2 0 0 1 2-2h1.4" />
    </svg>
  );
}

const TABS: { key: TabKey; label: string; Icon: (p: { size?: number }) => JSX.Element }[] = [
  { key: 'cars', label: 'Voitures', Icon: NavIconCars },
  { key: 'tracks', label: 'Circuits', Icon: NavIconTracks },
  { key: 'food', label: 'Cuisine', Icon: NavIconKitchen },
  { key: 'drinks', label: 'Bar', Icon: NavIconBar },
  { key: 'arcade', label: 'Arcade', Icon: NavIconArcade },
];

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
  // Liste de catégories configurée via /content-categories (admin) — les
  // tuiles de filtre voitures/circuits en sont dérivées dynamiquement,
  // aucune liste figée dans le code.
  const { data: categoryTags } = useQuery({
    queryKey: ['tablet-categories'],
    queryFn: tabletMenuApi.getCategories,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const { data: arcade = [] } = useQuery({
    queryKey: ['tablet-arcade'],
    queryFn: tabletMenuApi.getArcade,
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
  const families = useMemo(() => {
    const categoryList: CategoryTag[] =
      tab === 'cars'
        ? (categoryTags?.cars ?? [])
        : tab === 'tracks'
          ? (categoryTags?.tracks ?? [])
          : [];
    return categoryList
      .map((cat) => {
        const matches = currentItems.filter((i) => i.category === cat.name);
        if (matches.length === 0) return null;
        const previewItem = matches.find((i) => i.previewUrl) ?? null;
        return {
          name: cat.name,
          count: matches.length,
          previewUrl: previewItem?.previewUrl ?? null,
          mirrored: previewItem?.mirrored ?? false,
        };
      })
      .filter(
        (f): f is { name: string; count: number; previewUrl: string | null; mirrored: boolean } =>
          f !== null,
      );
  }, [tab, categoryTags, currentItems]);
  const activeFamily = families.find((f) => f.name === filter) ?? null;
  const filteredItems = activeFamily
    ? currentItems.filter((i) => i.category === activeFamily.name)
    : currentItems;

  const foodCategories = menuCategories.filter((c) => c.section === 'food');
  const drinkCategories = menuCategories.filter((c) => c.section === 'drinks');
  const menuGroups: MenuCategory[] = tab === 'food' ? foodCategories : drinkCategories;

  const isCatalogTab = tab === 'cars' || tab === 'tracks';
  const isMenuTab = tab === 'food' || tab === 'drinks';
  const isArcadeTab = tab === 'arcade';
  const countLabel = isCatalogTab
    ? `${filteredItems.length} ${tab === 'cars' ? (filteredItems.length > 1 ? 'véhicules' : 'véhicule') : filteredItems.length > 1 ? 'circuits' : 'circuit'}`
    : isArcadeTab
      ? `${arcade.length} ${arcade.length > 1 ? 'attractions' : 'attraction'}`
      : null;

  return (
    <div
      onPointerDown={ping}
      className="tablet-menu"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--tm-stage)',
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
            'radial-gradient(45% 40% at 78% -8%, color-mix(in srgb, var(--tm-accent) 22%, transparent), transparent 62%)',
        }}
      />

      {/* En-tête */}
      <header
        style={{
          position: 'relative',
          zIndex: 3,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          padding: portrait ? '18px 22px' : '22px 44px',
          borderBottom: '1px solid var(--tm-divider)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: portrait ? 8 : 12,
              fontWeight: 900,
              fontSize: portrait ? 22 : 30,
              lineHeight: 1,
              letterSpacing: '.08em',
            }}
          >
            <span style={{ color: 'var(--tm-text)' }}>{VENUE_WORD_1}</span>
            <span style={{ color: 'var(--tm-accent)' }}>{VENUE_WORD_2}</span>
          </div>
          {!portrait && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <span
                style={{
                  flex: 1,
                  height: 1,
                  background:
                    'linear-gradient(90deg, transparent, color-mix(in srgb, var(--tm-text) 45%, transparent))',
                }}
              />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '.4em',
                  paddingLeft: '.4em',
                  color: 'color-mix(in srgb, var(--tm-text) 60%, transparent)',
                }}
              >
                {VENUE_CITY}
              </span>
              <span
                style={{
                  flex: 1,
                  height: 1,
                  background:
                    'linear-gradient(90deg, color-mix(in srgb, var(--tm-text) 45%, transparent), transparent)',
                }}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: portrait ? 16 : 26 }}>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {!portrait && (
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: '.16em',
                  textTransform: 'uppercase',
                  color: 'color-mix(in srgb, var(--tm-text) 55%, transparent)',
                }}
              >
                {now.toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
            )}
            <span
              style={{
                fontWeight: 900,
                fontSize: portrait ? 22 : 28,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {!portrait && (
            <>
              <div style={{ width: 1, height: 40, background: 'var(--tm-divider)' }} />
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#5FCB6B',
                      boxShadow: '0 0 10px rgba(95,203,107,.9)',
                    }}
                  />
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: 11.5,
                      letterSpacing: '.16em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Centre ouvert
                  </span>
                </div>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 11.5,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    color: 'color-mix(in srgb, var(--tm-text) 45%, transparent)',
                  }}
                >
                  Menu interactif
                </span>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Contenu */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {(isCatalogTab || isMenuTab || isArcadeTab) && (
          <div
            style={{
              flex: 'none',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 16,
              padding: portrait ? '20px 22px 16px' : '26px 44px 18px',
            }}
          >
            <div
              style={{
                fontWeight: 900,
                fontSize: portrait ? 24 : 30,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
              }}
            >
              {TAB_TITLES[tab]}
            </div>
            {countLabel && (
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  color: 'color-mix(in srgb, var(--tm-text) 50%, transparent)',
                }}
              >
                {countLabel}
              </div>
            )}
          </div>
        )}

        <div
          ref={scrollRef}
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            padding: portrait ? '0 22px 28px' : '0 44px 36px',
          }}
        >
          {isCatalogTab && (
            <>
              {families.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      tab === 'cars'
                        ? portrait
                          ? 'repeat(2, minmax(0,1fr))'
                          : 'repeat(auto-fit, minmax(180px, 1fr))'
                        : portrait
                          ? 'repeat(2, minmax(0,1fr))'
                          : 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 12,
                    marginBottom: 22,
                  }}
                >
                  {tab === 'cars' ? (
                    <>
                      <CategoryTile
                        label="Toutes"
                        active={filter === null}
                        onClick={() => setFilter(null)}
                      />
                      {families.map((f) => (
                        <CategoryTile
                          key={f.name}
                          label={f.name}
                          count={f.count}
                          previewUrl={f.previewUrl}
                          mirrored={f.mirrored}
                          active={filter === f.name}
                          onClick={() => setFilter(f.name)}
                        />
                      ))}
                    </>
                  ) : (
                    <>
                      <PillFilter
                        label="Tous"
                        active={filter === null}
                        onClick={() => setFilter(null)}
                      />
                      {families.map((f) => (
                        <PillFilter
                          key={f.name}
                          label={f.name}
                          count={f.count}
                          active={filter === f.name}
                          onClick={() => setFilter(f.name)}
                        />
                      ))}
                    </>
                  )}
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
                    gap: portrait ? 14 : 20,
                  }}
                >
                  {filteredItems.map((item) => (
                    <CatalogCard
                      key={item.acId}
                      item={item}
                      kind={tab === 'cars' ? 'car' : 'track'}
                      portrait={portrait}
                      onOpen={() => setOpenItem(item)}
                    />
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
                    columnCount: portrait ? 1 : 2,
                    columnGap: 48,
                  }}
                >
                  {menuGroups.map((group) => (
                    <MenuGroupCard key={group.id} group={group} />
                  ))}
                </div>
              )}
            </>
          )}

          {isArcadeTab && (
            <>
              {arcade.length === 0 ? (
                <EmptyState label="Aucune attraction pour le moment." />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${portrait ? 2 : 3}, minmax(0,1fr))`,
                    gap: portrait ? 14 : 20,
                  }}
                >
                  {arcade.map((a) => (
                    <ArcadeCard key={a.id} attraction={a} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav
        style={{
          position: 'relative',
          zIndex: 3,
          flex: 'none',
          display: 'flex',
          height: portrait ? 96 : 116,
          background: 'var(--tm-nav)',
          borderTop: '1px solid var(--tm-divider)',
        }}
      >
        {TABS.map(({ key, label, Icon }) => {
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
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
                border: 0,
                cursor: 'pointer',
                background: 'transparent',
                fontFamily: 'var(--tm-font-heading)',
                color: active
                  ? 'var(--tm-text)'
                  : 'color-mix(in srgb, var(--tm-text) 45%, transparent)',
              }}
            >
              {active && (
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 4,
                    background: 'var(--tm-accent)',
                  }}
                />
              )}
              <Icon size={portrait ? 22 : 28} />
              <span
                style={{
                  fontWeight: 800,
                  fontSize: portrait ? 11 : 13,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {openItem && (
        <DetailModal
          item={openItem}
          kind={tab === 'cars' ? 'car' : 'track'}
          onClose={() => setOpenItem(null)}
          portrait={portrait}
        />
      )}

      {idle && (
        <IdleScreen portrait={portrait} tagline={taglines[taglineIdx]} now={now} onWake={wake} />
      )}
    </div>
  );
}

/** Tuile de filtre catégorie voitures — deux traitements : "photo" quand la
 * catégorie a une voiture réelle avec preview (photo en duotone + voile
 * bleu diagonal), "plain" sinon (fond uni + trait d'accent), comme dans la
 * maquette v2. "Toutes" (pas de `previewUrl`) reste toujours "plain". */
function CategoryTile({
  label,
  count,
  previewUrl,
  mirrored,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  previewUrl?: string | null;
  mirrored?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tm-tile"
      style={{
        position: 'relative',
        height: 108,
        padding: 0,
        border: active ? '2px solid var(--tm-accent)' : '1px solid var(--tm-divider)',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        background: 'var(--tm-panel)',
        textAlign: 'left',
      }}
    >
      {previewUrl ? (
        <>
          <img
            src={previewUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: mirrored ? 'scaleX(-1)' : undefined,
              filter: 'var(--tm-photo)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: active
                ? 'linear-gradient(104deg, color-mix(in srgb, var(--tm-accent) 45%, transparent) 0%, transparent 55%)'
                : 'linear-gradient(104deg, color-mix(in srgb, var(--tm-accent) 22%, transparent) 0%, transparent 45%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, transparent 42%, rgba(10,10,10,.86) 100%)',
            }}
          />
        </>
      ) : (
        active && (
          <span
            style={{
              position: 'absolute',
              left: 16,
              top: 16,
              width: 32,
              height: 3,
              background: 'var(--tm-accent)',
            }}
          />
        )
      )}
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
        <div
          style={{
            fontWeight: 900,
            fontSize: 16,
            lineHeight: 1.1,
            letterSpacing: '.03em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
        {count !== undefined && (
          <div
            style={{
              marginTop: 4,
              fontWeight: 700,
              fontSize: 11.5,
              letterSpacing: '.1em',
              color: 'color-mix(in srgb, var(--tm-text) 60%, transparent)',
            }}
          >
            {count} {count > 1 ? 'modèles' : 'modèle'}
          </div>
        )}
      </div>
    </button>
  );
}

/** Filtre en pastille pour les circuits — plus léger que `CategoryTile`,
 * pas de photo (un circuit n'a pas de "photo de catégorie" représentative
 * au sens propre, contrairement à une famille de voitures). */
function PillFilter({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 52,
        padding: '0 22px',
        borderRadius: 999,
        border: active ? '1px solid var(--tm-accent)' : '1px solid var(--tm-divider)',
        background: active ? 'var(--tm-accent)' : 'var(--tm-panel)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          fontWeight: 800,
          fontSize: 14,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      {count !== undefined && (
        <span
          style={{
            fontWeight: 700,
            fontSize: 12,
            color: active
              ? 'color-mix(in srgb, var(--tm-text) 85%, transparent)'
              : 'color-mix(in srgb, var(--tm-text) 45%, transparent)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px dashed var(--tm-divider)',
        background: 'color-mix(in srgb, var(--tm-panel) 60%, transparent)',
        padding: '64px 0',
        textAlign: 'center',
        color: 'color-mix(in srgb, var(--tm-text) 50%, transparent)',
      }}
    >
      {label}
    </div>
  );
}

/** Statistique fiche technique (puissance/poids/rapport/vitesse max) — box
 * de la grille 2x2, n'apparaît que si la donnée a été renseignée pour une
 * voiture réellement identifiée sur `/content-names`, jamais une
 * estimation générique par catégorie. */
function SpecStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: 'var(--tm-panel-2)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
      }}
    >
      <span
        style={{
          fontWeight: 800,
          fontSize: 10.5,
          letterSpacing: '.16em',
          textTransform: 'uppercase',
          color: 'color-mix(in srgb, var(--tm-text) 48%, transparent)',
        }}
      >
        {label}
      </span>
      <span style={{ fontWeight: 900, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

/** Échelle nommée réutilisée partout où la difficulté (1-5) est affichée —
 * voitures et circuits, mêmes libellés (demandé par l'utilisateur), copie
 * de `DIFFICULTY_LABELS` dans `ContentNames.tsx` (page publique indépendante,
 * pas de code partagé entre les deux). */
const DIFFICULTY_LABELS = ['Débutant', 'Facile', 'Moyen', 'Difficile', 'Expert'];

function DifficultyDots({ value, showLabel }: { value: number; showLabel?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ display: 'flex', gap: 5 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            style={{
              width: 22,
              height: 5,
              borderRadius: 3,
              background:
                n <= value
                  ? 'var(--tm-accent)'
                  : 'color-mix(in srgb, var(--tm-text) 14%, transparent)',
            }}
          />
        ))}
      </span>
      {showLabel && (
        <span
          style={{
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
          }}
        >
          {DIFFICULTY_LABELS[value - 1]}
        </span>
      )}
    </span>
  );
}

/** Carte catalogue — traitement différent voiture/circuit comme dans la
 * maquette v2 : une voiture montre sa vraie photo en duotone (voile bleu +
 * texture hachurée, contenu ancré en bas) ; un circuit montre son vrai
 * tracé scanné sur un panneau noir à halo radial (jamais de tracé
 * SVG inventé — voir `layoutImages`/`layoutImageUrl`, seule source réelle). */
function CatalogCard({
  item,
  kind,
  portrait,
  onOpen,
}: {
  item: CatalogItem;
  kind: 'car' | 'track';
  portrait: boolean;
  onOpen: () => void;
}) {
  const flag = flagEmoji(item.countryCode);
  const subtitle = [flag ? `${flag} ${item.country ?? ''}`.trim() : item.country, item.year]
    .filter(Boolean)
    .join(' · ');

  if (kind === 'track') {
    const traceUrl = item.layoutImages[0]?.url ?? item.layoutImageUrl;
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
          background: 'var(--tm-track-panel)',
          border: '1px solid var(--tm-divider)',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            position: 'relative',
            height: portrait ? 150 : 190,
            background:
              'radial-gradient(60% 60% at 50% 46%, color-mix(in srgb, var(--tm-accent) 22%, transparent), transparent 72%)',
          }}
        >
          {traceUrl ? (
            <img
              src={traceUrl}
              alt={item.name}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                padding: 22,
                boxSizing: 'border-box',
              }}
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
              <ImageOff size={26} color="color-mix(in srgb, var(--tm-text) 30%, transparent)" />
            </div>
          )}
          {item.layoutImages.length > 1 && (
            <span
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                padding: '5px 12px',
                borderRadius: 999,
                background: 'color-mix(in srgb, var(--tm-accent) 92%, transparent)',
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
              }}
            >
              {item.layoutImages.length} tracés
            </span>
          )}
        </div>
        <div
          style={{
            flex: 'none',
            padding: '16px 18px 18px',
            background: 'var(--tm-panel)',
            borderTop: '1px solid var(--tm-divider)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              fontWeight: 900,
              fontSize: 17,
              lineHeight: 1.1,
              letterSpacing: '.02em',
              textTransform: 'uppercase',
            }}
          >
            {item.name}
          </div>
          {subtitle && (
            <div
              style={{
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'color-mix(in srgb, var(--tm-text) 55%, transparent)',
              }}
            >
              {subtitle}
            </div>
          )}
          {item.difficulty !== null && <DifficultyDots value={item.difficulty} />}
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      onClick={onOpen}
      className="tm-card"
      style={{
        position: 'relative',
        height: portrait ? 240 : 280,
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--tm-panel)',
        border: '1px solid var(--tm-divider)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {item.previewUrl ? (
        <img
          src={item.previewUrl}
          alt={item.name}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: item.mirrored ? 'scaleX(-1)' : undefined,
            filter: 'var(--tm-photo)',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(150deg, var(--tm-panel-2) 0%, var(--tm-track-panel) 55%, #101010 100%)',
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(104deg, color-mix(in srgb, var(--tm-accent) 18%, transparent) 0%, transparent 40%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, transparent 32%, rgba(10,10,10,.9) 88%)',
        }}
      />
      <div
        style={{
          position: 'relative',
          padding: '18px 18px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 11,
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: 19,
            lineHeight: 1.12,
            letterSpacing: '.02em',
            textTransform: 'uppercase',
          }}
        >
          {item.name}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {item.category && (
            <span
              style={{
                padding: '6px 13px',
                borderRadius: 999,
                background: 'var(--tm-accent)',
                fontWeight: 800,
                fontSize: 11.5,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
              }}
            >
              {item.category}
            </span>
          )}
          {item.powerHp && (
            <span
              style={{
                padding: '6px 13px',
                borderRadius: 999,
                border: '1px solid color-mix(in srgb, var(--tm-text) 30%, transparent)',
                fontWeight: 800,
                fontSize: 11.5,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
              }}
            >
              {item.powerHp} ch
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Carte attraction arcade — pas de fiche détail au clic (contrairement aux
 * voitures/circuits) : simple grille de présentation, comme dans la
 * maquette. Photo optionnelle (uploadée à la main par l'admin via
 * `/arcade`, aucune source de scan automatique pour ce contenu). */
function ArcadeCard({ attraction }: { attraction: ArcadeAttraction }) {
  return (
    <div
      className="tm-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--tm-panel)',
        border: '1px solid var(--tm-divider)',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: 170,
          background: 'var(--tm-track-panel)',
        }}
      >
        {attraction.photoUrl ? (
          <>
            <img
              src={attraction.photoUrl}
              alt={attraction.name}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'var(--tm-photo)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(104deg, color-mix(in srgb, var(--tm-accent) 18%, transparent) 0%, transparent 40%)',
              }}
            />
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ImageOff size={26} color="color-mix(in srgb, var(--tm-text) 30%, transparent)" />
          </div>
        )}
      </div>
      <div
        style={{
          flex: 'none',
          padding: '16px 18px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: 17,
            lineHeight: 1.1,
            letterSpacing: '.02em',
            textTransform: 'uppercase',
          }}
        >
          {attraction.name}
        </div>
        {(attraction.players || attraction.kind) && (
          <div
            style={{
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'color-mix(in srgb, var(--tm-text) 55%, transparent)',
            }}
          >
            {[attraction.players, attraction.kind].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}

/** Image inclinable au doigt/à la souris (effet "on tourne la voiture") —
 * pas un vrai modèle 3D (le scanner de contenu ne lit qu'une photo 2D
 * unique par voiture, jamais le `.kn5`), juste une bascule/parallaxe CSS
 * pilotée par le glissement du pointeur. */
function Tilt3DImage({ src, alt, mirrored }: { src: string; alt: string; mirrored?: boolean }) {
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
    <div style={{ position: 'absolute', inset: 0, perspective: 1400 }}>
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
          transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg) scale(${dragging ? 1.03 : 1})`,
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
            transform: mirrored ? 'scaleX(-1)' : undefined,
            filter: 'var(--tm-photo)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `linear-gradient(${115 + rot.y}deg, color-mix(in srgb, #fff 14%, transparent), transparent 55%)`,
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 20,
          bottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'color-mix(in srgb, var(--tm-text) 35%, transparent)',
          pointerEvents: 'none',
        }}
      >
        <Rotate3d size={14} />
        Glisser pour incliner
      </div>
    </div>
  );
}

function MenuGroupCard({ group }: { group: MenuCategory }) {
  return (
    <div style={{ breakInside: 'avoid', marginBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
        <div
          style={{
            fontWeight: 900,
            fontSize: 19,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--tm-accent-light)',
            whiteSpace: 'nowrap',
          }}
        >
          {group.title}
        </div>
        <span
          style={{
            flex: 1,
            height: 1,
            background:
              'linear-gradient(90deg, color-mix(in srgb, var(--tm-accent) 80%, transparent), transparent)',
          }}
        />
      </div>
      {group.subtitle && (
        <div
          style={{
            marginTop: -10,
            marginBottom: 16,
            fontSize: 13,
            color: 'color-mix(in srgb, var(--tm-text) 55%, transparent)',
          }}
        >
          {group.subtitle}
        </div>
      )}
      {group.items.length === 0 ? (
        <p
          style={{
            fontSize: 13,
            color: 'color-mix(in srgb, var(--tm-text) 45%, transparent)',
            padding: '6px 0 16px',
          }}
        >
          Rien pour le moment.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 6 }}>
          {group.items.map((item) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: 15.5,
                    letterSpacing: '.02em',
                    textTransform: 'uppercase',
                  }}
                >
                  {item.name}
                </span>
                {item.description && (
                  <span
                    style={{
                      fontSize: 13,
                      lineHeight: 1.4,
                      color: 'color-mix(in srgb, var(--tm-text) 55%, transparent)',
                    }}
                  >
                    {item.description}
                  </span>
                )}
              </div>
              <span
                style={{
                  flex: 'none',
                  fontWeight: 800,
                  fontSize: 15,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {item.price}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailModal({
  item,
  kind,
  onClose,
  portrait,
}: {
  item: CatalogItem;
  kind: 'car' | 'track';
  onClose: () => void;
  portrait: boolean;
}) {
  const flag = flagEmoji(item.countryCode);
  const hasSpecs = kind === 'car' && (item.powerHp || item.weightKg || item.maxSpeedKmh);
  const traceUrl = item.layoutImages[0]?.url ?? item.layoutImageUrl;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: portrait ? 20 : 40,
        background: 'rgba(10,10,10,.82)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: portrait ? 'column' : 'row',
          width: 'min(1180px, 100%)',
          maxHeight: '100%',
          borderRadius: 18,
          overflow: 'hidden',
          background: 'var(--tm-modal)',
          border: '1px solid var(--tm-divider)',
          boxShadow: '0 40px 100px rgba(0,0,0,.6)',
        }}
      >
        <div
          style={{
            position: 'relative',
            flex: portrait ? 'none' : '0 0 46%',
            height: portrait ? 260 : 'auto',
            background: 'var(--tm-modal-photo)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {kind === 'car' ? (
            item.previewUrl ? (
              <Tilt3DImage src={item.previewUrl} alt={item.name} mirrored={item.mirrored} />
            ) : (
              <ImageOff size={40} color="color-mix(in srgb, var(--tm-text) 30%, transparent)" />
            )
          ) : (
            <>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'radial-gradient(55% 55% at 50% 46%, color-mix(in srgb, var(--tm-accent) 26%, transparent), transparent 72%)',
                }}
              />
              {traceUrl ? (
                <img
                  src={traceUrl}
                  alt={item.name}
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    padding: portrait ? 32 : 56,
                    boxSizing: 'border-box',
                  }}
                />
              ) : (
                <ImageOff
                  size={40}
                  color="color-mix(in srgb, var(--tm-text) 30%, transparent)"
                  style={{ position: 'relative' }}
                />
              )}
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute',
              right: 16,
              top: 16,
              width: 52,
              height: 52,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              cursor: 'pointer',
              border: '1px solid color-mix(in srgb, var(--tm-text) 20%, transparent)',
              background: 'var(--tm-panel)',
              color: 'var(--tm-text)',
              zIndex: 2,
            }}
          >
            <X size={22} />
          </button>
        </div>

        <div
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            padding: portrait ? '26px 24px 30px' : '38px 40px 36px',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {item.category && (
              <span
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  background: 'var(--tm-accent)',
                  fontWeight: 800,
                  fontSize: 12.5,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                }}
              >
                {item.category}
              </span>
            )}
            {item.year && (
              <span
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: '1px solid color-mix(in srgb, var(--tm-text) 24%, transparent)',
                  fontWeight: 800,
                  fontSize: 12.5,
                  letterSpacing: '.14em',
                }}
              >
                {item.year}
              </span>
            )}
          </div>

          <h2
            style={{
              margin: 0,
              fontWeight: 900,
              fontSize: portrait ? 30 : 38,
              lineHeight: 1.05,
              letterSpacing: '.01em',
              textTransform: 'uppercase',
            }}
          >
            {item.name}
          </h2>

          {(flag || item.country) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {flag && <span style={{ fontSize: 30, lineHeight: 1 }}>{flag}</span>}
              {item.country && (
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: 15,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    color: 'color-mix(in srgb, var(--tm-text) 72%, transparent)',
                  }}
                >
                  {item.country}
                </span>
              )}
            </div>
          )}

          {kind === 'track' && item.layoutImages.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: '.2em',
                  textTransform: 'uppercase',
                  color: 'color-mix(in srgb, var(--tm-text) 45%, transparent)',
                }}
              >
                Configurations ({item.layoutImages.length})
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {item.layoutImages.map((l) => (
                  <span
                    key={l.name}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 999,
                      border: '1px solid color-mix(in srgb, var(--tm-text) 20%, transparent)',
                      fontWeight: 700,
                      fontSize: 13,
                      textTransform: 'capitalize',
                    }}
                  >
                    {l.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {item.description && (
            <p
              style={{
                margin: 0,
                fontSize: 15,
                lineHeight: 1.6,
                color: 'color-mix(in srgb, var(--tm-text) 68%, transparent)',
              }}
            >
              {item.description}
            </p>
          )}

          {item.difficulty !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: '.2em',
                  textTransform: 'uppercase',
                  color: 'color-mix(in srgb, var(--tm-text) 45%, transparent)',
                }}
              >
                Difficulté
              </span>
              <DifficultyDots value={item.difficulty} showLabel />
            </div>
          )}

          {hasSpecs && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 2,
                background: 'var(--tm-divider)',
                border: '1px solid var(--tm-divider)',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {item.powerHp && <SpecStat label="Puissance" value={`${item.powerHp} ch`} />}
              {item.weightKg && <SpecStat label="Poids" value={`${item.weightKg} kg`} />}
              {item.powerHp && item.weightKg && (
                <SpecStat
                  label="Rapport poids-puissance"
                  value={`${(item.weightKg / item.powerHp).toFixed(2)} kg/ch`}
                />
              )}
              {item.maxSpeedKmh && (
                <SpecStat label="Vitesse max" value={`${item.maxSpeedKmh} km/h`} />
              )}
            </div>
          )}

          {kind === 'track' && item.layoutImages.length <= 1 && !traceUrl && (
            <EmptyState label="Tracé non disponible pour le moment." />
          )}
        </div>
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
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        overflow: 'hidden',
        background: 'var(--tm-bg)',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(60% 55% at 50% 42%, color-mix(in srgb, var(--tm-accent) 30%, transparent), transparent 72%)',
        }}
      />
      <div className="tm-hatch" style={{ position: 'absolute', inset: 0, opacity: 0.5 }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: portrait ? 78 : 130,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 8px 60px rgba(0,0,0,.6)',
          }}
        >
          {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div
          style={{
            marginTop: 12,
            fontWeight: 700,
            fontSize: portrait ? 14 : 18,
            letterSpacing: '.3em',
            textTransform: 'uppercase',
            color: 'color-mix(in srgb, var(--tm-text) 60%, transparent)',
          }}
        >
          {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>

        <div
          style={{
            width: 140,
            height: 1,
            margin: portrait ? '36px 0' : '48px 0',
            background:
              'linear-gradient(90deg, transparent, color-mix(in srgb, var(--tm-text) 50%, transparent), transparent)',
          }}
        />

        <img
          src="/logo-elsass-simracing.svg"
          alt={`${VENUE_WORD_1} ${VENUE_WORD_2} ${VENUE_CITY}`}
          style={{
            width: portrait ? 300 : 460,
            height: 'auto',
            filter: 'drop-shadow(0 8px 40px rgba(0,0,0,.5))',
          }}
        />

        <div
          style={{
            marginTop: portrait ? 34 : 48,
            fontWeight: 800,
            fontSize: portrait ? 17 : 22,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            textAlign: 'center',
            padding: '0 24px',
          }}
        >
          {tagline}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: portrait ? 56 : 84,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          className="tm-pulse"
          style={{
            padding: portrait ? '18px 38px' : '22px 48px',
            borderRadius: 999,
            background: 'var(--tm-accent)',
            fontWeight: 900,
            fontSize: portrait ? 16 : 20,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
          }}
        >
          Touchez l'écran
        </div>
      </div>
    </div>
  );
}

/** Thème repris de l'identité réelle du site vitrine (elsass-simracing.fr)
 * — fond anthracite #0E0E0E/#242424, accent bleu acier #245E97, Montserrat
 * — scopé à `.tablet-menu` plutôt que posé sur `:root` pour ne jamais
 * teinter le reste du dashboard (Tailwind + thème dark-orange existant). */
function TabletMenuStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
      .tablet-menu {
        --tm-bg: #0E0E0E;
        --tm-stage: #242424;
        --tm-nav: #171717;
        --tm-panel: #1B1B1B;
        --tm-panel-2: #1F1F1F;
        --tm-track-panel: #141414;
        --tm-modal: #1A1A1A;
        --tm-modal-photo: #101010;
        --tm-text: #F8F8F8;
        --tm-accent: #245E97;
        --tm-accent-light: #5C9BD6;
        --tm-divider: color-mix(in srgb, #F8F8F8 9%, transparent);
        --tm-photo: contrast(1.05) brightness(.96) saturate(1.08);
        --tm-font-heading: "Montserrat", "Helvetica Neue", Arial, sans-serif;
        --tm-font-body: "Montserrat", "Helvetica Neue", Arial, sans-serif;
        -webkit-tap-highlight-color: transparent;
        overscroll-behavior: none;
        user-select: none;
      }
      .tablet-menu * { box-sizing: border-box; }
      .tablet-menu ::-webkit-scrollbar { width: 0; height: 0; }
      .tablet-menu .tm-hatch {
        background-image: repeating-linear-gradient(122deg, rgba(248,248,248,.045) 0 2px, transparent 2px 9px);
        pointer-events: none;
      }
      .tablet-menu .tm-card, .tablet-menu .tm-tile { transition: transform .18s ease, box-shadow .18s ease; }
      @media (hover: hover) {
        .tablet-menu .tm-card:hover, .tablet-menu .tm-tile:hover {
          transform: scale(1.015);
          box-shadow: 0 14px 30px rgba(0,0,0,.4);
        }
      }
      .tablet-menu .tm-tilt-hint { animation: tmTiltHint 5s ease-in-out 1; }
      .tablet-menu .tm-pulse { animation: tmPulse 2.6s ease-in-out infinite; }
      @keyframes tmPulse { 0%, 100% { opacity: .78; } 50% { opacity: 1; } }
      @keyframes tmTiltHint {
        0%, 20%, 100% { transform: rotateX(0deg) rotateY(0deg); }
        35% { transform: rotateX(4deg) rotateY(-12deg); }
        55% { transform: rotateX(-3deg) rotateY(10deg); }
        75% { transform: rotateX(2deg) rotateY(-5deg); }
      }
    `}</style>
  );
}
