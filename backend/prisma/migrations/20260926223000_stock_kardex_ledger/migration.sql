-- Kardex columns. Existing receipt lines stay in place with a null balance;
-- the product ledger starts at the opening snapshot below.
ALTER TABLE "stock_details" ADD COLUMN "reference_type" VARCHAR(32),
ADD COLUMN "reference_id" UUID,
ADD COLUMN "balance_after" INTEGER;

CREATE INDEX "stock_details_id_stock_created_at_idx" ON "stock_details"("id_stock", "created_at");

CREATE INDEX "stock_details_reference_type_reference_id_idx" ON "stock_details"("reference_type", "reference_id");

-- One opening line per stock row that still has a quantity.
-- balance_after is the running product total in stock creation order.
INSERT INTO "stock_details" (
  "id",
  "id_stock",
  "type",
  "quantity",
  "observation",
  "reference_type",
  "reference_id",
  "balance_after",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  ordered.id,
  CASE WHEN ordered.existence > 0 THEN 1 ELSE 2 END,
  ABS(ordered.existence),
  'Saldo inicial',
  'stock',
  ordered.id,
  ordered.balance_after,
  ordered.created_at,
  ordered.created_at
FROM (
  SELECT
    s.id,
    s.existence,
    s.created_at,
    SUM(s.existence) OVER (
      PARTITION BY s.organization_id, s.id_product
      ORDER BY s.created_at, s.id
    ) AS balance_after
  FROM "stocks" s
  WHERE s.deleted_at IS NULL
    AND s.existence <> 0
) AS ordered;
