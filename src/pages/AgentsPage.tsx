import { useState, lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sparkles, Settings2, Bot, Play, MessageCircle, Mic, BarChart3 } from "lucide-react";
import { AgentsConfigTab } from "@/components/agents/AgentsConfigTab";
import { AgentsConversationsTab } from "@/components/agents/AgentsConversationsTab";
import { AgentsPlaygroundTab } from "@/components/agents/AgentsPlaygroundTab";
import { AgentsAudiosTab } from "@/components/agents/AgentsAudiosTab";
import { Skeleton } from "@/components/ui/skeleton";

const AgentsComplianceTab = lazy(() => import("@/components/agents/AgentsComplianceTab").then(m => ({ default: m.AgentsComplianceTab })));
const AgentHQ = lazy(() => import("@/components/agents/AgentHQ").then(m => ({ default: m.AgentHQ })));
const AgentsVendorProfilesTab = lazy(() => import("@/components/agents/AgentsVendorProfilesTab").then(m => ({ default: m.AgentsVendorProfilesTab })));
const AgentsTechniquesTab = lazy(() => import("@/components/agents/AgentsTechniquesTab").then(m => ({ default: m.AgentsTechniquesTab })));
const AgentsCostPanel = lazy(() => import("@/components/agents/AgentsCostPanel").then(m => ({ default: m.AgentsCostPanel })));
const AgentsDistributionTab = lazy(() => import("@/components/agents/AgentsDistributionTab").then(m => ({ default: m.AgentsDistributionTab })));
const AgentsRewarmingTab = lazy(() => import("@/components/agents/AgentsRewarmingTab").then(m => ({ default: m.AgentsRewarmingTab })));
const AgentsExamplesTab = lazy(() => import("@/components/agents/AgentsExamplesTab").then(m => ({ default: m.AgentsExamplesTab })));
const AgentsCampaignsTab = lazy(() => import("@/components/agents/AgentsCampaignsTab").then(m => ({ default: m.AgentsCampaignsTab })));
const AgentsMentesTab = lazy(() => import("@/components/agents/AgentsMentesTab").then(m => ({ default: m.AgentsMentesTab })));
const AgentsOperationsTab = lazy(() => import("@/components/agents/AgentsOperationsTab").then(m => ({ default: m.AgentsOperationsTab })));
const AgentsMetricsTab = lazy(() => import("@/components/agents/AgentsMetricsTab").then(m => ({ default: m.AgentsMetricsTab })));

function LazyFallback() {
  return <Skeleton className="h-64 w-full rounded-xl" />;
}

const MAIN_TABS = [
  { value: "config", label: "Configuração", icon: Settings2 },
  { value: "playground", label: "Playground", icon: Play },
  { value: "conversations", label: "Conversas", icon: MessageCircle },
  { value: "audios", label: "Áudios", icon: Mic },
  { value: "painel", label: "Painel", icon: BarChart3 },
] as const;

export default function AgentsPage() {
  const [tab, setTab] = useState("config");
  const [advancedOpen, setAdvancedOpen] = useState<string>("");

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in-up">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-md shadow-primary/20">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agents IA</h1>
          <p className="text-sm text-muted-foreground">Configure, teste e monitore seus agentes de pré-qualificação</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="w-full flex overflow-x-auto no-scrollbar">
          {MAIN_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="flex items-center gap-1.5 min-w-fit">
              <t.icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="config" className="animate-fade-in">
          <AgentsConfigTab />
        </TabsContent>
        <TabsContent value="playground" className="animate-fade-in">
          <AgentsPlaygroundTab />
        </TabsContent>
        <TabsContent value="conversations" className="animate-fade-in">
          <AgentsConversationsTab />
        </TabsContent>
        <TabsContent value="audios" className="animate-fade-in">
          <AgentsAudiosTab />
        </TabsContent>
        <TabsContent value="painel" className="animate-fade-in">
          <Suspense fallback={<LazyFallback />}>
            <AgentHQ />
          </Suspense>
        </TabsContent>
      </Tabs>

      {/* Seção Avançado */}
      <Accordion type="single" collapsible value={advancedOpen} onValueChange={setAdvancedOpen}>
        <AccordionItem value="advanced" className="border rounded-xl px-4">
          <AccordionTrigger className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            <span className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Avançado — Treinamento, Distribuição & Analytics
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <Tabs defaultValue="distribution" className="space-y-4 pt-2">
              <TabsList className="w-full flex overflow-x-auto no-scrollbar">
                <TabsTrigger value="distribution">Distribuição</TabsTrigger>
                <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
                <TabsTrigger value="rewarming">Reaquecimento</TabsTrigger>
                <TabsTrigger value="brains">Cérebros</TabsTrigger>
                <TabsTrigger value="techniques">Técnicas</TabsTrigger>
                <TabsTrigger value="examples">Exemplos</TabsTrigger>
                <TabsTrigger value="mentes">Mentes</TabsTrigger>
                <TabsTrigger value="compliance">Compliance</TabsTrigger>
                <TabsTrigger value="operations">Operações</TabsTrigger>
                <TabsTrigger value="metrics">Métricas</TabsTrigger>
                <TabsTrigger value="costs">Custos</TabsTrigger>
              </TabsList>
              <Suspense fallback={<LazyFallback />}>
                <TabsContent value="distribution"><AgentsDistributionTab /></TabsContent>
                <TabsContent value="campaigns"><AgentsCampaignsTab /></TabsContent>
                <TabsContent value="rewarming"><AgentsRewarmingTab /></TabsContent>
                <TabsContent value="brains"><AgentsVendorProfilesTab /></TabsContent>
                <TabsContent value="techniques"><AgentsTechniquesTab /></TabsContent>
                <TabsContent value="examples"><AgentsExamplesTab /></TabsContent>
                <TabsContent value="mentes"><AgentsMentesTab /></TabsContent>
                <TabsContent value="compliance"><AgentsComplianceTab /></TabsContent>
                <TabsContent value="operations"><AgentsOperationsTab /></TabsContent>
                <TabsContent value="metrics"><AgentsMetricsTab /></TabsContent>
                <TabsContent value="costs"><AgentsCostPanel /></TabsContent>
              </Suspense>
            </Tabs>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
