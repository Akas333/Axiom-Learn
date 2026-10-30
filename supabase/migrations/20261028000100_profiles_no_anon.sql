-- Signed-out visitors get no access to profiles at all (not just no rows).
revoke all on public.profiles from anon;
