-- Partition creation, with the indexes that make a partition useful.
--
-- HNSW parameters come from the measured sweep, not from defaults. On the
-- synthetic corpus, m=16/ef_construction=64 at ef_search=40 gave 0.836 overall
-- recall; m=32/ef_construction=200 at ef_search=200 gave 0.998. The build cost
-- roughly triples and is paid once per ingest.
--
-- Indexes are created per partition rather than on the parent, because a
-- partitioned index on the parent would be built across every tenant and lose
-- the property that makes partitioning work.

CREATE OR REPLACE FUNCTION zeroth.ensure_partition(p_tenant text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    part text := 'chunk_' || regexp_replace(lower(p_tenant), '[^a-z0-9]+', '_', 'g');
    qualified text := format('zeroth.%I', part);
BEGIN
    IF to_regclass(qualified) IS NOT NULL THEN
        RETURN part;
    END IF;

    EXECUTE format(
        'CREATE TABLE zeroth.%I PARTITION OF zeroth.chunk FOR VALUES IN (%L)',
        part, p_tenant);

    -- Per-partition vector index. Tuned parameters, see header.
    EXECUTE format(
        'CREATE INDEX %I ON zeroth.%I USING hnsw (embedding vector_cosine_ops)
         WITH (m = 32, ef_construction = 200)',
        part || '_hnsw', part);

    -- Per-partition lexical index, so both retrieval paths are in-database
    -- and the same policy applies to each.
    EXECUTE format(
        'CREATE INDEX %I ON zeroth.%I USING gin (tsv)',
        part || '_tsv', part);

    EXECUTE format('CREATE INDEX %I ON zeroth.%I (doc_id)', part || '_doc', part);

    RETURN part;
END $$;

-- Partitions inherit the parent's row-level security, but FORCE is per-table
-- and must be set on each one. Missing it would leave every partition readable
-- by the owner with no policy applied.
CREATE OR REPLACE FUNCTION zeroth.force_rls_on_partitions()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE r record; n integer := 0;
BEGIN
    FOR r IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace ns ON ns.oid = c.relnamespace
        JOIN pg_inherits i ON i.inhrelid = c.oid
        WHERE ns.nspname = 'zeroth'
          AND i.inhparent = 'zeroth.chunk'::regclass
          AND NOT c.relforcerowsecurity
    LOOP
        EXECUTE format('ALTER TABLE zeroth.%I ENABLE ROW LEVEL SECURITY', r.relname);
        EXECUTE format('ALTER TABLE zeroth.%I FORCE ROW LEVEL SECURITY', r.relname);
        EXECUTE format('GRANT SELECT ON zeroth.%I TO zeroth_app', r.relname);
        n := n + 1;
    END LOOP;
    RETURN n;
END $$;
