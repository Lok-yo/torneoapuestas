-- 0002_admin_bootstrap.sql
-- One-time, idempotent bootstrap grant: the fixed maintainer email is
-- granted 'admin' if (and only if) that auth.users row already exists.
-- This migration is applied by the maintainer using the service-role key
-- at deploy time. There is deliberately no runtime endpoint, JWT-claim
-- grant, or environment-variable allowlist path — see proposal.md
-- "First admin bootstrap" and design.md "Browser writes vs commands".
--
-- Replaying this migration is safe: on a clean/empty target it inserts
-- zero rows (no matching auth.users row yet); after the fixed email signs
-- in once, the maintainer re-applies it (or a follow-up migration) to
-- grant admin.

insert into public.user_roles (user_id, role, granted_by, granted_at)
select id, 'admin', id, now()
from auth.users
where email = 'lleonalmaza@gmail.com'
on conflict (user_id, role) do nothing;
