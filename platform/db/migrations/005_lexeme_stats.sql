-- Document frequency per lexeme.
--
-- The lexical path ORs the query's terms, because ANDing a twelve-word natural
-- question matches nothing. But ORing ALL of them is just as bad in the other
-- direction: a 31-term query matched 45,971 of 51,310 chunks — 90% of the
-- corpus — and ts_rank_cd then had to score every one of them. Measured at
-- 3,300 ms against 292 ms for the vector path.
--
-- Keeping only the most SELECTIVE query terms fixes it. Selectivity needs
-- document frequency, and computing that at query time means scanning the
-- corpus, so it is precomputed here and refreshed after ingestion.

CREATE TABLE IF NOT EXISTS zeroth.lexeme_df (
    lexeme text PRIMARY KEY,
    df     integer NOT NULL
);

CREATE OR REPLACE FUNCTION zeroth.refresh_lexeme_df()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE n integer;
BEGIN
    TRUNCATE zeroth.lexeme_df;
    INSERT INTO zeroth.lexeme_df (lexeme, df)
    SELECT word, ndoc
    FROM ts_stat('SELECT tsv FROM zeroth.chunk')
    -- Terms in almost every chunk carry no signal and cost the most to rank.
    WHERE ndoc < (SELECT count(*) FROM zeroth.chunk) * 0.30;
    GET DIAGNOSTICS n = ROW_COUNT;
    ANALYZE zeroth.lexeme_df;
    RETURN n;
END $$;

GRANT SELECT ON zeroth.lexeme_df TO zeroth_app;
