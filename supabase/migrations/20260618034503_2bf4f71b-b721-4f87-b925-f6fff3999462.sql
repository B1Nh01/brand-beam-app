CREATE POLICY "client_media_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'client-media');
CREATE POLICY "client_media_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-media');
CREATE POLICY "client_media_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'client-media');
CREATE POLICY "client_media_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'client-media');