-- Fix script for the single-workspace Verde model
-- 1) Stop auto-creating owner memberships from business creation.
-- 2) Ensure existing users are assigned to a single shared workspace.

-- Choose the canonical workspace that should be shared by all users.
-- Replace this UUID with your real workspace/business id if needed.
-- Example:
--   select id from public.businesses order by created_at asc limit 1;

DO $$
DECLARE
  canonical_workspace_id uuid;
BEGIN
  SELECT id
    INTO canonical_workspace_id
    FROM public.businesses
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

  IF canonical_workspace_id IS NULL THEN
    RAISE NOTICE 'No workspace exists yet; skipping membership repair.';
  ELSE
    -- Ensure every active user profile points at the canonical workspace.
    UPDATE public.user_profiles up
    SET workspace_id = canonical_workspace_id,
        updated_at = now()
    WHERE up.workspace_id IS DISTINCT FROM canonical_workspace_id;

    -- Deactivate any older memberships so the partial unique index can be satisfied.
    UPDATE public.workspace_members wm
    SET is_active = false,
        updated_at = now()
    WHERE wm.user_id IN (
      SELECT up.id FROM public.user_profiles up WHERE up.id IS NOT NULL
    )
      AND wm.is_active = true
      AND wm.workspace_id IS DISTINCT FROM canonical_workspace_id;

    -- Ensure every user has one active membership in the canonical workspace.
    INSERT INTO public.workspace_members (workspace_id, user_id, role, is_active, created_at, updated_at)
    SELECT canonical_workspace_id, up.id, COALESCE(up.role, 'user'), true, now(), now()
    FROM public.user_profiles up
    WHERE up.id IS NOT NULL
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET
      role = COALESCE(EXCLUDED.role, public.workspace_members.role),
      is_active = true,
      updated_at = now();

    -- Reactivate the canonical memberships for users that should share the workspace.
    UPDATE public.workspace_members wm
    SET is_active = true,
        updated_at = now()
    WHERE wm.workspace_id = canonical_workspace_id
      AND wm.user_id IN (
        SELECT up.id FROM public.user_profiles up WHERE up.id IS NOT NULL
      );
  END IF;
END $$;

-- Optional: if your app needs a single owner role for the first admin, assign it manually.
-- Example:
-- INSERT INTO public.workspace_members (workspace_id, user_id, role, is_active, created_at, updated_at)
-- SELECT b.id, 'YOUR-USER-ID', 'owner', true, now(), now()
-- FROM public.businesses b
-- WHERE b.id = 'YOUR-WORKSPACE-ID'
-- ON CONFLICT (workspace_id, user_id) DO UPDATE SET
--   role = 'owner',
--   is_active = true,
--   updated_at = now();
