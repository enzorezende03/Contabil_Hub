ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS co_assignees text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.plannings ADD COLUMN IF NOT EXISTS co_assignees text[] NOT NULL DEFAULT '{}';