import { Phone, MessageCircle, Mail, Edit, User, Clock, ClipboardList } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  lead: any;
  stageColor: string;
  onDragStart: () => void;
  onClick: () => void;
}

export function FunnelCard({ lead, stageColor, onDragStart, onClick }: Props) {
  const whatsappUrl = `https://wa.me/55${lead.phone.replace(/\D/g, "")}`;

  const timeSince = lead.last_contact_at
    ? formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: false, locale: ptBR })
    : null;

  const typeLabel = lead.type === "PF" ? "PF" : lead.type === "PJ" ? "PJ" : "PME";
  const typeFull = lead.type === "PJ" ? "Pessoa Jurídica - CNPJ" : lead.type === "PME" ? "PME" : "";

  const estimatedValue = lead.lives ? lead.lives * 120 : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="mx-2 my-1.5 rounded border border-border bg-card shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-all group"
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
        <ActionBtn icon={<Edit className="h-3.5 w-3.5" />} onClick={onClick} color={stageColor} />
      </div>
    </div>
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
