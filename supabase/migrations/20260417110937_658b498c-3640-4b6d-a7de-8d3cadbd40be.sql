-- Activity log table for audit trail
CREATE TABLE public.activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  conversation_id uuid,
  message_id uuid,
  tool_name text NOT NULL,
  args jsonb,
  risk text NOT NULL DEFAULT 'low',
  status text NOT NULL DEFAULT 'done',
  output text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own activity select"
  ON public.activity_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "own activity insert"
  ON public.activity_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own activity delete"
  ON public.activity_log FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_activity_log_user_created ON public.activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_log_conversation ON public.activity_log(conversation_id);

-- Branch support for conversations
ALTER TABLE public.conversations
  ADD COLUMN branch_of_message_id uuid;

CREATE INDEX idx_conversations_branch ON public.conversations(branch_of_message_id);