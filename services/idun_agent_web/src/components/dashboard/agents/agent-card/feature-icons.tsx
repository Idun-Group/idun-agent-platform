import React from 'react';
import styled from 'styled-components';
import { Activity, Database, ShieldCheck, Wrench, KeyRound } from 'lucide-react';
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
    const hasMemory =
        agentConfig?.checkpointer != null ||
        agentConfig?.store != null ||
        agentConfig?.memory_service != null ||
        (agentConfig?.session_service != null &&
            (agentConfig.session_service as Record<string, unknown>)?.type !== 'in_memory');

    // Guardrails: has input/output arrays — enabled when either has items
    const guardrails = engineConfig?.guardrails as Record<string, unknown> | null | undefined;
    const hasGuardrails =
        guardrails != null &&
        ((Array.isArray(guardrails.input) && guardrails.input.length > 0) ||
            (Array.isArray(guardrails.output) && guardrails.output.length > 0));

    // MCP servers: array at top level of engine_config
    const hasMcp =
        Array.isArray(engineConfig?.mcpServers) && engineConfig.mcpServers.length > 0;

    // SSO: sso config at engine_config.sso
    const ssoConfig = (engineConfig as Record<string, unknown>)?.sso;
    const hasSso = ssoConfig != null && (ssoConfig as Record<string, unknown>)?.enabled !== false;

    return { hasObservability, hasMemory, hasGuardrails, hasMcp, hasSso };
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

    background: ${(p) => (p.$active ? p.$glow : 'rgba(255, 255, 255, 0.04)')};
    color: ${(p) => (p.$active ? p.$color : 'rgba(255, 255, 255, 0.18)')};
    border: 1px solid ${(p) => (p.$active ? `${p.$color}33` : 'rgba(255, 255, 255, 0.06)')};
`;

const Label = styled.span<{ $active: boolean; $color: string }>`
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: ${(p) => (p.$active ? p.$color : 'rgba(255, 255, 255, 0.2)')};
    transition: color 0.2s ease;
`;
