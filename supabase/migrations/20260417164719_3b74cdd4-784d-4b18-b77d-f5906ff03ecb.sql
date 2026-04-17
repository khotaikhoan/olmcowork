CREATE TABLE public.approved_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID,
  prompt TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  step_count INTEGER NOT NULL DEFAULT 0,
  was_early_start BOOLEAN NOT NULL DEFAULT false,
  model TEXT,
  provider TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.approved_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own plans select" ON public.approved_plans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "own plans insert" ON public.approved_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own plans delete" ON public.approved_plans
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_approved_plans_user_created ON public.approved_plans (user_id, created_at DESC);
CREATE INDEX idx_approved_plans_conversation ON public.approved_plans (conversation_id);