-- tenant_base records the tenant a document was assigned BEFORE small tenants
-- were folded into semantic siblings. That is a property of the document, not
-- of the tenant: two documents in the same final tenant can have come from
-- different original ones.
--
-- Modelling it on zeroth.tenant meant the row kept whichever base happened to
-- be inserted first, and made a set of (tenant, source, base) tuples look like
-- a count of tenants.

ALTER TABLE zeroth.document ADD COLUMN IF NOT EXISTS tenant_base text;
ALTER TABLE zeroth.tenant   DROP COLUMN IF EXISTS tenant_base;
CREATE INDEX IF NOT EXISTS document_tenant_base_idx ON zeroth.document (tenant_base);
