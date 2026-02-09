import { MessageCircle, Phone, Mail, Edit, User, Clock } from "lucide-react";
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

  const typeLabel = lead.type === "PF" ? "Pessoa Física" : lead.type === "PJ" ? "Pessoa Jurídica" : "PME";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="border-b border-border bg-card hover:bg-muted/40 cursor-grab active:cursor-grabbing transition-colors group"
    >
      {/* Card content */}
      <div className="px-3 py-2.5">
        {/* Title row - HubSpot style: bold name | type */}
        <p className="text-sm font-bold text-foreground leading-tight">
          {lead.name}{" "}
          <span className="font-normal text-muted-foreground">| {lead.type}</span>
        </p>

        {/* Contact name with icon */}
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
          <User className="h-3 w-3 shrink-0" style={{ color: stageColor }} />
          <span className="truncate">{lead.name}</span>
        </div>

        {/* Extra info: operator, lives, plan */}
        {(lead.operator || lead.lives || lead.plan_type) && (
          <div className="mt-1 text-[11px] text-muted-foreground leading-snug">
            {lead.plan_type && <div>Valor: R$ {lead.lives ? (lead.lives * 120).toLocaleString("pt-BR") : "—"}</div>}
            {lead.operator && <div>Status do Negócio: {lead.operator}</div>}
          </div>
        )}

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

      {/* Action bar - HubSpot style icon row at bottom */}
      <div className="flex items-center gap-0 px-2 py-1 border-t border-border/40">
        <ActionIcon
          icon={<Phone className="h-3.5 w-3.5" />}
          href={`tel:+55${lead.phone.replace(/\D/g, "")}`}
          color={stageColor}
        />
        <ActionIcon
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          href={whatsappUrl}
          color={stageColor}
        />
        <ActionIcon
          icon={<Mail className="h-3.5 w-3.5" />}
          href={lead.email ? `mailto:${lead.email}` : undefined}
          color={stageColor}
          disabled={!lead.email}
        />
        <ActionIcon
          icon={<Edit className="h-3.5 w-3.5" />}
          onClick={onClick}
          color={stageColor}
        />
      </div>
    </div>
  );
}

function ActionIcon({
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
    disabled
      ? "text-muted-foreground/20 cursor-not-allowed"
      : "hover:bg-muted"
  }`;

  if (href && !disabled) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cls}
        style={style}
      >
        {icon}
      </a>
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      disabled={disabled}
      className={cls}
      style={style}
    >
      {icon}
    </button>
  );
}
