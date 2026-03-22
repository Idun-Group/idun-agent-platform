import React from 'react';
import styled from 'styled-components';
import { Activity, Database, ShieldCheck, Wrench, KeyRound, Plug } from 'lucide-react';
import type { BackendAgent } from '../../../../services/agents';

// ── Feature detection ────────────────────────────────────────────────────────

export function detectAgentFeatures(agent: BackendAgent) {
    const engineConfig = agent.engine_config;
    const agentConfig = engineConfig?.agent?.config as Record<string, unknown> | undefined;

    // Observability lives at engine_config.observability (array of provider configs)
    const obsConfig = (engineConfig as Record<string, unknown>)?.observability;
    const hasObservability = Array.isArray(obsConfig)
        ? obsConfig.some((o: Record<string, unknown>) => o?.enabled === true)
        : obsConfig != null;

    // Memory: LangGraph uses checkpointer/store, ADK uses memory_service/session_service
    // In-memory defaults (checkpointer.type=memory, session_service.type=in_memory) count as OFF
    const checkpointer = agentConfig?.checkpointer as Record<string, unknown> | null | undefined;
    const hasCheckpointer = checkpointer != null && checkpointer.type !== 'memory';
    const sessionService = agentConfig?.session_service as Record<string, unknown> | null | undefined;
    const hasSessionService = sessionService != null && sessionService.type !== 'in_memory';
    const hasMemory =
        hasCheckpointer ||
        agentConfig?.store != null ||
        agentConfig?.memory_service != null ||
        hasSessionService;

    // Guardrails: has input/output arrays — enabled when either has items
    const guardrails = engineConfig?.guardrails as Record<string, unknown> | null | undefined;
    const hasGuardrails =
        guardrails != null &&
        ((Array.isArray(guardrails.input) && guardrails.input.length > 0) ||
            (Array.isArray(guardrails.output) && guardrails.output.length > 0));

    // MCP servers: array at top level of engine_config (snake_case from backend, camelCase from some clients)
    const mcpServers = (engineConfig as Record<string, unknown>)?.mcp_servers ?? engineConfig?.mcpServers;
    const hasMcp = Array.isArray(mcpServers) && mcpServers.length > 0;

    // SSO: sso config at engine_config.sso
    const ssoConfig = (engineConfig as Record<string, unknown>)?.sso;
    const hasSso = ssoConfig != null && (ssoConfig as Record<string, unknown>)?.enabled !== false;

    // Integrations: array at engine_config.integrations
    const integrationsConfig = (engineConfig as Record<string, unknown>)?.integrations;
    const hasIntegrations = Array.isArray(integrationsConfig) && integrationsConfig.length > 0;

    return { hasObservability, hasMemory, hasGuardrails, hasMcp, hasSso, hasIntegrations };
}

// ── Feature config ───────────────────────────────────────────────────────────

interface FeatureDef {
    key: string;
    label: string;
    icon: React.FC<{ size?: number; strokeWidth?: number }>;
    color: string;
    glowColor: string;
}

const FEATURES: FeatureDef[] = [
    {
        key: 'observability',
        label: 'Obs',
        icon: Activity,
        color: '#22d3ee',
        glowColor: 'rgba(34, 211, 238, 0.15)',
    },
    {
        key: 'memory',
        label: 'Mem',
        icon: Database,
        color: '#a78bfa',
        glowColor: 'rgba(167, 139, 250, 0.15)',
    },
    {
        key: 'guardrails',
        label: 'Guard',
        icon: ShieldCheck,
        color: '#34d399',
        glowColor: 'rgba(52, 211, 153, 0.15)',
    },
    {
        key: 'mcp',
        label: 'MCP',
        icon: Wrench,
        color: '#fbbf24',
        glowColor: 'rgba(251, 191, 36, 0.15)',
    },
    {
        key: 'sso',
        label: 'SSO',
        icon: KeyRound,
        color: '#f472b6',
        glowColor: 'rgba(244, 114, 182, 0.15)',
    },
    {
        key: 'integrations',
        label: 'Int',
        icon: Plug,
        color: '#25d366',
        glowColor: 'rgba(37, 211, 102, 0.15)',
    },
];

// ── Component ────────────────────────────────────────────────────────────────

interface FeatureIconsProps {
    agent: BackendAgent;
}

export const FeatureIcons: React.FC<FeatureIconsProps> = ({ agent }) => {
    const features = detectAgentFeatures(agent);

    const activeMap: Record<string, boolean> = {
        observability: features.hasObservability,
        memory: features.hasMemory,
        guardrails: features.hasGuardrails,
        mcp: features.hasMcp,
        sso: features.hasSso,
        integrations: features.hasIntegrations,
    };

    return (
        <Row>
            {FEATURES.map((f) => {
                const active = activeMap[f.key];
                const Icon = f.icon;
                return (
                    <FeatureItem key={f.key} title={f.label}>
                        <IconPill $active={active} $color={f.color} $glow={f.glowColor}>
                            <Icon size={14} strokeWidth={active ? 2 : 1.5} />
                        </IconPill>
                        <Label $active={active} $color={f.color}>
                            {f.label}
                        </Label>
                    </FeatureItem>
                );
            })}
        </Row>
    );
};

// ── Styles ───────────────────────────────────────────────────────────────────

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const FeatureItem = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
`;

const IconPill = styled.div<{ $active: boolean; $color: string; $glow: string }>`
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;

    background: ${(p) => (p.$active ? p.$glow : 'var(--overlay-subtle)')};
    color: ${(p) => (p.$active ? p.$color : 'hsl(var(--muted-foreground))')};
    border: 1px solid ${(p) => (p.$active ? `${p.$color}33` : 'var(--overlay-light)')};
`;

const Label = styled.span<{ $active: boolean; $color: string }>`
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: ${(p) => (p.$active ? p.$color : 'hsl(var(--muted-foreground))')};
    transition: color 0.2s ease;
`;
