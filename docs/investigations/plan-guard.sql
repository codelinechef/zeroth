-- Zeroth · Phase 4 plan guard — prototype.
--
-- The same retrieval query can silently switch between approximate (HNSW) and
-- exact (Seq Scan) execution depending on table statistics and machine-level
-- planner settings. The flip is silent and moves recall UPWARD, so it never
-- looks like a bug — a run just scores higher on one machine than another.
--
-- Reproduced triggers:
--   * a partition ingested but not yet ANALYZEd  -> Seq Scan
--   * random_page_cost = 20                      -> Seq Scan
--
-- Verified against pgvector 0.8.6 / Postgres 16.15.

-- Walk the plan tree and return the leaf scans over chunk partitions.
CREATE OR REPLACE FUNCTION plan_shape(p_sql text, p_vec vector)
RETURNS TABLE(node text, relation text, index_name text)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE j jsonb;
BEGIN
  EXECUTE 'EXPLAIN (FORMAT JSON, COSTS OFF) ' || p_sql INTO j USING p_vec;
  RETURN QUERY
  WITH RECURSIVE t(n) AS (
    SELECT j->0->'Plan'
    UNION ALL
    SELECT c FROM t, LATERAL jsonb_array_elements(t.n->'Plans') c WHERE t.n ? 'Plans'
  )
  SELECT n->>'Node Type', n->>'Relation Name', n->>'Index Name'
  FROM t WHERE n->>'Relation Name' LIKE 'chunk%';
END $$;

-- The guard. Returns a fingerprint on success; raises on any deviation.
-- The harness calls this before a query set and records the fingerprint in
-- the run's results JSON (§10 `plan.fingerprint`). A mismatch fails the run.
CREATE OR REPLACE FUNCTION assert_ann_plan(p_sql text, p_vec vector)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE bad int; total int; fingerprint text;
BEGIN
  SELECT count(*) FILTER (WHERE node <> 'Index Scan' OR index_name NOT LIKE '%embedding_idx'),
         count(*),
         md5(string_agg(node || ':' || coalesce(index_name,'-'), ',' ORDER BY relation))
    INTO bad, total, fingerprint
  FROM plan_shape(p_sql, p_vec);

  IF total = 0 THEN
    RAISE EXCEPTION 'plan guard: no scan over chunk partitions found';
  END IF;
  IF bad > 0 THEN
    RAISE EXCEPTION
      'plan guard: % of % partition scans are not HNSW index scans — retrieval semantics changed',
      bad, total;
  END IF;
  RETURN fingerprint;
END $$;

-- Usage:
--   SELECT assert_ann_plan(
--     'SELECT c.id FROM chunk c WHERE c.tenant_id = ANY(''{1,2}''::int[])
--      ORDER BY c.embedding <=> $1 LIMIT 10',
--     '[...]'::vector);
--   -> 04b50506e8f2c2fc44b732b864ad524f   (healthy)
--   -> ERROR: plan guard: 8 of 8 partition scans are not HNSW index scans
