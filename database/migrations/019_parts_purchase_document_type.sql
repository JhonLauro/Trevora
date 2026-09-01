begin;

-- Adds PARTS_PURCHASE to the document types.
--
-- A parts shop hands over a cash sales invoice for one battery: an article, a
-- price, a total, and no labour anywhere on the page. Nobody worked on the
-- vehicle. Filed as SERVICE_INVOICE it tells the next mechanic that a shop
-- replaced the battery, which is false and stated confidently; filed as
-- OFFICIAL_RECEIPT - which is what the classifier did before this type existed -
-- the part itself is discarded and only the money survives.
--
-- The discriminator is on the page rather than in the title: every line is a
-- part or a material and there is no operation. A small shop's sales order
-- billing parts AND labour together is an ordinary final bill despite the
-- similar heading.
--
-- Separate from 018 because 018 is already applied to the shared database.
-- Editing an applied migration leaves every environment disagreeing about what
-- it contained.

alter table public.service_drafts
    drop constraint if exists service_drafts_document_type_check;

alter table public.service_drafts
    add constraint service_drafts_document_type_check
    check (document_type in (
        'SERVICE_INVOICE',
        'OFFICIAL_RECEIPT',
        'ESTIMATE',
        'WORK_PERFORMED',
        'PARTS_PURCHASE',
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
        'PARTS_PURCHASE',
        'PARTS_SLIP',
        'INSPECTION_REPORT',
        'NOT_A_RECEIPT'
    ));

comment on column public.service_drafts.document_type is
    'What kind of document this draft was read off. SERVICE_INVOICE is the default and covers any final bill, including the single untitled sheet a small shop hands over. ESTIMATE (repair order, job order, quotation) prices work that had not happened yet, so its totals are a forecast and must never be presented as what was paid. OFFICIAL_RECEIPT carries money and no work at all, so a record built from one is cost-only and its service details must stay empty rather than be guessed. PARTS_PURCHASE is goods bought over the counter with no labour on the page - the part and the date are real history, but nothing says it was fitted. INSPECTION_REPORT is a finding about the vehicle rather than work done to it - a battery test slip or emission result - and must not be presented as a service that was performed.';

commit;
