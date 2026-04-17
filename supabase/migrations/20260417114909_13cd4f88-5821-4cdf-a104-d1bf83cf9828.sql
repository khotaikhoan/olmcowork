-- 1) New enum
DO $$ BEGIN
  CREATE TYPE public.conversation_mode AS ENUM ('chat', 'control');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Add column with default chat
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS mode public.conversation_mode NOT NULL DEFAULT 'chat';

-- 3) Auto-classify legacy conversations: if any message has tool_calls referencing
--    computer/bash/text_editor mutations → control mode, else chat.
UPDATE public.conversations c
SET mode = 'control'
WHERE EXISTS (
  SELECT 1
  FROM public.messages m,
       LATERAL jsonb_array_elements(COALESCE(m.tool_calls, '[]'::jsonb)) AS tc
  WHERE m.conversation_id = c.id
    AND tc->>'name' IN ('computer', 'bash', 'vision_click')
);