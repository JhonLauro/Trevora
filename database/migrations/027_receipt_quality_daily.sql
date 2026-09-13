begin;

-- 027: how often the receipt photo quality gate stops a page, per UTC day.
--
-- Written by `ReceiptQualityStats` for every receipt page `ReceiptImageQualityGate`
-- looks at, in every mode (shadow counts exactly what enforce would act on). One
-- row per day, outcome and read_anyway; `pages` counts checks, so a page stopped
-- and then read anyway is counted twice -- once as its problem, once with
-- read_anyway = true.
--
--   outcome      PASSED, UNCHECKED (could not be decoded, e.g. HEIC -- not
--                judged), or the page's main problem: LOW_RESOLUTION,
--                POOR_LIGHTING, BLURRY, MISALIGNED
--   read_anyway  the owner was warned and chose to read the page as it was
--
-- Safe to apply at any time: the API writes here best-effort and keeps working
-- without the table (it logs a warning at most once a minute), and there is no JPA
-- entity, so a database without it still boots.
--
-- The health number -- share of checked pages the gate would stop, per day:
--
--   select check_date,
--          sum(pages) filter (where outcome not in ('PASSED', 'UNCHECKED') and not read_anyway)
--            * 100.0 / nullif(sum(pages) filter (where outcome <> 'UNCHECKED' and not read_anyway), 0)
--            as reject_rate_pct,
--          sum(pages) filter (where read_anyway) as read_anyway_pages
--   from public.receipt_quality_daily
--   group by check_date
--   order by check_date desc;

create table if not exists public.receipt_quality_daily (
    check_date date not null,
    outcome text not null,
    read_anyway boolean not null default false,
    pages bigint not null default 0,
    updated_at timestamptz not null default now(),
    primary key (check_date, outcome, read_anyway)
);

-- Fail-closed like every other table: the API connects as the table owner and
-- bypasses RLS; nobody else reads or writes it.
alter table public.receipt_quality_daily enable row level security;

commit;
