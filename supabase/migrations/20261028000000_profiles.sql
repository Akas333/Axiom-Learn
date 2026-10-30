-- Kapany user profiles: one row per Supabase auth user.
--
-- Users can read their own row and edit only display_name / avatar_url.
-- Plan and Stripe columns are written by the server (service role) from the
-- Stripe webhook, never by users.

create table public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	email text,
	display_name text check (char_length(display_name) <= 80),
	avatar_url text check (char_length(avatar_url) <= 2048),
	plan text not null default 'free' check (plan in ('free', 'pro')),
	plan_status text,
	stripe_customer_id text unique,
	stripe_subscription_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users read their own profile"
	on public.profiles for select
	to authenticated
	using ((select auth.uid()) = id);

create policy "Users update their own profile"
	on public.profiles for update
	to authenticated
	using ((select auth.uid()) = id)
	with check ((select auth.uid()) = id);

-- Column-level guard: users may only change their name and picture.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- Keep updated_at current.
create function public.profiles_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

create trigger profiles_touch_updated_at
	before update on public.profiles
	for each row execute function public.profiles_touch_updated_at();

-- Create a profile for every new sign-up, seeded from the auth provider
-- (Google sends full_name and avatar_url).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.profiles (id, email, display_name, avatar_url)
	values (
		new.id,
		new.email,
		left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 80),
		new.raw_user_meta_data ->> 'avatar_url'
	)
	on conflict (id) do nothing;
	return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
	after insert on auth.users
	for each row execute function public.handle_new_user();
