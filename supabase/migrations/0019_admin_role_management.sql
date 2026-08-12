-- Migration 0019: Admin Role Management RPCs
-- Provides secure admin-only functions to list, grant, and revoke user roles.

CREATE OR REPLACE FUNCTION public.list_user_roles()
RETURNS TABLE (
  user_id uuid,
  username text,
  email text,
  roles text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT 
    p.user_id,
    p.username,
    u.email,
    COALESCE(array_agg(ur.role::text) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN public.user_roles ur ON ur.user_id = p.user_id
  GROUP BY p.user_id, p.username, u.email
  ORDER BY p.username ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_user_role(
  p_user_id uuid,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required' USING errcode = '42501';
  END IF;

  v_role := p_role::public.app_role;

  INSERT INTO public.user_roles (user_id, role, granted_by)
  VALUES (p_user_id, v_role, auth.uid())
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object('status', 'granted', 'userId', p_user_id, 'role', p_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_user_role(
  p_user_id uuid,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required' USING errcode = '42501';
  END IF;

  v_role := p_role::public.app_role;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id AND role = v_role;

  RETURN jsonb_build_object('status', 'revoked', 'userId', p_user_id, 'role', p_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_user_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_role(uuid, text) TO authenticated;
