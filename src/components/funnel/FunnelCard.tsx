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
  const initials = lead.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const timeSince = lead.last_contact_at
    ? formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: false, locale: ptBR })
    : null;

  const typeLabel = lead.type === "PF" ? "Pessoa Física" : lead.type === "PJ" ? "Pessoa Jurídica" : "PME";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="border-b border-border last:border-b-0 p-3 cursor-grab active:cursor-grabbing hover:bg-muted/40 transition-all group"
    >
      {/* Title */}
      <p className="text-sm font-bold leading-tight text-foreground truncate">
        {lead.name}{" "}
        <span className="font-normal text-muted-foreground">| {lead.type}</span>
      </p>

      {/* Contact info */}
      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
        <User className="h-3 w-3 shrink-0" />
        <span className="truncate">{lead.name}</span>
      </div>

      {/* Extra info */}
      {(lead.operator || lead.lives) && (
        <div className="mt-1.5 text-xs text-muted-foreground">
          {lead.operator && <span>Operadora: {lead.operator}</span>}
          {lead.operator && lead.lives ? " • " : ""}
          {lead.lives && <span>{lead.lives} vidas</span>}
        </div>
      )}

      {/* Stage-specific info */}
      {lead.plan_type && (
        <div className="mt-1 text-xs text-muted-foreground">
          Plano: {lead.plan_type}
        </div>
      )}

      {/* Time indicator */}
      {timeSince && (
        <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Contato há {timeSince}</span>
        </div>
      )}

      {/* Lost reason */}
      {lead.stage === "perdido" && lead.lost_reason && (
        <div className="mt-1.5 text-[10px] text-destructive bg-destructive/10 rounded px-1.5 py-0.5">
          Motivo: {lead.lost_reason}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-border/50">
        <ActionButton
          icon={<Phone className="h-3.5 w-3.5" />}
          href={`tel:+55${lead.phone.replace(/\D/g, "")}`}
          tooltip="Ligar"
        />
        <ActionButton
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          href={whatsappUrl}
          tooltip="WhatsApp"
          className="text-secondary"
        />
        <ActionButton
          icon={<Mail className="h-3.5 w-3.5" />}
          href={lead.email ? `mailto:${lead.email}` : undefined}
          tooltip="Email"
          disabled={!lead.email}
        />
        <ActionButton
          icon={<Edit className="h-3.5 w-3.5" />}
          onClick={onClick}
          tooltip="Editar"
        />
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  href,
  onClick,
  tooltip,
  className = "",
  disabled = false,
}: {
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  tooltip: string;
  className?: string;
  disabled?: boolean;
}) {
  const baseClasses = `p-1.5 rounded-md transition-colors ${
    disabled
      ? "text-muted-foreground/30 cursor-not-allowed"
      : `text-muted-foreground hover:text-primary hover:bg-primary/10 ${className}`
  }`;

  if (href && !disabled) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={baseClasses}
        title={tooltip}
      >
        {icon}
      </a>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      disabled={disabled}
      className={baseClasses}
      title={tooltip}
    >
      {icon}
    </button>
  );
}
