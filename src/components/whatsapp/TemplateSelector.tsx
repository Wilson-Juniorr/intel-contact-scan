import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronDown } from "lucide-react";
import {
  getTemplatesForStage,
  fillTemplateVariables,
  type MessageTemplate,
} from "@/data/whatsappTemplates";
import { FUNNEL_STAGES } from "@/types/lead";

interface Props {
  leadStage?: string;
  leadName?: string;
  leadOperator?: string;
  leadLives?: number;
  onSelect: (message: string) => void;
}

export default function TemplateSelector({
  leadStage,
  leadName,
  leadOperator,
  leadLives,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const templates = getTemplatesForStage(leadStage);

  const handleSelect = (template: MessageTemplate) => {
    const filled = fillTemplateVariables(template.text, {
      nome: leadName,
      operadora: leadOperator,
      vidas: leadLives,
    });
    onSelect(filled);
    setOpen(false);
  };

  const stageLabel = (key: string) => {
    if (key === "geral") return "Geral";
    return FUNNEL_STAGES.find((s) => s.key === key)?.label || key;
  };

  const stageColor = (key: string) => {
    if (key === "geral") return "hsl(200,10%,50%)";
    return FUNNEL_STAGES.find((s) => s.key === key)?.color || "hsl(0,0%,50%)";
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-[42px] w-[42px] shrink-0 rounded-full text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942]"
          title="Templates de mensagem"
        >
          <FileText className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-[340px] p-0 bg-[#233138] border-[#2a3942]"
      >
        <div className="px-3 py-2 border-b border-[#2a3942]">
          <p className="text-[13px] font-medium text-[#e9edef]">Templates de mensagem</p>
          {leadStage && (
            <p className="text-[11px] text-[#8696a0] mt-0.5">
              Mostrando para: {stageLabel(leadStage)}
            </p>
          )}
        </div>
        <div className="p-1 max-h-[280px] overflow-y-auto">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t)}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-[#2a3942] transition-colors group"
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] text-[#e9edef] font-medium">{t.label}</span>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1 py-0 h-4"
                  style={{ borderColor: stageColor(t.stage), color: stageColor(t.stage) }}
                >
                  {stageLabel(t.stage)}
                </Badge>
              </div>
              <p className="text-[11px] text-[#8696a0] line-clamp-2 group-hover:text-[#aebac1]">
                {fillTemplateVariables(t.text, {
                  nome: leadName || "{nome}",
                  operadora: leadOperator || "{operadora}",
                  vidas: leadLives,
                })}
              </p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
