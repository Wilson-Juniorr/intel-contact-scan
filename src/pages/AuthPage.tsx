import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) return;
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) toast.error(error.message);
    setLoading(false);
  };

  const handleSignUp = async () => {
    if (!email || !password) return;
    if (password.length < 6) {
      toast.error("Mínimo de 6 caracteres");
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Cadastro realizado!: Verifique seu email para confirmar a conta.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Grid pattern background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      {/* Gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10"
      >
        <Card className="w-full max-w-md glass-strong shadow-2xl">
          <CardHeader className="text-center">
            <motion.div
              className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center mb-4 shadow-lg shadow-primary/25"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
            >
              <span className="text-primary-foreground font-extrabold text-xl">J</span>
            </motion.div>
            <CardTitle className="text-2xl gradient-text">È o JOTA.</CardTitle>
            <CardDescription>Gestão inteligente de leads de planos de saúde</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="w-full">
                <TabsTrigger value="login" className="flex-1">
                  Entrar
                </TabsTrigger>
                <TabsTrigger value="register" className="flex-1">
                  Cadastrar
                </TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="space-y-4 mt-4">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="focus-ring-animated"
                  />
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                  <Label>Senha</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="focus-ring-animated"
                    onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                  />
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Button
                    onClick={handleSignIn}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-primary to-blue-500 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 btn-press"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                </motion.div>
              </TabsContent>
              <TabsContent value="register" className="space-y-4 mt-4">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="focus-ring-animated"
                  />
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                  <Label>Senha</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="focus-ring-animated"
                    onKeyDown={(e) => e.key === "Enter" && handleSignUp()}
                  />
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Button
                    onClick={handleSignUp}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-primary to-blue-500 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 btn-press"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {loading ? "Cadastrando..." : "Criar Conta"}
                  </Button>
                </motion.div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
