-- Whether an owner has been shown the onboarding walkthrough.
--
-- Server-side rather than localStorage: it has to survive a different device,
-- a different browser and a cleared cache, and this flow gets demoed.
--
-- A timestamp rather than a boolean. "When" is the question that ends up being
-- asked -- whether somebody saw the walkthrough before or after it changed,
-- and so whether a revised one should be shown. A boolean throws that away for
-- nothing and costs the same.
--
-- `walkthrough_furthest_step` is declared here too, because it already exists
-- in the deployed database: an earlier attempt at this feature applied a
-- migration with that number and both columns, and its working tree was lost
-- before it was committed, leaving the database ahead of this repository. This
-- file is written to be idempotent for exactly that reason -- it is a no-op
-- against the deployed database and correct against a fresh one, and the two
-- cannot drift apart. Nothing reads the step column today; a "have they seen
-- it" bit does not need a resume pointer.
--
-- No RLS policy accompanies this. `users` has RLS enabled with no policies at
-- all, and the backend reaches it over JDBC as `postgres`, which owns the
-- table and carries rolbypassrls. RLS is a table-level switch, so added
-- columns inherit that state, and there is no policy anywhere in `public`
-- whose USING clause could need to learn about them.

begin;

alter table public.users
    add column if not exists walkthrough_completed_at timestamptz;

alter table public.users
    add column if not exists walkthrough_furthest_step smallint not null default 0;

commit;
