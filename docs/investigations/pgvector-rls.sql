-- Zeroth · §14.1 — does PostgreSQL Row-Level Security apply cleanly to
-- pgvector index scans?  Reproducible harness.
--
--   docker cp docs/investigations/pgvector-rls.sql zeroth-db:/tmp/
--   docker exec zeroth-db psql -U postgres -d zeroth -f /tmp/pgvector-rls.sql
--   docker exec -e PGPASSWORD=local_dev_only zeroth-db \
--       psql -U zeroth_app -h 127.0.0.1 -d zeroth -f /tmp/pgvector-rls.sql
--
-- Measured on Postgres 16.15 + pgvector 0.8.6, 36,000 chunks x 384 dims,
-- 40 tenants, 7 roles.  Teardown: DROP SCHEMA rlslab CASCADE;

DROP SCHEMA IF EXISTS rlslab CASCADE;
CREATE SCHEMA rlslab;

-- VOLATILE + an argument, so the planner cannot hoist these into a single
-- InitPlan.  Without the argument every tenant gets the SAME centroid and the
-- corpus silently loses all tenant structure -- which invalidates the whole
-- experiment.  This bit me; keep the argument.
CREATE FUNCTION rlslab.randvec(seed bigint) RETURNS real[]
LANGUAGE sql VOLATILE AS $$
  SELECT array_agg(random_normal(0,1)::real) FROM generate_series(1,384) $$;

CREATE FUNCTION rlslab.perturb(c real[], sd float8, seed bigint) RETURNS vector
LANGUAGE sql VOLATILE AS $$
  SELECT l2_normalize((SELECT array_agg((c[d] + random_normal(0,sd))::real)
                       FROM generate_series(1,384) d)::vector(384)) $$;

CREATE TABLE rlslab.centroid AS
SELECT t AS tenant_id, rlslab.randvec(t) AS c FROM generate_series(1,40) t;

CREATE TABLE rlslab.chunk (
  id bigserial PRIMARY KEY, tenant_id int NOT NULL, doc_id int NOT NULL,
  body text NOT NULL, embedding vector(384) NOT NULL);

-- 900 chunks per tenant, clustered: intra-tenant cosine ~0.72,
-- inter-tenant ~0.01.  Mirrors "documents partition by filing company".
INSERT INTO rlslab.chunk (tenant_id, doc_id, body, embedding)
SELECT ct.tenant_id, (g % 30)+1, 'tenant '||ct.tenant_id||' chunk '||g,
       rlslab.perturb(ct.c, 0.62, g)
FROM rlslab.centroid ct, generate_series(1,900) g;

-- one query vector per tenant topic
CREATE TABLE rlslab.qvec AS
SELECT ct.tenant_id AS qid, rlslab.perturb(ct.c, 0.62, ct.tenant_id) AS v
FROM rlslab.centroid ct;

-- 6 roles with overlapping, non-identical access + an unrestricted control
CREATE TABLE rlslab.tenant_acl (
  role_name text NOT NULL, tenant_id int NOT NULL,
  PRIMARY KEY (role_name, tenant_id));
INSERT INTO rlslab.tenant_acl
SELECT 'all_tenants',   t FROM generate_series(1,40) t UNION ALL   -- control
SELECT 'analyst_broad', t FROM generate_series(1,30) t UNION ALL
SELECT 'auditor',       t FROM generate_series(5,20) t UNION ALL
SELECT 'analyst_mid',   t FROM generate_series(1,8)  t UNION ALL
SELECT 'counsel',       t FROM generate_series(35,40) t UNION ALL
SELECT 'analyst_narrow',t FROM generate_series(1,2)  t UNION ALL
SELECT 'single_tenant', 7;

GRANT USAGE ON SCHEMA rlslab TO zeroth_app;
GRANT SELECT ON ALL TABLES IN SCHEMA rlslab TO zeroth_app;

ALTER TABLE rlslab.chunk ENABLE ROW LEVEL SECURITY;
CREATE POLICY chunk_tenant_read ON rlslab.chunk FOR SELECT TO zeroth_app
USING (EXISTS (SELECT 1 FROM rlslab.tenant_acl a
               WHERE a.tenant_id = chunk.tenant_id
                 AND a.role_name = current_setting('zeroth.role', true)));

SET maintenance_work_mem='512MB';
SET max_parallel_maintenance_workers=0;   -- else /dev/shm 64MB kills the build
CREATE INDEX chunk_hnsw ON rlslab.chunk
  USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);
ANALYZE rlslab.chunk;

-- ---------------------------------------------------------------------------
-- ANN recall measured against EXACT search under the SAME policy.
-- Both legs run as the caller, so RLS applies identically to each.
-- ---------------------------------------------------------------------------
CREATE FUNCTION rlslab.recall_probe(p_ef int, p_iter text, p_maxscan int DEFAULT 20000)
RETURNS TABLE(role_name text, qid int, n_exact int, n_ann int, n_hit int)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE r text; q record; ex bigint[]; an bigint[];
BEGIN
  FOR r IN SELECT DISTINCT a.role_name FROM rlslab.tenant_acl a ORDER BY 1 LOOP
    PERFORM set_config('zeroth.role', r, true);   -- separate stmt: the policy
                                                  -- qual is a security barrier
                                                  -- and runs before any WHERE
    FOR q IN SELECT v.qid, v.v FROM rlslab.qvec v ORDER BY v.qid LOOP
      EXECUTE 'SET LOCAL enable_indexscan=off';
      EXECUTE 'SET LOCAL enable_indexonlyscan=off';
      EXECUTE 'SELECT array_agg(h.id) FROM (SELECT c.id FROM rlslab.chunk c
               ORDER BY c.embedding <=> $1 LIMIT 10) h' INTO ex USING q.v;
      EXECUTE 'SET LOCAL enable_indexscan=on';
      EXECUTE 'SET LOCAL enable_seqscan=off';
      EXECUTE format('SET LOCAL hnsw.ef_search=%s', p_ef);
      EXECUTE format('SET LOCAL hnsw.iterative_scan=%L', p_iter);
      EXECUTE format('SET LOCAL hnsw.max_scan_tuples=%s', p_maxscan);
      EXECUTE 'SELECT array_agg(h.id) FROM (SELECT c.id FROM rlslab.chunk c
               ORDER BY c.embedding <=> $1 LIMIT 10) h' INTO an USING q.v;
      EXECUTE 'SET LOCAL enable_seqscan=on';
      role_name:=r; qid:=q.qid;
      n_exact:=coalesce(array_length(ex,1),0);
      n_ann  :=coalesce(array_length(an,1),0);
      SELECT count(*) INTO n_hit FROM unnest(coalesce(ex,'{}')) e
        WHERE e = ANY(coalesce(an,'{}'));
      RETURN NEXT;
    END LOOP;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION rlslab.recall_probe(int,text,int) TO zeroth_app;

-- Split by whether the query topic is one the role may actually see.
-- Run this leg as zeroth_app.
CREATE TEMP TABLE res AS SELECT * FROM rlslab.recall_probe(40,'off');
SELECT 'ON-TOPIC' AS slice, p.role_name,
       round(avg(n_ann),2) AS rows_of_10,
       round(avg(n_hit::numeric/NULLIF(n_exact,0)),4) AS recall,
       count(*) FILTER (WHERE n_ann=0) AS empty
FROM res p JOIN rlslab.tenant_acl a
       ON a.role_name=p.role_name AND a.tenant_id=p.qid
GROUP BY p.role_name
UNION ALL
SELECT 'OFF-TOPIC', p.role_name, round(avg(n_ann),2),
       round(avg(n_hit::numeric/NULLIF(n_exact,0)),4),
       count(*) FILTER (WHERE n_ann=0)
FROM res p WHERE NOT EXISTS (SELECT 1 FROM rlslab.tenant_acl a
       WHERE a.role_name=p.role_name AND a.tenant_id=p.qid)
GROUP BY p.role_name ORDER BY 1, 2;
