CREATE POLICY "item_images_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'item-images');
CREATE POLICY "item_images_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'item-images');
CREATE POLICY "item_images_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'item-images');
CREATE POLICY "item_images_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'item-images' AND owner = auth.uid());