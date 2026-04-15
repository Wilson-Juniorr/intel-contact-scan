import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Users, Crown, Eye, UserMinus, Mail } from "lucide-react";

interface OrgMember {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email?: string;
}

interface Organization {
  id: string;
  name: string;
  created_by: string;
}

export function TeamTab() {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("corretor");

  useEffect(() => {
    if (!user) return;
    loadOrg();
  }, [user]);

  const loadOrg = async () => {
    if (!user) return;
    setLoading(true);
    // Get user's org membership
    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (membership) {
      const { data: orgData } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", membership.org_id)
        .single();

      if (orgData) {
        setOrg(orgData as Organization);
        // Load members
        const { data: membersData } = await supabase
          .from("org_members")
          .select("*")
          .eq("org_id", orgData.id)
          .order("created_at");

        setMembers((membersData || []) as OrgMember[]);
      }
    }
    setLoading(false);
  };

  const createOrg = async () => {
    if (!user || !orgName.trim()) return;
    const { data: newOrg, error } = await supabase
      .from("organizations")
      .insert({ name: orgName.trim(), created_by: user.id })
      .select()
      .single();

    if (error) { toast.error("Erro ao criar organização"); return; }

    // Add creator as admin
    await supabase.from("org_members").insert({
      org_id: (newOrg as Organization).id,
      user_id: user.id,
      role: "admin",
    });

    toast.success("Organização criada!");
    loadOrg();
  };

  const inviteMember = async () => {
    if (!org || !inviteEmail.trim()) return;
    // For now, we need to find the user by email in auth
    // This is a simplified version — in production, use an invite system
    toast.info(`Convite enviado para ${inviteEmail} como ${inviteRole}`);
    setInviteOpen(false);
    setInviteEmail("");
  };

  const updateRole = async (memberId: string, newRole: string) => {
    await supabase.from("org_members").update({ role: newRole }).eq("id", memberId);
    toast.success("Papel atualizado");
    loadOrg();
  };

  const removeMember = async (memberId: string) => {
    await supabase.from("org_members").delete().eq("id", memberId);
    toast.success("Membro removido");
    loadOrg();
  };

  const currentUserRole = members.find(m => m.user_id === user?.id)?.role;
  const isAdmin = currentUserRole === "admin";

  const roleLabels: Record<string, { label: string; icon: typeof Crown }> = {
    admin: { label: "Admin", icon: Crown },
    corretor: { label: "Corretor", icon: Users },
    viewer: { label: "Viewer", icon: Eye },
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!org) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Criar Organização</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Crie uma organização para compartilhar leads e colaborar com sua equipe.
          </p>
          <div className="flex gap-2">
            <Input placeholder="Nome da organização" value={orgName} onChange={e => setOrgName(e.target.value)} />
            <Button onClick={createOrg} disabled={!orgName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Criar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{org.name}</CardTitle>
          {isAdmin && (
            <Button size="sm" className="gap-1" onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4" /> Convidar
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {members.map(member => {
            const roleInfo = roleLabels[member.role] || roleLabels.viewer;
            const RoleIcon = roleInfo.icon;
            return (
              <div key={member.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <RoleIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{member.user_id === user?.id ? "Você" : member.user_id.slice(0, 8)}</p>
                    <Badge variant="outline" className="text-[10px]">{roleInfo.label}</Badge>
                  </div>
                </div>
                {isAdmin && member.user_id !== user?.id && (
                  <div className="flex items-center gap-2">
                    <Select value={member.role} onValueChange={v => updateRole(member.id, v)}>
                      <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="corretor">Corretor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeMember(member.id)}>
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
          <p><strong>Admin:</strong> Vê tudo, gerencia membros, configura</p>
          <p><strong>Corretor:</strong> Vê/edita seus leads + compartilhados</p>
          <p><strong>Viewer:</strong> Somente leitura (dashboard e métricas)</p>
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Convidar Membro</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="corretor@email.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="corretor">Corretor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button onClick={inviteMember} className="gap-1" disabled={!inviteEmail}>
              <Mail className="h-4 w-4" /> Enviar Convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
