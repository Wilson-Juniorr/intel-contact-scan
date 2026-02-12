import { Phone, MessageCircle, Mail, User, Clock, ClipboardList, PhoneCall } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { useContactAttempts } from "@/hooks/useContactAttempts";

interface Props {
  lead: any;
  stageColor: string;
  onDragStart: () => void;
  onClick: () => void;
}

export function FunnelCard({ lead, stageColor, onDragStart, onClick }: Props) {
  const whatsappUrl = `https://wa.me/55${lead.phone.replace(/\D/g, "")}`;
  const { totalAttempts, responseRate } = useContactAttempts(lead.phone);

  const timeSince = lead.last_contact_at
    ? formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: false, locale: ptBR })
    : null;

  const typeLabel = lead.type === "PF" ? "PF" : lead.type === "ADESAO" ? "Adesão" : "PME";
  const typeFull = lead.type === "ADESAO" ? "Adesão" : lead.type === "PME" ? "PME" : "";

  const estimatedValue = lead.lives ? lead.lives * 120 : null;

  return (
    <motion.div
      layout
      layoutId={lead.id}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.8 }}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="mx-2 my-1.5 rounded border border-border bg-card shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-shadow group"
    >
      <div className="px-3 pt-2.5 pb-2">
        {/* Title */}
        <p className="text-[13px] font-bold leading-snug break-words" style={{ color: stageColor }}>
          {lead.name}
          {typeFull ? ` | ${typeFull}` : ` | ${typeLabel}`}
        </p>

        {/* Value */}
        {estimatedValue && (
          <p className="text-xs text-foreground mt-1.5">
            Valor: R$ {estimatedValue.toLocaleString("pt-BR")}
          </p>
        )}

        {/* Status */}
        {lead.operator && (
          <p className="text-xs text-foreground">
            Status do Negócio: {lead.operator}
          </p>
        )}

        {/* Contact person */}
        <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5 shrink-0" style={{ color: stageColor }} />
          <span className="truncate">{lead.name}</span>
        </div>

        {/* Follow-up progress */}
        {(() => {
          const goal = 6;
          const progress = Math.min(totalAttempts, goal);
          const pct = (progress / goal) * 100;
          const isComplete = progress >= goal;
          const barColor = isComplete ? "hsl(140, 70%, 40%)" : stageColor;
          return (
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <PhoneCall className="h-3 w-3" style={{ color: stageColor }} />
                  {progress}/{goal} dias
                </span>
                {responseRate > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted" style={{ color: responseRate > 50 ? "hsl(140, 70%, 40%)" : "hsl(35, 85%, 50%)" }}>
                    {responseRate}% resp.
                  </span>
                )}
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: barColor }} />
              </div>
            </div>
          );
        })()}

        {/* Time */}
        {timeSince && (
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Tarefa há {timeSince}
          </p>
        )}

        {/* Lost reason */}
        {(lead.stage === "perdido" || lead.stage === "declinado" || lead.stage === "cancelado") && lead.lost_reason && (
          <div className="mt-1.5 text-[10px] text-destructive bg-destructive/10 rounded px-1.5 py-0.5 inline-block">
            {lead.lost_reason}
          </div>
        )}
      </div>

      {/* Action icons */}
      <div className="flex items-center gap-0 px-1.5 py-1 border-t border-border/40">
        <ActionBtn icon={<ClipboardList className="h-3.5 w-3.5" />} onClick={onClick} color={stageColor} />
        <ActionBtn icon={<Phone className="h-3.5 w-3.5" />} href={`tel:+55${lead.phone.replace(/\D/g, "")}`} color={stageColor} />
        <ActionBtn icon={<MessageCircle className="h-3.5 w-3.5" />} href={whatsappUrl} color={stageColor} />
        <ActionBtn icon={<Mail className="h-3.5 w-3.5" />} href={lead.email ? `mailto:${lead.email}` : undefined} color={stageColor} disabled={!lead.email} />
        
      </div>
    </motion.div>
  );
}

function ActionBtn({
  icon, href, onClick, color, disabled = false,
}: {
  icon: React.ReactNode; href?: string; onClick?: () => void; color: string; disabled?: boolean;
}) {
  const style = disabled ? {} : { color };
  const cls = `p-1.5 rounded transition-colors ${disabled ? "text-muted-foreground/20 cursor-not-allowed" : "hover:bg-muted"}`;

  if (href && !disabled) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={cls} style={style}>
        {icon}
      </a>
    );
  }
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick?.(); }} disabled={disabled} className={cls} style={style}>
      {icon}
    </button>
  );
}
