/**
 * Landing — public hero page for Oculo.
 *
 * Shown at "/" when the visitor is not signed in. Authenticated users are
 * redirected straight to the chat (handled in App routing). Features:
 *   - Large animated OculoLogo as the hero mark
 *   - Tagline + dual CTAs (Đăng nhập / Dùng thử)
 *   - 3 feature cards: Local Ollama, Cloud AI, Computer Use
 *   - Soft radial gradient background using design tokens
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OculoLogo } from "@/components/OculoLogo";
import { Cpu, Cloud, MousePointerClick, ArrowRight, Sparkles } from "lucide-react";

const FEATURES = [
  {
    icon: Cpu,
    title: "Local Ollama",
    body: "Chạy model trên máy bạn — riêng tư tuyệt đối, không gửi dữ liệu ra ngoài, miễn phí và nhanh.",
    accent: "from-primary/20 to-primary/0",
  },
  {
    icon: Cloud,
    title: "Cloud AI",
    body: "Truy cập GPT-5, Gemini 2.5 Pro qua Lovable AI Gateway khi cần sức mạnh model lớn.",
    accent: "from-accent-foreground/20 to-accent-foreground/0",
  },
  {
    icon: MousePointerClick,
    title: "Computer Use",
    body: "Oculo quan sát màn hình, click chuột và gõ phím giúp bạn — agent thật, không chỉ chat.",
    accent: "from-primary/25 to-primary/0",
  },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Decorative gradient backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.18), transparent 70%), radial-gradient(40% 35% at 85% 30%, hsl(var(--accent) / 0.35), transparent 70%), radial-gradient(45% 40% at 10% 80%, hsl(var(--primary-glow) / 0.18), transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Top nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] shadow-[var(--shadow-soft)]">
            <OculoLogo size={20} withGradient={false} className="text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
            Oculo
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost" size="sm">Đăng nhập</Button>
          </Link>
          <Link to="/auth">
            <Button size="sm" className="gap-1">
              Bắt đầu <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-12 pb-20 text-center">
        <div className="mx-auto mb-8 flex h-32 w-32 items-center justify-center">
          <OculoLogo size={128} />
        </div>

        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI agent — local, cloud, computer use
        </div>

        <h1
          className="mx-auto max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          AI quan sát <span className="bg-[image:var(--gradient-primary)] bg-clip-text text-transparent">&amp; cộng tác</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
          Oculo là người đồng hành AI nhìn được màn hình của bạn, suy nghĩ cùng bạn,
          và thao tác máy tính khi bạn cho phép — chạy local hoặc trên cloud.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/auth">
            <Button size="lg" className="gap-2 px-6 shadow-[var(--shadow-elevated)]">
              Dùng thử miễn phí <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/auth">
            <Button size="lg" variant="outline" className="px-6">
              Tôi đã có tài khoản
            </Button>
          </Link>
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-5 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body, accent }) => (
            <Card
              key={title}
              className="group relative overflow-hidden border-border/60 bg-card/70 p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-elevated)]"
            >
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${accent} blur-2xl`}
              />
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-soft)]">
                <Icon className="h-5 w-5" />
              </div>
              <h3
                className="relative mt-4 text-xl font-semibold tracking-tight"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {title}
              </h3>
              <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </Card>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-md text-center text-xs text-muted-foreground">
          Mã nguồn mở · Dữ liệu của bạn ở lại với bạn · Hoạt động offline với Ollama
        </p>
      </section>
    </div>
  );
}
