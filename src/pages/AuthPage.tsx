import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Heart } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center mb-3">
            <Heart className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">CRM Saúde</CardTitle>
          <CardDescription>Gestão inteligente de leads de planos de saúde</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">Entrar</TabsTrigger>
              <TabsTrigger value="register" className="flex-1">Cadastrar</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="space-y-4 mt-4">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" /></div>
              <div><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" /></div>
              <Button onClick={handleSignIn} disabled={loading} className="w-full">{loading ? "Entrando..." : "Entrar"}</Button>
            </TabsContent>
            <TabsContent value="register" className="space-y-4 mt-4">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" /></div>
              <div><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" /></div>
              <Button onClick={handleSignUp} disabled={loading} className="w-full">{loading ? "Cadastrando..." : "Criar Conta"}</Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
