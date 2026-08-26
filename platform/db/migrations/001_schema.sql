-- Zeroth Phase 2 — core schema.
--
-- Design decisions carried in from the §14 investigations:
--
--   * chunk is PARTITIONED BY LIST (tenant). Partitioning is not an
--     optimisation here, it is the fix for ANN post-filtering: an index that
--     contains only permitted rows has nothing to post-filter away. Measured
--     on the real corpus, a single-tenant role recovers 0.300 of exact search
--     at ef_search=40 against a monolithic index, and widening the search
--     plateaus at 0.667 against a 0.975 ceiling.
--
--   * Lexical search lives in the database as a tsvector column, so
--     row-level security applies to both retrieval paths. They are affected
--     differently — full-text filters BEFORE ranking and loses no recall,
--     vector search filters AFTER approximate selection — but both are
--     correct under the policy, which is what matters.
--
--   * Ingestion is keyed on a content checksum so re-ingesting an unchanged
--     document is a no-op.

CREATE SCHEMA IF NOT EXISTS zeroth;

-- ---------------------------------------------------------------- tenants
CREATE TABLE IF NOT EXISTS zeroth.tenant (
    tenant      text PRIMARY KEY,
    source      text NOT NULL,
    -- the unmerged tenant this was folded into, kept so the merge is auditable
    tenant_base text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------- documents
CREATE TABLE IF NOT EXISTS zeroth.document (
    doc_id        text PRIMARY KEY,
    source        text NOT NULL,
    tenant        text NOT NULL REFERENCES zeroth.tenant(tenant),
    identifier    text NOT NULL,
    url           text,
    licence       text,
    -- checksum of the RAW bytes: the idempotency key. Unchanged bytes mean
    -- unchanged everything downstream, so ingestion can skip the document.
    checksum      text NOT NULL,
    -- checksum of NORMALISED text: catches the same document reformatted.
    normalised_checksum text,
    pages         integer,
    pages_source  text CHECK (pages_source IN ('page-break','form-feed','estimated')),
    sanitised     boolean NOT NULL DEFAULT false,
    sanitised_spans integer NOT NULL DEFAULT 0,
    ingested_at   timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_tenant_idx   ON zeroth.document (tenant);
CREATE INDEX IF NOT EXISTS document_checksum_idx ON zeroth.document (checksum);

-- ----------------------------------------------------------------- chunks
-- Partitioned by tenant. Every partition carries its own HNSW and GIN index,
-- created by 003_indexes.sql when the partition is created.
CREATE TABLE IF NOT EXISTS zeroth.chunk (
    chunk_id   text NOT NULL,
    doc_id     text NOT NULL,
    tenant     text NOT NULL,
    source     text NOT NULL,
    strategy   text NOT NULL,
    ordinal    integer NOT NULL,
    page       integer,
    section    text,
    n_tokens   integer,
    checksum   text NOT NULL,
    body       text NOT NULL,
    -- generated, so it can never drift from body
    tsv        tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED,
    embedding  vector(384),
    PRIMARY KEY (tenant, chunk_id)
) PARTITION BY LIST (tenant);

-- ------------------------------------------------------------- access control
CREATE TABLE IF NOT EXISTS zeroth.role (
    role_name  text PRIMARY KEY,
    label      text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zeroth.acl (
    role_name text NOT NULL REFERENCES zeroth.role(role_name) ON DELETE CASCADE,
    tenant    text NOT NULL REFERENCES zeroth.tenant(tenant)  ON DELETE CASCADE,
    PRIMARY KEY (role_name, tenant)
);

-- --------------------------------------------------------------- audit log
-- Every retrieval records who asked, what was asked, and what the planner
-- actually did. The plan shape is recorded because the same query can execute
-- exactly or approximately depending on statistics, and recall moves upward
-- when it flips — so it never looks like a bug.
CREATE TABLE IF NOT EXISTS zeroth.audit_query (
    id            bigserial PRIMARY KEY,
    at            timestamptz NOT NULL DEFAULT now(),
    role_name     text NOT NULL,
    question      text NOT NULL,
    strategy      text,
    ef_search     integer,
    iterative_scan text,
    plan_shape    text,
    plan_ok       boolean,
    lexical_hits  integer,
    dense_hits    integer,
    returned      integer,
    elapsed_ms    numeric
);
CREATE INDEX IF NOT EXISTS audit_query_at_idx ON zeroth.audit_query (at DESC);
