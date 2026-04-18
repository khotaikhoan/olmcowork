-- 1) Add materialized columns
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_message_preview text,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

CREATE INDEX IF NOT EXISTS conversations_user_last_msg_idx
  ON public.conversations (user_id, last_message_at DESC NULLS LAST);

-- 2) Helper: clean a message body into a short preview (mirrors client-side cleanPreview)
CREATE OR REPLACE FUNCTION public.clean_message_preview(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    NULLIF(
      btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(COALESCE(s, ''), '```[\s\S]*?```', '[code]', 'g'),
              E'!\\[[^\\]]*\\]\\([^)]+\\)', '[ảnh]', 'g'
            ),
            E'^\\s*#{1,6}\\s+', '', 'gm'
          ),
          E'\\s+', ' ', 'g'
        )
      ),
      ''
    )
$$;

-- 3) Recompute the latest preview for a single conversation
CREATE OR REPLACE FUNCTION public.refresh_conversation_last_message(_cid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
BEGIN
  SELECT content, created_at
    INTO m
    FROM public.messages
   WHERE conversation_id = _cid
     AND public.clean_message_preview(content) IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    UPDATE public.conversations
       SET last_message_preview = NULL,
           last_message_at = NULL
     WHERE id = _cid;
  ELSE
    UPDATE public.conversations
       SET last_message_preview = LEFT(public.clean_message_preview(m.content), 200),
           last_message_at = m.created_at
     WHERE id = _cid;
  END IF;
END;
$$;

-- 4) Trigger function: keep preview in sync on message INSERT/UPDATE/DELETE
CREATE OR REPLACE FUNCTION public.messages_sync_conversation_preview()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_conversation_last_message(OLD.conversation_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If the message was moved between conversations, refresh both
    IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
      PERFORM public.refresh_conversation_last_message(OLD.conversation_id);
    END IF;
    PERFORM public.refresh_conversation_last_message(NEW.conversation_id);
    RETURN NEW;
  ELSE -- INSERT
    PERFORM public.refresh_conversation_last_message(NEW.conversation_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS messages_sync_conversation_preview_ins ON public.messages;
DROP TRIGGER IF EXISTS messages_sync_conversation_preview_upd ON public.messages;
DROP TRIGGER IF EXISTS messages_sync_conversation_preview_del ON public.messages;

CREATE TRIGGER messages_sync_conversation_preview_ins
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_sync_conversation_preview();

CREATE TRIGGER messages_sync_conversation_preview_upd
AFTER UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_sync_conversation_preview();

CREATE TRIGGER messages_sync_conversation_preview_del
AFTER DELETE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_sync_conversation_preview();

-- 5) Backfill existing conversations
WITH latest AS (
  SELECT DISTINCT ON (m.conversation_id)
         m.conversation_id,
         m.content,
         m.created_at
    FROM public.messages m
   WHERE public.clean_message_preview(m.content) IS NOT NULL
   ORDER BY m.conversation_id, m.created_at DESC
)
UPDATE public.conversations c
   SET last_message_preview = LEFT(public.clean_message_preview(latest.content), 200),
       last_message_at = latest.created_at
  FROM latest
 WHERE c.id = latest.conversation_id;