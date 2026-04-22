import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles } from "lucide-react";
import { AgentsConfigTab } from "@/components/agents/AgentsConfigTab";
import { AgentsConversationsTab } from "@/components/agents/AgentsConversationsTab";
import { AgentsComplianceTab } from "@/components/agents/AgentsComplianceTab";
import { AgentsMetricsTab } from "@/components/agents/AgentsMetricsTab";
import { AgentsPlaygroundTab } from "@/components/agents/AgentsPlaygroundTab";

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
        <TabsList className="grid w-full grid-cols-5 max-w-3xl">
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="playground">Playground</TabsTrigger>
          <TabsTrigger value="conversations">Conversas</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
        </TabsList>
        <TabsContent value="config" className="animate-fade-in"><AgentsConfigTab /></TabsContent>
        <TabsContent value="playground" className="animate-fade-in"><AgentsPlaygroundTab /></TabsContent>
        <TabsContent value="conversations" className="animate-fade-in"><AgentsConversationsTab /></TabsContent>
        <TabsContent value="compliance" className="animate-fade-in"><AgentsComplianceTab /></TabsContent>
        <TabsContent value="metrics" className="animate-fade-in"><AgentsMetricsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
