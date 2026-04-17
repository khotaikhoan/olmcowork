-- Memory store for cross-conversation facts
CREATE TABLE public.user_memories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  fact TEXT NOT NULL,
  source_conversation_id UUID,
  importance SMALLINT NOT NULL DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own memories select"
  ON public.user_memories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "own memories insert"
  ON public.user_memories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own memories update"
  ON public.user_memories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "own memories delete"
  ON public.user_memories FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_memories_user_importance
  ON public.user_memories(user_id, importance DESC, updated_at DESC);

CREATE TRIGGER update_user_memories_updated_at
  BEFORE UPDATE ON public.user_memories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();