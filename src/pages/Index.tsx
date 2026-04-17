import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ConversationList } from "@/components/chat/ConversationList";
import { MiniRail } from "@/components/chat/MiniRail";
import { ChatView } from "@/components/chat/ChatView";
import { SettingsDialog, SettingsValue } from "@/components/chat/SettingsDialog";
import { ArtifactsPanel } from "@/components/chat/ArtifactsPanel";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Artifact } from "@/lib/artifacts";
import { useCommandPalette } from "@/components/CommandPalette";
import { GlobalDragDrop } from "@/components/chat/GlobalDragDrop";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { listAgents, subscribeAgents } from "@/lib/agentOrchestrator";
import { isElectron } from "@/lib/bridge";
import { AlertTriangle } from "lucide-react";

export default function Index() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMobile = useIsMobile();
  // Desktop sidebar has 3 states (expanded / mini / closed). Persisted to localStorage.
  const [sidebarMode, setSidebarMode] = useState<"expanded" | "mini" | "closed">(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("ui.sidebarMode") : null;
    return saved === "mini" || saved === "closed" || saved === "expanded" ? saved : "expanded";
  });
  useEffect(() => {
    try { localStorage.setItem("ui.sidebarMode", sidebarMode); } catch { /* ignore */ }
  }, [sidebarMode]);
  // Mobile sidebar lives in a Sheet — separate open/closed flag.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsValue>({
    provider: (localStorage.getItem("chat.provider") as any) || "ollama",
    openai_model: localStorage.getItem("chat.openai_model") || "gpt-4o-mini",
    ollama_url: "http://localhost:11434",
    default_model: null,
    require_confirm: true,
    auto_stop_minutes: 0,
    auto_start: true,
  });

  // Artifacts state — lifted from ChatView so the side panel can render them
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // Track whether any sub-agent exists — used to auto-open the side panel.
  const [hasAgents, setHasAgents] = useState(() => listAgents().length > 0);
  useEffect(() => {
    const tick = () => {
      const all = listAgents();
      const any = all.length > 0;
      setHasAgents(any);
      if (any && !panelOpen) setPanelOpen(true);
    };
    return subscribeAgents(tick);
  }, [panelOpen]);

  const { setHandlers } = useCommandPalette();

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
          setSettings((prev) => ({
            ...prev,
            ollama_url: data.ollama_url,
            default_model: data.default_model,
            require_confirm: data.require_confirm,
            auto_stop_minutes: (data as any).auto_stop_minutes ?? 0,
            auto_start: (data as any).auto_start ?? true,
          }));
        }
      });
  }, [user]);

  // Reset panel when switching conversation
  useEffect(() => {
    setPanelOpen(false);
    setActiveArtifactId(null);
    setArtifacts([]);
  }, [selectedId]);

  const openArtifact = (id: string) => {
    setActiveArtifactId(id);
    setPanelOpen(true);
  };

  // Wire command palette → app actions
  useEffect(() => {
    setHandlers({
      onNewChat: () => setSelectedId(null),
      onSelectConversation: (id) => setSelectedId(id),
      onOpenSettings: () => setSettingsOpen(true),
    });
  }, [setHandlers]);

  // Global Cmd+B → cycle desktop sidebar expanded → mini → closed → expanded.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (isMobile) setSidebarOpen((v) => !v);
        else
          setSidebarMode((m) =>
            m === "expanded" ? "mini" : m === "mini" ? "closed" : "expanded",
          );
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile]);

  const handleGlobalDrop = useCallback((_files: FileList) => {
    // Drag-drop overlay shows feedback; ChatInput's own dropzone still receives the files.
  }, []);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Đang tải…</div>
      </div>
    );
  }

  const chatNode = (
    <ChatView
      conversationId={selectedId}
      provider={settings.provider}
      openaiModel={settings.openai_model}
      ollamaUrl={settings.ollama_url}
      defaultModel={settings.default_model}
      requireConfirm={settings.require_confirm}
      autoStopMinutes={settings.auto_stop_minutes}
      autoStart={settings.auto_start}
      onCreated={(id) => {
        setSelectedId(id);
        setRefreshKey((k) => k + 1);
      }}
      onTitleUpdated={() => setRefreshKey((k) => k + 1)}
      onArtifactsChange={setArtifacts}
      onArtifactOpen={openArtifact}
      onToggleSidebar={isMobile ? () => setSidebarOpen(true) : () => setSidebarMode((m) => (m === "closed" ? "expanded" : m === "mini" ? "expanded" : "mini"))}
    />
  );

  // Desktop sidebar width animation: 288 (expanded) | 56 (mini) | 0 (closed).
  const desktopWidth =
    sidebarMode === "expanded" ? "w-72" : sidebarMode === "mini" ? "w-14" : "w-0";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop sidebar — animated container, switches between full list and mini-rail */}
      {!isMobile && (
        <div
          className={cn(
            "shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out",
            desktopWidth,
          )}
          aria-hidden={sidebarMode === "closed"}
        >
          {sidebarMode === "expanded" ? (
            <ConversationList
              selectedId={selectedId}
              onSelect={setSelectedId}
              onNew={() => setSelectedId(null)}
              refreshKey={refreshKey}
              onOpenSettings={() => setSettingsOpen(true)}
              onCollapse={() => setSidebarMode("mini")}
            />
          ) : sidebarMode === "mini" ? (
            <MiniRail
              onNew={() => setSelectedId(null)}
              onOpenSettings={() => setSettingsOpen(true)}
              onExpand={() => setSidebarMode("expanded")}
            />
          ) : null}
        </div>
      )}
      {/* Floating "open" chip when desktop sidebar fully closed */}
      {!isMobile && sidebarMode === "closed" && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSidebarMode("mini")}
          title="Mở sidebar (⌘/Ctrl+B)"
          className="fixed top-3 left-3 z-40 h-8 w-8 shadow-[var(--shadow-soft)] animate-fade-in"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      )}
      {/* Mobile sidebar in a Sheet */}
      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="p-0 w-[85vw] max-w-sm">
            <ConversationList
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setSidebarOpen(false);
              }}
              onNew={() => {
                setSelectedId(null);
                setSidebarOpen(false);
              }}
              refreshKey={refreshKey}
              onOpenSettings={() => {
                setSettingsOpen(true);
                setSidebarOpen(false);
              }}
            />
          </SheetContent>
        </Sheet>
      )}

      {panelOpen && (artifacts.length > 0 || hasAgents) ? (
        isMobile ? (
          // On mobile, stack chat and artifacts vertically (no resizable handles).
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 min-h-0">{chatNode}</div>
            <div className="h-[45vh] border-t border-border">
              <ArtifactsPanel
                artifacts={artifacts}
                activeId={activeArtifactId}
                onSelect={setActiveArtifactId}
                onClose={() => setPanelOpen(false)}
              />
            </div>
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="flex-1">
            <ResizablePanel defaultSize={55} minSize={30}>
              {chatNode}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={45} minSize={25} maxSize={70}>
              <ArtifactsPanel
                artifacts={artifacts}
                activeId={activeArtifactId}
                onSelect={setActiveArtifactId}
                onClose={() => setPanelOpen(false)}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )
      ) : (
        chatNode
      )}

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={setSettings}
      />

      <GlobalDragDrop onDrop={handleGlobalDrop} />
    </div>
  );
}
