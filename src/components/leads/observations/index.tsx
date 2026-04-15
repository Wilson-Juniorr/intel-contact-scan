import { useLeadObservations } from "@/hooks/useLeadObservations";
import { useLeadMembers } from "@/hooks/useLeadMembers";
import { Lead } from "@/types/lead";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StickyNote, FileUp, Sparkles } from "lucide-react";
import { NotesTab } from "./NotesTab";
import { DocumentsTab } from "./DocumentsTab";
import { AISummaryTab } from "./AISummaryTab";

interface Props {
  lead: Lead;
}

export function LeadObservationsPanel({ lead }: Props) {
  const obs = useLeadObservations(lead.id);
  const membersHook = useLeadMembers(lead.id);

  return (
    <Tabs defaultValue="notes" className="w-full">
      <TabsList className="w-full grid grid-cols-3 h-9">
        <TabsTrigger value="notes" className="text-[10px] gap-1 px-1">
          <StickyNote className="h-3 w-3" /> Notas
        </TabsTrigger>
        <TabsTrigger value="docs" className="text-[10px] gap-1 px-1">
          <FileUp className="h-3 w-3" /> Docs
        </TabsTrigger>
        <TabsTrigger value="ai" className="text-[10px] gap-1 px-1">
          <Sparkles className="h-3 w-3" /> IA
        </TabsTrigger>
      </TabsList>

      <TabsContent value="notes" className="mt-3">
        <NotesTab leadId={lead.id} obs={obs} />
      </TabsContent>

      <TabsContent value="docs" className="mt-3">
        <DocumentsTab lead={lead} obs={obs} membersHook={membersHook} />
      </TabsContent>

      <TabsContent value="ai" className="mt-3">
        <AISummaryTab lead={lead} obs={obs} />
      </TabsContent>
    </Tabs>
  );
}
