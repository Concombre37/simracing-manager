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

/** Familles "vitrine" pour le sélecteur à tuiles photo de l'onglet Voitures
 * — remplace la liste GT/Formula/LMDH/Drift par la liste fournie par
 * l'utilisateur (capture d'écran, v2.2.121) : GT2/GT3/GT4/Hypercar/DTM/Cup/
 * Historique/Autres/Formula 1/Formula 2/Formula 4. Matché sur le champ
 * `category` exact (renseigné via `/content-names`), pas une liste figée
 * d'acId — les familles se recouvrent volontairement (ex: "Formule 1
 * historique" matche à la fois Historique et Formula 1), aucune n'est
 * exclusive. "Autres" est un vrai filtre (voitures qui ne matchent aucune
 * des 10 autres familles), distinct de "Toutes" qui n'exclut rien. Une
 * famille sans aucune voiture correspondante ne s'affiche simplement pas
 * (voir `families` ci-dessous). */
interface CarFamily {
  key: string;
  label: string;
  match: RegExp;
}

const CAR_FAMILIES: CarFamily[] = [
  { key: 'gt2', label: 'GT2', match: /\bgt ?2\b/i },
  { key: 'gt3', label: 'GT3', match: /\bgt ?3\b/i },
  { key: 'gt4', label: 'GT4', match: /\bgt ?4\b/i },
  { key: 'hypercar', label: 'Hypercar', match: /hypercar/i },
  { key: 'dtm', label: 'DTM', match: /\bdtm\b/i },
  { key: 'cup', label: 'Cup', match: /\bcup\b/i },
  { key: 'historique', label: 'Historique', match: /historique/i },
  {
    key: 'autres',
    label: 'Autres',
    match:
      /^(?!.*(?:\bgt ?[234]\b|hypercar|\bdtm\b|\bcup\b|historique|formule ?[124]\b|formula ?[124]\b)).+$/i,
  },
  { key: 'formula1', label: 'Formula 1', match: /formule ?1\b|formula ?1\b/i },
  { key: 'formula2', label: 'Formula 2', match: /formule ?2\b|formula ?2\b/i },
  { key: 'formula4', label: 'Formula 4', match: /formule ?4\b|formula ?4\b/i },
];

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
  const families = useMemo(
    () =>
      CAR_FAMILIES.map((family) => {
        const matches = currentItems.filter((i) => i.category && family.match.test(i.category));
        if (matches.length === 0) return null;
        const previewItem = matches.find((i) => i.previewUrl) ?? null;
        return {
          ...family,
          previewUrl: previewItem?.previewUrl ?? null,
          mirrored: previewItem?.mirrored ?? false,
        };
      }).filter(
        (f): f is CarFamily & { previewUrl: string | null; mirrored: boolean } => f !== null,
      ),
    [currentItems],
  );
  const activeFamily = families.find((f) => f.key === filter) ?? null;
  const filteredItems = activeFamily
    ? currentItems.filter((i) => i.category && activeFamily.match.test(i.category))
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
              {families.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: portrait
                      ? 'repeat(2, minmax(0,1fr))'
                      : 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                    marginBottom: 24,
                  }}
                >
                  <FamilyTile
                    label="Toutes"
                    active={filter === null}
                    onClick={() => setFilter(null)}
                  />
                  {families.map((f) => (
                    <FamilyTile
                      key={f.key}
                      label={f.label}
                      previewUrl={f.previewUrl}
                      mirrored={f.mirrored}
                      active={filter === f.key}
                      onClick={() => setFilter(f.key)}
                    />
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

/** Tuile de sélection de famille ("GT"/"Formula"/"LMDH"/"Drift") — photo
 * réelle d'une voiture de la famille (désaturée + assombrie, façon
 * référence visuelle fournie par l'utilisateur), étiquette centrée en bas.
 * "Toutes" (pas de `previewUrl`) reste une tuile pleine unie, texte centré. */
function FamilyTile({
  label,
  previewUrl,
  mirrored,
  active,
  onClick,
}: {
  label: string;
  previewUrl?: string | null;
  mirrored?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'relative',
        height: 108,
        padding: 0,
        borderRadius: 14,
        overflow: 'hidden',
        cursor: 'pointer',
        background: 'var(--tm-surface)',
        border: `2px solid ${active ? 'var(--tm-accent)' : 'transparent'}`,
        boxShadow: active
          ? '0 0 0 1px color-mix(in srgb, var(--tm-accent) 40%, transparent)'
          : '0 0 0 1px color-mix(in srgb, var(--tm-text) 8%, transparent)',
        transition: 'border-color .22s ease, box-shadow .22s ease',
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
              filter: active
                ? 'grayscale(0.15) contrast(1.1) brightness(0.8)'
                : 'grayscale(0.85) contrast(1.15) brightness(0.55)',
              transition: 'filter .25s ease',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(to top, rgba(5,6,12,.85) 0%, rgba(5,6,12,.2) 55%, transparent 100%)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 8,
              right: 8,
              bottom: 12,
              textAlign: 'center',
              fontFamily: 'var(--tm-font-heading)',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: '.04em',
              textTransform: 'uppercase',
              color: active ? 'var(--tm-accent-100)' : 'var(--tm-accent-300)',
            }}
          >
            {label}
          </span>
        </>
      ) : (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--tm-font-heading)',
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            color: active
              ? 'var(--tm-accent-100)'
              : 'color-mix(in srgb, var(--tm-text) 66%, transparent)',
          }}
        >
          {label}
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

/** Petite statistique fiche technique (puissance/poids/rapport) — n'apparaît
 * que si la donnée a été renseignée sur `/content-names` pour une voiture
 * réellement identifiée, jamais une estimation générique par catégorie. */
function SpecStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: 'color-mix(in srgb, var(--tm-text) 45%, transparent)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--tm-font-heading)',
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--tm-accent-200)',
        }}
      >
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
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
      {showLabel && (
        <span
          style={{
            fontSize: 12.5,
            color: 'color-mix(in srgb, var(--tm-text) 60%, transparent)',
          }}
        >
          {DIFFICULTY_LABELS[value - 1]}
        </span>
      )}
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
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: item.mirrored ? 'scaleX(-1)' : undefined,
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
        {item.powerHp && (
          <span
            style={{
              position: 'absolute',
              right: 12,
              top: 12,
              padding: '3px 10px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              background: 'color-mix(in srgb, #05060c 55%, transparent)',
              color: 'var(--tm-text)',
            }}
          >
            {item.powerHp} ch
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
            transform: mirrored ? 'scaleX(-1)' : undefined,
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
            <Tilt3DImage src={item.previewUrl} alt={item.name} mirrored={item.mirrored} />
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
        {(item.country ||
          item.year ||
          item.description ||
          item.powerHp ||
          item.weightKg ||
          item.maxSpeedKmh ||
          item.difficulty !== null ||
          item.layoutImageUrl ||
          item.layoutImages.length > 0) && (
          <div
            style={{ padding: '20px 26px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            {(item.country || item.year) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5 }}>
                {flagEmoji(item.countryCode) && <span>{flagEmoji(item.countryCode)}</span>}
                <span>{[item.country, item.year].filter(Boolean).join(' · ')}</span>
              </div>
            )}
            {(item.powerHp || item.weightKg || item.maxSpeedKmh) && (
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                {item.powerHp && <SpecStat label="Puissance" value={`${item.powerHp} ch`} />}
                {item.weightKg && <SpecStat label="Poids" value={`${item.weightKg} kg`} />}
                {item.powerHp && item.weightKg && (
                  <SpecStat
                    label="Rapport poids/puissance"
                    value={`${(item.weightKg / item.powerHp).toFixed(1)} kg/ch`}
                  />
                )}
                {item.maxSpeedKmh && (
                  <SpecStat label="Vitesse max" value={`${item.maxSpeedKmh} km/h`} />
                )}
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
                <DifficultyDots value={item.difficulty} showLabel />
              </div>
            )}
            {(item.layoutImages.length > 0 || item.layoutImageUrl) && (
              <div>
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    color: 'color-mix(in srgb, var(--tm-text) 45%, transparent)',
                  }}
                >
                  {item.layoutImages.length > 1 ? `Tracés (${item.layoutImages.length})` : 'Tracé'}
                </span>
                {item.layoutImages.length > 0 ? (
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    {item.layoutImages.map((l) => (
                      <div
                        key={l.name}
                        style={{
                          flex: item.layoutImages.length > 1 ? '1 1 140px' : '1 1 100%',
                          borderRadius: 10,
                          padding: 14,
                          background: '#000',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <img
                          src={l.url}
                          alt={`Tracé ${l.name} du circuit ${item.name}`}
                          style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain' }}
                        />
                        {item.layoutImages.length > 1 && (
                          <span
                            style={{
                              fontSize: 12,
                              color: 'color-mix(in srgb, #fff 70%, transparent)',
                              textTransform: 'capitalize',
                            }}
                          >
                            {l.name}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 10,
                      borderRadius: 10,
                      padding: 14,
                      background: '#000',
                      display: 'flex',
                      justifyContent: 'center',
                    }}
                  >
                    <img
                      src={item.layoutImageUrl ?? undefined}
                      alt={`Tracé du circuit ${item.name}`}
                      style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain' }}
                    />
                  </div>
                )}
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
