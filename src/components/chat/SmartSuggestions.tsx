import {
  Play, Plus, Shield, Wand2, FlaskConical, Wrench, Info, Shuffle,
  ArrowRight, CheckCircle2, Zap, List, Search, GitCompare,
  MousePointerClick, Eye, Camera, Code2, Lightbulb, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Suggestion } from "@/lib/smartSuggestions";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  play: Play, plus: Plus, shield: Shield, wand: Wand2, flask: FlaskConical,
  wrench: Wrench, info: Info, shuffle: Shuffle, arrow: ArrowRight,
  check: CheckCircle2, zap: Zap, list: List, search: Search, compare: GitCompare,
  click: MousePointerClick, eye: Eye, camera: Camera, code: Code2, lightbulb: Lightbulb,
};

interface Props {
  suggestions: Suggestion[];
  onPick: (prompt: string) => void;
}

export function SmartSuggestions({ suggestions, onPick }: Props) {
  if (!suggestions.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 animate-fade-in">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground pr-1 pt-1.5">
        <Sparkles className="h-3 w-3" />
        <span>Gợi ý</span>
      </div>
      {suggestions.map((s, i) => {
        const Icon = (s.icon && ICONS[s.icon]) || ArrowRight;
        return (
          <Button
            key={i}
            size="sm"
            variant="outline"
            className="h-7 text-xs rounded-full border-border/60 bg-card/50 hover:bg-accent hover:border-primary/40 transition-all"
            onClick={() => onPick(s.prompt)}
            title={s.prompt}
          >
            <Icon className="h-3 w-3 mr-1" />
            {s.label}
          </Button>
        );
      })}
    </div>
  );
}
