-- ── Enum ──────────────────────────────────────────────────────────────────────
CREATE TYPE public.brand_module_type AS ENUM (
  'diagnosis', 'persona', 'competitors', 'positioning', 'product_ladder'
);

-- ── brand_folders ─────────────────────────────────────────────────────────────
CREATE TABLE public.brand_folders (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid        NOT NULL REFERENCES public.workspaces(id)  ON DELETE CASCADE,
  client_id         uuid        NOT NULL REFERENCES public.clients(id)     ON DELETE CASCADE,
  name              text        NOT NULL,
  visible_in_portal boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY bfo_all ON public.brand_folders
  FOR ALL TO authenticated
  USING (user_in_workspace(workspace_id))
  WITH CHECK (user_in_workspace(workspace_id));

-- ── brand_modules ─────────────────────────────────────────────────────────────
CREATE TABLE public.brand_modules (
  id                uuid                      PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid                      NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id         uuid                      NOT NULL REFERENCES public.clients(id)    ON DELETE CASCADE,
  type              public.brand_module_type   NOT NULL,
  title             text                      NOT NULL,
  content           jsonb                     NOT NULL DEFAULT '{}',
  visible_in_portal boolean                   NOT NULL DEFAULT false,
  created_at        timestamptz               NOT NULL DEFAULT now(),
  updated_at        timestamptz               NOT NULL DEFAULT now(),
  UNIQUE (client_id, type)
);

ALTER TABLE public.brand_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY bm_all ON public.brand_modules
  FOR ALL TO authenticated
  USING (user_in_workspace(workspace_id))
  WITH CHECK (user_in_workspace(workspace_id));

CREATE OR REPLACE FUNCTION public.touch_brand_module_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_brand_module_updated_at
  BEFORE UPDATE ON public.brand_modules
  FOR EACH ROW EXECUTE FUNCTION public.touch_brand_module_updated_at();

-- ── brand_files ───────────────────────────────────────────────────────────────
CREATE TABLE public.brand_files (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid        NOT NULL REFERENCES public.workspaces(id)  ON DELETE CASCADE,
  client_id         uuid        NOT NULL REFERENCES public.clients(id)     ON DELETE CASCADE,
  folder_id         uuid        REFERENCES public.brand_folders(id)        ON DELETE SET NULL,
  name              text        NOT NULL,
  storage_path      text        NOT NULL UNIQUE,
  mime_type         text        NOT NULL,
  size_bytes        bigint      NOT NULL,
  visible_in_portal boolean     NOT NULL DEFAULT false,
  uploaded_by       uuid        REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY bfi_all ON public.brand_files
  FOR ALL TO authenticated
  USING (user_in_workspace(workspace_id))
  WITH CHECK (user_in_workspace(workspace_id));

-- ── Storage bucket brand-files (private, 100 MB) ──────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand-files', 'brand-files', false, 104857600,
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
    'application/pdf',
    'video/mp4','video/quicktime','video/webm',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Storage path format: {workspace_id}/{client_id}/{filename}
CREATE POLICY "brand files team read"   ON storage.objects FOR SELECT TO authenticated
  USING  (bucket_id = 'brand-files' AND user_in_workspace((storage.foldername(name))[1]::uuid));
CREATE POLICY "brand files team insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'brand-files' AND user_in_workspace((storage.foldername(name))[1]::uuid));
CREATE POLICY "brand files team update" ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'brand-files' AND user_in_workspace((storage.foldername(name))[1]::uuid));
CREATE POLICY "brand files team delete" ON storage.objects FOR DELETE TO authenticated
  USING  (bucket_id = 'brand-files' AND user_in_workspace((storage.foldername(name))[1]::uuid));

-- Anon: allow signed URL generation for portal-visible files
CREATE POLICY "brand files portal read" ON storage.objects FOR SELECT TO anon
  USING (
    bucket_id = 'brand-files' AND EXISTS (
      SELECT 1 FROM public.brand_files bf
      LEFT  JOIN public.brand_folders bfo ON bfo.id = bf.folder_id
      WHERE bf.storage_path = name
        AND bf.visible_in_portal = true
        AND (bf.folder_id IS NULL OR bfo.visible_in_portal = true)
    )
  );

-- ── Portal RPCs (SECURITY DEFINER — validate token, return only visible rows) ──
CREATE OR REPLACE FUNCTION public.portal_get_brand_modules(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  SELECT id INTO _cid FROM clients WHERE portal_token = _token;
  IF _cid IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN COALESCE(
    (SELECT jsonb_agg(row_to_json(m) ORDER BY m.type)
     FROM brand_modules m
     WHERE m.client_id = _cid AND m.visible_in_portal = true),
    '[]'::jsonb
  );
END; $$;

CREATE OR REPLACE FUNCTION public.portal_get_brand_folders(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  SELECT id INTO _cid FROM clients WHERE portal_token = _token;
  IF _cid IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN COALESCE(
    (SELECT jsonb_agg(row_to_json(f) ORDER BY f.name)
     FROM brand_folders f
     WHERE f.client_id = _cid AND f.visible_in_portal = true),
    '[]'::jsonb
  );
END; $$;

CREATE OR REPLACE FUNCTION public.portal_get_brand_files(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  SELECT id INTO _cid FROM clients WHERE portal_token = _token;
  IF _cid IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN COALESCE(
    (SELECT jsonb_agg(row_to_json(bf) ORDER BY bf.folder_id NULLS FIRST, bf.name)
     FROM brand_files bf
     LEFT JOIN brand_folders bfo ON bfo.id = bf.folder_id
     WHERE bf.client_id = _cid
       AND bf.visible_in_portal = true
       AND (bf.folder_id IS NULL OR bfo.visible_in_portal = true)),
    '[]'::jsonb
  );
END; $$;
