-- Owner-supplied photos of a vehicle.
--
-- The vehicle page has had a "No photo" placeholder since it was built, with a
-- comment saying photos are not stored yet. This is that storage.
--
-- **Private bucket, unlike `profile-photos`.** A profile photo is a picture
-- somebody chose to represent themselves and carries nothing private, which is
-- why that bucket is public-read. A photo of a car is usually a photo of its
-- plate, often on the owner's street, and the same picture can end up in front
-- of a mechanic who scanned a QR code. A permanently public URL is the wrong
-- default for that, so this follows `service-receipts` instead: private
-- bucket, signed URL at render time.
--
-- Files are keyed by owner: `<user-id>/<vehicle>-<timestamp>.<ext>`. Every
-- policy hangs off that first path segment matching the caller's auth uid,
-- which is what stops one account reading or overwriting another's.
--
-- The bucket name is stored beside the path, the same way `service_drafts`
-- stores `receipt_storage_bucket`. A signed URL expires, so the URL itself
-- cannot be the stored value; and a bucket read from an env var today can be a
-- different bucket tomorrow, which would silently break every existing row.

begin;

alter table public.vehicle_profiles
    add column if not exists photo_bucket text;

alter table public.vehicle_profiles
    add column if not exists photo_path text;

commit;

-- Storage bucket and its policies. Separate from the transaction above because
-- `storage.buckets` is owned by the storage extension.

insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "Owners read their own vehicle photos" on storage.objects;
create policy "Owners read their own vehicle photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owners upload their own vehicle photos" on storage.objects;
create policy "Owners upload their own vehicle photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owners replace their own vehicle photos" on storage.objects;
create policy "Owners replace their own vehicle photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owners delete their own vehicle photos" on storage.objects;
create policy "Owners delete their own vehicle photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
