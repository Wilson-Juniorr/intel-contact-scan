import { Phone, MessageCircle, Mail, User, PhoneCall, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { useContactAttempts } from "@/hooks/useContactAttempts";

interface Props {
  lead: any;
  stageColor: string;
  onDragStart: () => void;
  onClick: () => void;
  onDelete?: (id: string) => void;
}

export function FunnelCard({ lead, stageColor, onDragStart, onClick, onDelete }: Props) {
  const whatsappUrl = `https://wa.me/55${lead.phone.replace(/\D/g, "")}`;
  const { totalAttempts, responseRate } = useContactAttempts(lead.phone);

  const timeSince = lead.last_contact_at
    ? formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: false, locale: ptBR })
    : null;

  const typeLabel = lead.type === "ADESAO" ? "Adesão" : lead.type === "PME" ? "PME" : "PF";
  const estimatedValue = lead.lives ? lead.lives * 120 : null;

  const goal = 6;
  const progress = Math.min(totalAttempts, goal);
  const pct = (progress / goal) * 100;
  const isComplete = progress >= goal;
  const barColor = isComplete ? "hsl(160, 84%, 39%)" : stageColor;

  return (
    <motion.div
      layout
      layoutId={lead.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.8 }}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="mx-1 my-1 rounded-lg border border-border bg-card shadow-xs hover:shadow-md cursor-grab active:cursor-grabbing transition-all duration-200 group hover:border-border/80"
    >
      <div className="px-3 pt-2.5 pb-2 space-y-1.5">
        {/* Title row */}
        <div className="flex items-start justify-between gap-1">
          <p className="text-[13px] font-semibold leading-snug text-foreground break-words flex-1">
            {lead.name}
          </p>
          <span
            className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5"
            style={{ backgroundColor: stageColor + "15", color: stageColor }}
          >
            {typeLabel}
          </span>
        </div>

        {/* Quote / Approved value */}
        {lead.approved_value ? (
          <p className="text-xs font-medium text-emerald-600">
            ✓ R$ {Number(lead.approved_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        ) : lead.quote_min_value ? (
          <p className="text-xs text-muted-foreground">
            Cotação: R$ {Number(lead.quote_min_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            {lead.quote_operadora && <span className="ml-1 opacity-70">· {lead.quote_operadora}</span>}
          </p>
        ) : estimatedValue ? (
          <p className="text-xs text-muted-foreground">
            R$ {estimatedValue.toLocaleString("pt-BR")}
          </p>
        ) : null}

        {/* Contact person */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{lead.name}</span>
        </div>

        {/* Follow-up progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <PhoneCall className="h-3 w-3" />
              {progress}/{goal} dias
            </span>
            {responseRate > 0 && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: (responseRate > 50 ? "hsl(160, 84%, 39%)" : "hsl(38, 92%, 50%)") + "15",
                  color: responseRate > 50 ? "hsl(160, 84%, 39%)" : "hsl(38, 92%, 50%)",
                }}
              >
                {responseRate}% resp.
              </span>
            )}
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: barColor }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Time since */}
        {timeSince && (
          <p className="text-[10px] text-muted-foreground">
            Última atividade há {timeSince}
          </p>
        )}

        {/* Lost reason */}
        {(lead.stage === "perdido" || lead.stage === "declinado" || lead.stage === "cancelado") && lead.lost_reason && (
          <div className="text-[10px] text-destructive bg-destructive/10 rounded px-1.5 py-0.5 inline-block">
            {lead.lost_reason}
          </div>
        )}
      </div>

      {/* Action icons – visible on hover */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <ActionBtn icon={<Phone className="h-3.5 w-3.5" />} href={`tel:+55${lead.phone.replace(/\D/g, "")}`} />
        <ActionBtn icon={<MessageCircle className="h-3.5 w-3.5" />} href={whatsappUrl} />
        <ActionBtn icon={<Mail className="h-3.5 w-3.5" />} href={lead.email ? `mailto:${lead.email}` : undefined} disabled={!lead.email} />
        <div className="ml-auto">
          <ActionBtn
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={() => onDelete?.(lead.id)}
            className="text-destructive/60 hover:text-destructive hover:bg-destructive/10"
          />
        </div>
      </div>
    </motion.div>
  );
}

function ActionBtn({
  icon, href, onClick, disabled = false, className,
}: {
  icon: React.ReactNode; href?: string; onClick?: () => void; disabled?: boolean; className?: string;
}) {
  const cls = `p-1.5 rounded-md transition-colors ${disabled ? "text-muted-foreground/20 cursor-not-allowed" : className || "text-muted-foreground hover:text-foreground hover:bg-accent"}`;

  if (href && !disabled) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={cls}>
        {icon}
      </a>
    );
  }
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick?.(); }} disabled={disabled} className={cls}>
      {icon}
    </button>
  );
}
