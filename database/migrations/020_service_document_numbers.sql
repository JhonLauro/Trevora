begin;

-- The document's own reference number, and the numbers it points at.
--
-- Extraction has been reading both since the document-type work, but they were
-- only ever written into field_metadata, where nothing can query them and no
-- screen can show them. They belong in the record.
--
-- Why they matter: a service centre's reference number is the key to that
-- shop's own system. An owner who can hand a mechanic "Toyota Talisay, repair
-- order G7IA123581" gets back everything the dealership recorded and this app
-- never saw - what the technician actually found, the parts by number, the
-- torque specs. That is the mechanic handoff this product exists for, and it
-- turns on a string we were already extracting and throwing into a metadata
-- blob. The same number settles a warranty claim or a billing dispute.
--
-- reference_numbers is the other half: the documents this one points AT. An
-- official receipt names the invoice it paid; an invoice names its repair
-- order. Those links are how the paperwork of one visit is found again, and
-- they are what multi-document merging already uses to group photographs of
-- the same visit.
--
-- Both nullable and empty by default. A talyer prints neither, and a record
-- without them is complete rather than deficient.

alter table public.service_drafts
    add column if not exists document_number text;

alter table public.service_drafts
    add column if not exists reference_numbers jsonb not null default '[]'::jsonb;

alter table public.service_records
    add column if not exists document_number text;

alter table public.service_records
    add column if not exists reference_numbers jsonb not null default '[]'::jsonb;

-- Finding a record by the number a shop quotes over the phone is the whole
-- point, and it is owner-scoped like every other lookup here.
create index if not exists service_records_document_number_idx
    on public.service_records (owner_id, document_number)
    where document_number is not null;

comment on column public.service_drafts.document_number is
    'This document''s own printed reference - invoice number, official receipt number, repair order number. Null when the document prints none, which is normal for a small shop. Never a TIN, permit number or barcode.';

comment on column public.service_drafts.reference_numbers is
    'Other documents this one points at, as a JSON array of strings. An official receipt names the invoice it paid; an invoice names its repair order. Used to group the several documents of one visit, and to find the rest of the paperwork later.';

comment on column public.service_records.document_number is
    'Carried over from the draft. The number to quote to the shop that did the work: it is the key to their own system, which holds far more about the visit than this record ever will.';

comment on column public.service_records.reference_numbers is
    'Carried over from the draft. See the matching comment on service_drafts.reference_numbers.';

commit;
