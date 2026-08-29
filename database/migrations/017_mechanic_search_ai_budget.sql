-- 017: per-session budget for AI-backed mechanic search.
--
-- The search endpoint (/api/mechanic-access/sessions/{id}/history/search) is
-- reachable with nothing but a session UUID -- no bearer token -- and every
-- call spends an OpenAI request on the most expensive model we use. A session
-- that leaks, or a mechanic who leans on the search box, could previously run
-- an unbounded number of them until the session expired.
--
-- The counter lives on the session row rather than in memory so the budget
-- survives a restart and holds across instances. It counts AI calls only;
-- once it is spent, search keeps working through the free keyword fallback.

ALTER TABLE mechanic_access_sessions
    ADD COLUMN IF NOT EXISTS ai_search_count INTEGER NOT NULL DEFAULT 0;
