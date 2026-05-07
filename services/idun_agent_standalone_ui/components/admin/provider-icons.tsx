"use client";

import * as React from "react";
import { MemoryStick } from "lucide-react";

import { cn } from "@/lib/utils";

type IconProps = {
  size?: number;
  className?: string;
};

type RemoteBrandTileProps = IconProps & {
  domain: string;
  alt: string;
  padding?: number;
};

function brandIconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

function RemoteBrandTile({
  domain,
  alt,
  size = 40,
  padding = 6,
  className,
}: RemoteBrandTileProps) {
  const src = brandIconUrl(domain);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-foreground/10 overflow-hidden",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        style={{ width: size - padding * 2, height: size - padding * 2 }}
        draggable={false}
      />
    </div>
  );
}

export function LangChainIcon(p: IconProps) {
  return (
    <RemoteBrandTile
      domain="langchain.com"
      alt="LangChain"
      {...p}
    />
  );
}

export const LangGraphIcon = LangChainIcon;
export const LangSmithIcon = LangChainIcon;

export function GoogleCloudIcon(p: IconProps) {
  return (
    <RemoteBrandTile domain="cloud.google.com" alt="Google Cloud" {...p} />
  );
}

export const VertexAiIcon = GoogleCloudIcon;
export const AdkIcon = GoogleCloudIcon;

export function HaystackIcon(p: IconProps) {
  return (
    <RemoteBrandTile
      domain="deepset.ai"
      alt="Haystack"
      {...p}
    />
  );
}

export function PostgresIcon(p: IconProps) {
  return (
    <RemoteBrandTile domain="postgresql.org" alt="PostgreSQL" {...p} />
  );
}

export function SqliteIcon({ size = 40, className }: IconProps) {
  const padding = 6;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-foreground/10 overflow-hidden",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/sqlite/sqlite-original.svg"
        alt="SQLite"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        style={{ width: size - padding * 2, height: size - padding * 2 }}
        draggable={false}
      />
    </div>
  );
}

export function MemoryChipIcon({ size = 40, className }: IconProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg ring-1 ring-foreground/10",
        "bg-gradient-to-br from-violet-500/20 to-fuchsia-500/15",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <MemoryStick
        className="text-violet-300"
        size={Math.round(size * 0.55)}
        strokeWidth={1.8}
      />
    </div>
  );
}

export function LangfuseIcon(p: IconProps) {
  return <RemoteBrandTile domain="langfuse.com" alt="Langfuse" {...p} />;
}

export function PhoenixIcon(p: IconProps) {
  return <RemoteBrandTile domain="phoenix.arize.com" alt="Arize Phoenix" {...p} />;
}

export function GcpLoggingIcon(p: IconProps) {
  return (
    <RemoteBrandTile domain="cloud.google.com" alt="Google Cloud Logging" {...p} />
  );
}

export function GcpTraceIcon(p: IconProps) {
  return (
    <RemoteBrandTile domain="cloud.google.com" alt="Google Cloud Trace" {...p} />
  );
}

export function SlackIcon(p: IconProps) {
  return <RemoteBrandTile domain="slack.com" alt="Slack" {...p} />;
}

export function DiscordIcon(p: IconProps) {
  return <RemoteBrandTile domain="discord.com" alt="Discord" {...p} />;
}

export function WhatsAppIcon(p: IconProps) {
  return <RemoteBrandTile domain="whatsapp.com" alt="WhatsApp" {...p} />;
}

export function MicrosoftTeamsIcon(p: IconProps) {
  return (
    <RemoteBrandTile domain="teams.microsoft.com" alt="Microsoft Teams" {...p} />
  );
}

export function GoogleChatIcon(p: IconProps) {
  return (
    <RemoteBrandTile domain="chat.google.com" alt="Google Chat" {...p} />
  );
}

export function GoogleIdentityIcon(p: IconProps) {
  return <RemoteBrandTile domain="accounts.google.com" alt="Google" {...p} />;
}

export function MicrosoftEntraIcon(p: IconProps) {
  return <RemoteBrandTile domain="microsoft.com" alt="Microsoft Entra ID" {...p} />;
}

export function OktaIcon(p: IconProps) {
  return <RemoteBrandTile domain="okta.com" alt="Okta" {...p} />;
}
