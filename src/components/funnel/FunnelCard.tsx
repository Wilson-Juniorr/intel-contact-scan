import { Phone, MessageCircle, Mail, Edit, User, Clock } from "lucide-react";
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
  const typeFull = lead.type === "PF" ? "Pessoa Física" : lead.type === "PJ" ? "Pessoa Jurídica - CNPJ" : "PME";

  const estimatedValue = lead.lives ? lead.lives * 120 : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="mx-2 my-1.5 rounded-md border border-border bg-card shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-shadow"
    >
      <div className="px-3 pt-2.5 pb-1.5">
        {/* Title: Name | Type - colored like HubSpot */}
        <p className="text-[13px] font-bold leading-tight" style={{ color: stageColor }}>
          {lead.name}{" "}
          <span className="font-bold">| {typeLabel}</span>
        </p>

        {/* Extended type label for PJ */}
        {lead.type !== "PF" && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{typeFull}</p>
        )}

        {/* Value & Status */}
        {estimatedValue && (
          <p className="text-xs text-foreground mt-1.5">
            Valor: R$ {estimatedValue.toLocaleString("pt-BR")}
          </p>
        )}
        {lead.operator && (
          <p className="text-xs text-foreground">
            Status do Negócio: {lead.operator}
          </p>
        )}

        {/* Contact name with icon */}
        <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5 shrink-0" style={{ color: stageColor }} />
          <span className="truncate">{lead.name}</span>
        </div>

        {/* Time since last contact */}
        {timeSince && (
          <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span>Tarefa há {timeSince}</span>
          </div>
        )}

        {/* Lost reason */}
        {lead.stage === "perdido" && lead.lost_reason && (
          <div className="mt-1.5 text-[10px] text-destructive bg-destructive/10 rounded px-1.5 py-0.5 inline-block">
            Motivo: {lead.lost_reason}
          </div>
        )}
      </div>

      {/* Action icons bar - HubSpot style */}
      <div className="flex items-center gap-0 px-1.5 py-1 border-t border-border/50">
        <ActionBtn
          icon={<Phone className="h-3.5 w-3.5" />}
          href={`tel:+55${lead.phone.replace(/\D/g, "")}`}
          color={stageColor}
        />
        <ActionBtn
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          href={whatsappUrl}
          color={stageColor}
        />
        <ActionBtn
          icon={<Mail className="h-3.5 w-3.5" />}
          href={lead.email ? `mailto:${lead.email}` : undefined}
          color={stageColor}
          disabled={!lead.email}
        />
        <ActionBtn
          icon={<Edit className="h-3.5 w-3.5" />}
          onClick={onClick}
          color={stageColor}
        />
      </div>
    </div>
  );
}

function ActionBtn({
  icon,
  href,
  onClick,
  color,
  disabled = false,
}: {
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  color: string;
  disabled?: boolean;
}) {
  const style = disabled ? {} : { color };
  const cls = `p-1.5 rounded transition-colors ${
    disabled ? "text-muted-foreground/20 cursor-not-allowed" : "hover:bg-muted"
  }`;

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
