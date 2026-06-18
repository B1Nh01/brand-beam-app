-- =============================================================
-- MIGRATION: Renomear valores do enum flow_stage
-- idea→tema, copy→conteudo, media→midia, final→legenda
-- =============================================================

ALTER TYPE public.flow_stage RENAME VALUE 'idea'  TO 'tema';
ALTER TYPE public.flow_stage RENAME VALUE 'copy'  TO 'conteudo';
ALTER TYPE public.flow_stage RENAME VALUE 'media' TO 'midia';
ALTER TYPE public.flow_stage RENAME VALUE 'final' TO 'legenda';
