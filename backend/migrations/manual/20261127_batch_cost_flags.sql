-- Headmaster / Agrovet batch-sale compatibility repair
-- Safe to run in the Supabase SQL Editor.
-- Adds only the two missing model columns; preserves all existing rows and
-- the already-present restoration audit columns.

BEGIN;

ALTER TABLE IF EXISTS public.stock_batches
    ADD COLUMN IF NOT EXISTS cost_is_known BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE IF EXISTS public.stock_batch_allocations
    ADD COLUMN IF NOT EXISTS cost_is_known BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;

-- Verify:
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('stock_batches', 'stock_batch_allocations')
  AND column_name IN (
      'cost_is_known',
      'is_restored',
      'restored_at',
      'restoration_reference'
  )
ORDER BY table_name, column_name;
