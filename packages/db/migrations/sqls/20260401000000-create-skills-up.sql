CREATE TABLE public.skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'custom',
  source TEXT NOT NULL DEFAULT 'file',
  content TEXT,
  package_specifier TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  installed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX idx_skills_type ON public.skills(type);
CREATE INDEX idx_skills_installed_by ON public.skills(installed_by);
