GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_modules TO authenticated;
GRANT ALL ON public.brand_modules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_folders TO authenticated;
GRANT ALL ON public.brand_folders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_files TO authenticated;
GRANT ALL ON public.brand_files TO service_role;