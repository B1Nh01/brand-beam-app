
CREATE POLICY "team read media" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'post-media');
CREATE POLICY "team upload media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'post-media');
CREATE POLICY "team update media" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'post-media');
CREATE POLICY "team delete media" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'post-media');
