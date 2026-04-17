import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ConversationList } from "@/components/chat/ConversationList";
import { ChatView } from "@/components/chat/ChatView";
import { SettingsDialog, SettingsValue } from "@/components/chat/SettingsDialog";

export default function Index() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsValue>({
    ollama_url: "http://localhost:11434",
    default_model: null,
    require_confirm: true,
    auto_stop_minutes: 0,
  });

  useEffect(() => {
    if (!loading && !user) nav("/auth", { replace: true });
  }, [loading, user, nav]);

  // load settings
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings({
            ollama_url: data.ollama_url,
            default_model: data.default_model,
            require_confirm: data.require_confirm,
            auto_stop_minutes: (data as any).auto_stop_minutes ?? 0,
          });
        }
      });
  }, [user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <ConversationList
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNew={() => setSelectedId(null)}
        refreshKey={refreshKey}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <ChatView
        conversationId={selectedId}
        ollamaUrl={settings.ollama_url}
        defaultModel={settings.default_model}
        requireConfirm={settings.require_confirm}
        autoStopMinutes={settings.auto_stop_minutes}
        onCreated={(id) => {
          setSelectedId(id);
          setRefreshKey((k) => k + 1);
        }}
        onTitleUpdated={() => setRefreshKey((k) => k + 1)}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={setSettings}
      />
    </div>
  );
}
