-- Task #34: Drop legacy payment proof & invoice URLs from revenue entries.
-- Revenue entries now carry a single BRD document; the old paymentProofUrl
-- and invoiceUrl columns have been removed from the application schema.
--
-- This migration is idempotent and safe to re-run.
ALTER TABLE revenue_entries DROP COLUMN IF EXISTS payment_proof_url;
ALTER TABLE revenue_entries DROP COLUMN IF EXISTS invoice_url;
