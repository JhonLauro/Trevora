-- Profile photos: a Storage bucket, plus the policies that decide who may put
-- a file in it.
--
-- Unlike `service-receipts`, this bucket is public-read. A profile photo is
-- shown in the app shell on every screen, and signing a URL for it on each
-- render would mean an extra round trip for an image that carries nothing
-- private -- it is a picture the owner chose to represent themselves. Writes
-- are a different matter and stay locked to the owner.
--
-- Files are keyed by owner: `<user-id>/avatar-<timestamp>.<ext>`. Every policy
-- below hangs off that first path segment matching the caller's own auth uid,
-- which is what stops one signed-in account from overwriting another's photo.
--
-- Applied directly to Supabase, like every other migration here.

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do update set public = true;

-- Anyone may read: the bucket is public, and this makes that explicit rather
-- than relying on the flag alone.
drop policy if exists "Profile photos are publicly readable" on storage.objects;
create policy "Profile photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'profile-photos');

-- Uploads land only in the caller's own folder.
drop policy if exists "Users upload their own profile photo" on storage.objects;
create policy "Users upload their own profile photo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Replacing a photo is an insert of the new file and a delete of the old one;
-- the update policy covers the upsert path.
drop policy if exists "Users update their own profile photo" on storage.objects;
create policy "Users update their own profile photo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete their own profile photo" on storage.objects;
create policy "Users delete their own profile photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
