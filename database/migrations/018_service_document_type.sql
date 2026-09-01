begin;

-- What kind of paper a draft or record was read off.
--
-- Extraction treated every uploaded document alike. A single Toyota Talisay
-- visit produces a Repair Order totalling 5,534.01 and a Service Invoice
-- totalling 3,106.49 for the same work, and the Repair Order says in its own
-- print that it is only an estimate. Without this column the two are
-- indistinguishable once stored, and photographing the wrong sheet quietly adds
-- 2,427.52 of work that never happened to a vehicle's history.
--
-- SERVICE_INVOICE is the default on purpose. Most receipts this product will
-- ever see are one piece of paper from a small shop that is the invoice and the
-- receipt at once, with no title worth trusting. Every other type has to be
-- earned by evidence printed on the page, so existing rows and anything the
-- classifier is unsure about keep their cost.

alter table public.service_drafts
    add column if not exists document_type text not null default 'SERVICE_INVOICE';

alter table public.service_records
    add column if not exists document_type text not null default 'SERVICE_INVOICE';

alter table public.service_drafts
    drop constraint if exists service_drafts_document_type_check;

alter table public.service_drafts
    add constraint service_drafts_document_type_check
    check (document_type in (
        'SERVICE_INVOICE',
        'OFFICIAL_RECEIPT',
        'ESTIMATE',
        'WORK_PERFORMED',
        'PARTS_SLIP',
        'INSPECTION_REPORT',
        'NOT_A_RECEIPT'
    ));

alter table public.service_records
    drop constraint if exists service_records_document_type_check;

alter table public.service_records
    add constraint service_records_document_type_check
    check (document_type in (
        'SERVICE_INVOICE',
        'OFFICIAL_RECEIPT',
        'ESTIMATE',
        'WORK_PERFORMED',
        'PARTS_SLIP',
        'INSPECTION_REPORT',
        'NOT_A_RECEIPT'
    ));

comment on column public.service_drafts.document_type is
    'What kind of document this draft was read off. SERVICE_INVOICE is the default and covers any final bill, including the single untitled sheet a small shop hands over. ESTIMATE (repair order, job order, quotation) prices work that had not happened yet, so its totals are a forecast and must never be presented as what was paid. OFFICIAL_RECEIPT carries money and no work at all, so a record built from one is cost-only and its service details must stay empty rather than be guessed. INSPECTION_REPORT is a finding about the vehicle rather than work done to it - a battery test slip or emission result - and must not be presented as a service that was performed.';

comment on column public.service_records.document_type is
    'Carried over from the draft this record was confirmed from. See the matching comment on service_drafts.document_type.';

commit;
