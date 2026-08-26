-- Row-level security.
--
-- Three silent-bypass paths are closed here. Each of them fails without an
-- error, which is what makes them dangerous:
--
--   1. A SUPERUSER is exempt from RLS entirely. Nothing here can prevent that,
--      so the application role is created NOSUPERUSER NOBYPASSRLS and the
--      connection helper asserts it before any query runs.
--
--   2. A table OWNER is exempt unless FORCE ROW LEVEL SECURITY is set, because
--      relforcerowsecurity defaults to false. Confirmed during the
--      investigation: a probe run as the owner returned recall 0.95 with no
--      restriction applied at all.
--
--   3. If a policy reads the ACL table directly, the querying role needs
--      SELECT on it — which means any query can enumerate the entire
--      authorisation matrix. The lookup is wrapped in a SECURITY DEFINER
--      function instead, so the role can be authorised without being able to
--      read who else is.

-- Returns the tenants the current role may read. SECURITY DEFINER runs with
-- the owner's privileges, so zeroth_app never needs SELECT on zeroth.acl.
CREATE OR REPLACE FUNCTION zeroth.current_tenants()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Pin the search path: a SECURITY DEFINER function without one can be
-- hijacked by a caller-controlled search_path.
SET search_path = zeroth, pg_temp
AS $$
    SELECT COALESCE(
        (SELECT array_agg(a.tenant)
         FROM zeroth.acl a
         WHERE a.role_name = current_setting('zeroth.role', true)),
        '{}'::text[]
    );
$$;

REVOKE ALL ON FUNCTION zeroth.current_tenants() FROM PUBLIC;

-- Enable and FORCE on every table carrying tenant data.
ALTER TABLE zeroth.chunk    ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeroth.chunk    FORCE  ROW LEVEL SECURITY;
ALTER TABLE zeroth.document ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeroth.document FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chunk_tenant_read ON zeroth.chunk;
CREATE POLICY chunk_tenant_read ON zeroth.chunk
    FOR SELECT TO zeroth_app
    USING (tenant = ANY (zeroth.current_tenants()));

DROP POLICY IF EXISTS document_tenant_read ON zeroth.document;
CREATE POLICY document_tenant_read ON zeroth.document
    FOR SELECT TO zeroth_app
    USING (tenant = ANY (zeroth.current_tenants()));

-- An unset or unknown role resolves to an empty array, so the policy matches
-- nothing. Failing closed is the only acceptable default.

GRANT USAGE ON SCHEMA zeroth TO zeroth_app;
GRANT SELECT ON zeroth.chunk, zeroth.document, zeroth.tenant TO zeroth_app;
GRANT EXECUTE ON FUNCTION zeroth.current_tenants() TO zeroth_app;
-- Deliberately NOT granted: zeroth.acl, zeroth.role. The application can be
-- authorised without being able to read the authorisation matrix.
GRANT INSERT ON zeroth.audit_query TO zeroth_app;
GRANT USAGE, SELECT ON SEQUENCE zeroth.audit_query_id_seq TO zeroth_app;
