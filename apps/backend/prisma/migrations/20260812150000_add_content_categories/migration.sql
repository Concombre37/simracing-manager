-- CreateTable
CREATE TABLE "content_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_categories_type_name_key" ON "content_categories"("type", "name");

-- Seed depuis les valeurs de ContentLabel.category déjà en base (texte
-- libre jusqu'ici) — aucune catégorie inventée ni fusionnée : chaque
-- valeur distincte existante devient une entrée éditable, triée par
-- fréquence d'usage décroissante. L'admin pourra ensuite renommer/
-- fusionner/supprimer via /content-categories.
INSERT INTO "content_categories" ("id", "type", "name", "sort_order", "updated_at")
SELECT gen_random_uuid(), t.type, t.category, t.rn - 1, CURRENT_TIMESTAMP
FROM (
  SELECT
    type,
    category,
    ROW_NUMBER() OVER (PARTITION BY type ORDER BY COUNT(*) DESC, category ASC) AS rn
  FROM "content_labels"
  WHERE category IS NOT NULL AND category <> ''
  GROUP BY type, category
) t;
