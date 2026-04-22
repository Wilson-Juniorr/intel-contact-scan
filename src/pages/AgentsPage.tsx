import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles } from "lucide-react";
import { AgentsConfigTab } from "@/components/agents/AgentsConfigTab";
import { AgentsConversationsTab } from "@/components/agents/AgentsConversationsTab";
import { AgentsComplianceTab } from "@/components/agents/AgentsComplianceTab";
import { AgentHQ } from "@/components/agents/AgentHQ";
import { AgentsPlaygroundTab } from "@/components/agents/AgentsPlaygroundTab";
import { AgentsVendorProfilesTab } from "@/components/agents/AgentsVendorProfilesTab";
import { AgentsTechniquesTab } from "@/components/agents/AgentsTechniquesTab";
import { AgentsCostPanel } from "@/components/agents/AgentsCostPanel";
import { AgentsDistributionTab } from "@/components/agents/AgentsDistributionTab";
import { AgentsRewarmingTab } from "@/components/agents/AgentsRewarmingTab";

export default function AgentsPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in-up">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-md shadow-primary/20">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agents IA</h1>
          <p className="text-sm text-muted-foreground">Configure, monitore e meça os agents que conversam com seus leads</p>
        </div>
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList className="grid w-full grid-cols-10 max-w-7xl">
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="brains">Cérebros</TabsTrigger>
          <TabsTrigger value="techniques">Técnicas</TabsTrigger>
          <TabsTrigger value="distribution">Distribuição</TabsTrigger>
          <TabsTrigger value="rewarming">Reaquecer</TabsTrigger>
          <TabsTrigger value="playground">Playground</TabsTrigger>
          <TabsTrigger value="conversations">Conversas</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="hq">Agent HQ</TabsTrigger>
          <TabsTrigger value="costs">Custos</TabsTrigger>
        </TabsList>
        <TabsContent value="config" className="animate-fade-in"><AgentsConfigTab /></TabsContent>
        <TabsContent value="brains" className="animate-fade-in"><AgentsVendorProfilesTab /></TabsContent>
        <TabsContent value="techniques" className="animate-fade-in"><AgentsTechniquesTab /></TabsContent>
        <TabsContent value="distribution" className="animate-fade-in"><AgentsDistributionTab /></TabsContent>
        <TabsContent value="rewarming" className="animate-fade-in"><AgentsRewarmingTab /></TabsContent>
        <TabsContent value="playground" className="animate-fade-in"><AgentsPlaygroundTab /></TabsContent>
        <TabsContent value="conversations" className="animate-fade-in"><AgentsConversationsTab /></TabsContent>
        <TabsContent value="compliance" className="animate-fade-in"><AgentsComplianceTab /></TabsContent>
        <TabsContent value="hq" className="animate-fade-in"><AgentHQ /></TabsContent>
        <TabsContent value="costs" className="animate-fade-in"><AgentsCostPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
