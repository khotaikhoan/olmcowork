import { useState, FormEvent, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { OchatLogo } from "@/components/OchatLogo";

export default function AuthPage() {
  const { user, signIn, signUp } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) nav("/", { replace: true });
  }, [user, nav]);

  const submit = async (mode: "in" | "up", e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const fn = mode === "in" ? signIn : signUp;
    const { error } = await fn(email, password);
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else if (mode === "up") {
      toast.success("Tạo tài khoản thành công — bạn đã đăng nhập.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-6 shadow-[var(--shadow-elevated)]">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-[image:var(--gradient-primary)] flex items-center justify-center mb-3 shadow-[var(--shadow-elevated)]">
            <OchatLogo size={32} withGradient={false} className="text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Ochat</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI quan sát & cộng tác — local + cloud
          </p>
        </div>

        <Tabs defaultValue="in">
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="in">Đăng nhập</TabsTrigger>
            <TabsTrigger value="up">Đăng ký</TabsTrigger>
          </TabsList>

          {(["in", "up"] as const).map((mode) => (
            <TabsContent key={mode} value={mode}>
              <form onSubmit={(e) => submit(mode, e)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`email-${mode}`}>Email</Label>
                  <Input
                    id={`email-${mode}`}
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`pw-${mode}`}>Mật khẩu</Label>
                  <Input
                    id={`pw-${mode}`}
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "in" ? "current-password" : "new-password"}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Vui lòng chờ…" : mode === "in" ? "Đăng nhập" : "Tạo tài khoản"}
                </Button>
              </form>
            </TabsContent>
          ))}
        </Tabs>
      </Card>
    </div>
  );
}
