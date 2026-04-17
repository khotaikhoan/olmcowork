import { useEffect, useState } from "react";
import { Lock, RefreshCw, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { isElectron } from "@/lib/bridge";
import { cn } from "@/lib/utils";

interface Props {
  /** null = no app lock (AI may interact with any app). */
  value: string | null;
  onChange: (app: string | null) => void;
}

/**
 * Control-mode-only dropdown that constrains the AI to act on a single app.
 * Fetches the running app list lazily when opened (avoids repeated AppleScript
 * / PowerShell calls). Refresh button re-pulls the list and frontmost app.
 */
export function AppLockSelect({ value, onChange }: Props) {
  const [apps, setApps] = useState<string[]>([]);
  const [frontmost, setFrontmost] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!isElectron()) return;
    setLoading(true);
    try {
      const b = (window as any).bridge;
      const [list, front] = await Promise.all([b.listApps(), b.getFrontmostApp()]);
      const merged = Array.from(
        new Set<string>([...(list?.apps ?? []), front?.app].filter(Boolean) as string[]),
      ).sort((a, b) => a.localeCompare(b));
      setApps(merged);
      setFrontmost(front?.app ?? null);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const locked = !!value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 max-w-[180px]",
            locked && "border-warning/50 bg-warning/10 text-warning hover:bg-warning/15",
          )}
          title={
            locked
              ? `Khoá AI vào "${value}". Bấm để đổi/mở khoá.`
              : "Chưa khoá app — AI có thể tương tác với mọi cửa sổ."
          }
        >
          {locked ? <Lock className="h-3.5 w-3.5 shrink-0" /> : <Unlock className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate text-xs">
            {locked ? value : "Mọi app"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <div className="flex items-center border-b border-border">
            <CommandInput placeholder="Tìm app…" className="h-9 border-0" />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 mr-1"
              onClick={refresh}
              title="Làm mới danh sách app"
              disabled={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
          <CommandList>
            <CommandEmpty>
              {isElectron() ? "Không tìm thấy app nào." : "Mở trong desktop app để dùng."}
            </CommandEmpty>
            <CommandGroup heading="Tuỳ chọn">
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Unlock className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                Mở khoá — mọi app
              </CommandItem>
              {frontmost && (
                <CommandItem
                  value={`__front__${frontmost}`}
                  onSelect={() => {
                    onChange(frontmost);
                    setOpen(false);
                  }}
                >
                  <Lock className="h-3.5 w-3.5 mr-2 text-warning" />
                  Khoá app frontmost
                  <span className="ml-auto text-xs text-muted-foreground truncate max-w-[120px]">
                    {frontmost}
                  </span>
                </CommandItem>
              )}
            </CommandGroup>
            {apps.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="App đang chạy">
                  {apps.map((a) => (
                    <CommandItem
                      key={a}
                      value={a}
                      onSelect={() => {
                        onChange(a);
                        setOpen(false);
                      }}
                    >
                      <Lock
                        className={cn(
                          "h-3.5 w-3.5 mr-2",
                          a === value ? "text-warning" : "text-muted-foreground/40",
                        )}
                      />
                      <span className="truncate">{a}</span>
                      {a === frontmost && (
                        <span className="ml-auto text-[10px] text-muted-foreground">frontmost</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
