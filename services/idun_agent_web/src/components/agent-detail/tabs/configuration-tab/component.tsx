import { useState, useMemo, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import {
    Copy,
    Check,
    Activity,
    Database,
    ShieldCheck,
    Wrench,
    KeyRound,
    Server,
    Cpu,
    ChevronRight,
} from 'lucide-react';
import yaml from 'js-yaml';
import type { BackendAgent } from '../../../../services/agents';

/*
 * Design direction: utilitarian dev-tool UI inspired by Linear / Raycast.
 * Monochrome base, tight spacing, clear hierarchy through weight & opacity.
 * Summary = compact horizontal pills. Config = full-width code block that
 * sizes to its content (no artificial max-height).
 */

// ── Types ───────────────────────────────────────────────────────────────────

interface ConfigurationTabProps {
    agent: BackendAgent | null;
}

interface Feature {
    label: string;
    value: string;
    icon: React.FC<{ size?: number; strokeWidth?: number }>;
    color: string;
}

// ── Feature extraction ──────────────────────────────────────────────────────

function extractFeatures(ec: Record<string, unknown>): Feature[] {
    const out: Feature[] = [];
    const agent = ec.agent as Record<string, unknown> | undefined;
    const cfg = agent?.config as Record<string, unknown> | undefined;

    if (agent?.type)
        out.push({ label: 'Framework', value: String(agent.type), icon: Cpu, color: '#8c52ff' });

    const api = (ec.server as Record<string, unknown>)?.api as Record<string, unknown> | undefined;
    if (api?.port)
        out.push({ label: 'Port', value: String(api.port), icon: Server, color: '#64748b' });

    const obs = ec.observability as Record<string, unknown>[] | undefined;
    if (Array.isArray(obs) && obs.length > 0) {
        const active = obs.filter((o) => o.enabled !== false);
        const names = active.map((o) => String(o.provider ?? '')).filter(Boolean);
        out.push({ label: 'Observability', value: names.join(', ') || `${active.length}`, icon: Activity, color: '#22d3ee' });
    }

    const gr = ec.guardrails as Record<string, unknown> | undefined;
    if (gr) {
        const ic = Array.isArray(gr.input) ? gr.input.length : 0;
        const oc = Array.isArray(gr.output) ? gr.output.length : 0;
        if (ic + oc > 0)
            out.push({ label: 'Guardrails', value: `${ic + oc} rules`, icon: ShieldCheck, color: '#34d399' });
    }

    const mcp = (ec.mcpServers ?? ec.mcp_servers) as Record<string, unknown>[] | undefined;
    if (Array.isArray(mcp) && mcp.length > 0)
        out.push({ label: 'MCP', value: `${mcp.length} server${mcp.length > 1 ? 's' : ''}`, icon: Wrench, color: '#fbbf24' });

    if (cfg?.checkpointer) {
        const cp = cfg.checkpointer as Record<string, unknown>;
        out.push({ label: 'Memory', value: String(cp.type ?? 'on'), icon: Database, color: '#a78bfa' });
    }

    const sso = ec.sso as Record<string, unknown> | undefined;
    if (sso && sso.enabled !== false) {
        const issuer = String(sso.issuer ?? '');
        const short = issuer.replace(/^https?:\/\//, '').split('/')[0];
        out.push({ label: 'SSO', value: short || 'enabled', icon: KeyRound, color: '#f472b6' });
    }

    return out;
}

// ── Syntax highlighting ─────────────────────────────────────────────────────

function hlJSON(s: string): string {
    return s
        .replace(/("(?:\\.|[^"\\])*")\s*:/g, '<span class="k">$1</span>:')
        .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span class="s">$1</span>')
        .replace(/:\s*(true|false)/g, ': <span class="b">$1</span>')
        .replace(/:\s*(\d+\.?\d*)/g, ': <span class="n">$1</span>')
        .replace(/:\s*(null)/g, ': <span class="x">$1</span>');
}

function hlYAML(s: string): string {
    return s.split('\n').map((ln) => {
        if (/^\s*#/.test(ln)) return `<span class="c">${esc(ln)}</span>`;
        const m = ln.match(/^(\s*)([\w-]+)(:)(.*)/);
        if (m) {
            let v = esc(m[4]);
            const t = m[4].trim();
            if (/^['"].*['"]$/.test(t)) v = ` <span class="s">${esc(t)}</span>`;
            else if (/^(true|false)$/i.test(t)) v = ` <span class="b">${esc(t)}</span>`;
            else if (/^\d+\.?\d*$/.test(t)) v = ` <span class="n">${esc(t)}</span>`;
            else if (/^null$/i.test(t)) v = ` <span class="x">${esc(t)}</span>`;
            return `${esc(m[1])}<span class="k">${esc(m[2])}</span><span class="p">${esc(m[3])}</span>${v}`;
        }
        const li = ln.match(/^(\s*)(- )(.*)/);
        if (li) return `${esc(li[1])}<span class="p">${esc(li[2])}</span>${esc(li[3])}`;
        return esc(ln);
    }).join('\n');
}

function esc(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Collapsible ─────────────────────────────────────────────────────────────

function Collapse({
    label,
    defaultOpen = true,
    right,
    children,
}: {
    label: string;
    defaultOpen?: boolean;
    right?: React.ReactNode;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <CollapseWrap>
            <CollapseBar>
                <CollapseToggle onClick={() => setOpen((v) => !v)}>
                    <Arrow $open={open}><ChevronRight size={14} strokeWidth={2.2} /></Arrow>
                    <CollapseLabel>{label}</CollapseLabel>
                </CollapseToggle>
                {right && <CollapseRight onClick={(e) => e.stopPropagation()}>{right}</CollapseRight>}
            </CollapseBar>
            {open && children}
        </CollapseWrap>
    );
}

// ── Main ────────────────────────────────────────────────────────────────────

type Fmt = 'json' | 'yaml';

const ConfigurationTab = ({ agent }: ConfigurationTabProps) => {
    const [fmt, setFmt] = useState<Fmt>('json');
    const [copied, setCopied] = useState(false);

    const ec = agent?.engine_config as Record<string, unknown> | undefined;
    const features = useMemo(() => (ec ? extractFeatures(ec) : []), [ec]);

    const jsonStr = useMemo(() => (ec ? JSON.stringify(ec, null, 2) : ''), [ec]);
    const yamlStr = useMemo(() => {
        if (!ec) return '';
        try { return yaml.dump(ec, { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false }).trimEnd(); }
        catch { return '# Conversion failed'; }
    }, [ec]);

    const raw = fmt === 'json' ? jsonStr : yamlStr;
    const hl = useMemo(() => (fmt === 'json' ? hlJSON(jsonStr) : hlYAML(yamlStr)), [fmt, jsonStr, yamlStr]);
    const lineCount = raw.split('\n').length;

    const copy = useCallback(() => {
        navigator.clipboard.writeText(raw).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        });
    }, [raw]);

    if (!agent || !ec) return <Page><Empty>No configuration available</Empty></Page>;

    return (
        <Page>
            {features.length > 0 && (
                <Collapse label="Summary">
                    <Pills>
                        {features.map((f) => {
                            const I = f.icon;
                            return (
                                <Pill key={f.label}>
                                    <PillIcon $c={f.color}><I size={13} strokeWidth={1.8} /></PillIcon>
                                    <PillLabel>{f.label}</PillLabel>
                                    <PillValue>{f.value}</PillValue>
                                </Pill>
                            );
                        })}
                    </Pills>
                </Collapse>
            )}

            <Collapse
                label="Engine Config"
                right={
                    <Controls>
                        <FmtToggle>
                            <FmtBtn $on={fmt === 'json'} onClick={() => setFmt('json')}>JSON</FmtBtn>
                            <FmtBtn $on={fmt === 'yaml'} onClick={() => setFmt('yaml')}>YAML</FmtBtn>
                        </FmtToggle>
                        <CopyBtn onClick={copy}>
                            {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={1.6} />}
                            {copied ? 'Copied' : 'Copy'}
                        </CopyBtn>
                    </Controls>
                }
            >
                <CodeWrap>
                    <Gutter>
                        {Array.from({ length: lineCount }, (_, i) => (
                            <G key={i}>{i + 1}</G>
                        ))}
                    </Gutter>
                    <Code dangerouslySetInnerHTML={{ __html: hl }} />
                </CodeWrap>
            </Collapse>
        </Page>
    );
};

export default ConfigurationTab;

// ── Keyframes ───────────────────────────────────────────────────────────────

const enter = keyframes`
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
`;

// ── Page ────────────────────────────────────────────────────────────────────

const Page = styled.div`
    flex: 1;
    padding: 32px 40px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: ${enter} 0.18s ease-out;
`;

const Empty = styled.div`
    text-align: center;
    padding: 80px 20px;
    color: rgba(255, 255, 255, 0.3);
    font-size: 14px;
`;

// ── Collapse ────────────────────────────────────────────────────────────────

const CollapseWrap = styled.div`
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    overflow: hidden;
    background: var(--color-background-secondary, #13131d);
`;

const CollapseBar = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    height: 36px;
`;

const CollapseToggle = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: inherit;
`;

const Arrow = styled.span<{ $open: boolean }>`
    display: flex;
    color: rgba(255, 255, 255, 0.25);
    transition: transform 0.15s ease;
    transform: rotate(${(p) => (p.$open ? '90deg' : '0deg')});
`;

const CollapseLabel = styled.span`
    font-size: 11.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.45);
    text-transform: uppercase;
    letter-spacing: 0.06em;
`;

const CollapseRight = styled.div`
    display: flex;
    align-items: center;
`;

// ── Summary Pills ───────────────────────────────────────────────────────────

const Pills = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 8px;
    padding: 2px 14px 10px;
`;

const Pill = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.04);
`;

const PillIcon = styled.span<{ $c: string }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 5px;
    background: ${(p) => p.$c}14;
    color: ${(p) => p.$c};
`;

const PillLabel = styled.span`
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.35);
    text-transform: uppercase;
    letter-spacing: 0.03em;
`;

const PillValue = styled.span`
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
`;

// ── Format / Copy Controls ──────────────────────────────────────────────────

const Controls = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const FmtToggle = styled.div`
    display: flex;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.06);
`;

const FmtBtn = styled.button<{ $on: boolean }>`
    padding: 4px 10px;
    border: none;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.1s;
    font-family: inherit;
    letter-spacing: 0.02em;
    background: ${(p) => (p.$on ? 'rgba(140, 82, 255, 0.15)' : 'transparent')};
    color: ${(p) => (p.$on ? '#b197fc' : 'rgba(255,255,255,0.25)')};
    &:hover { color: ${(p) => (p.$on ? '#b197fc' : 'rgba(255,255,255,0.5)')}; }
`;

const CopyBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.1s;
    background: transparent;
    color: rgba(255, 255, 255, 0.25);
    font-family: inherit;
    &:hover { background: rgba(255, 255, 255, 0.03); color: rgba(255,255,255,0.6); }
`;

// ── Code Block ──────────────────────────────────────────────────────────────

const CodeWrap = styled.div`
    display: flex;
    overflow: auto;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    font-family: Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    font-size: 12.5px;
    line-height: 1.65;
    letter-spacing: -0.01em;
    -webkit-font-smoothing: antialiased;

    .k { color: #c4a7ff; }
    .s { color: #7dd3a8; }
    .b { color: #f9a66c; }
    .n { color: #79c7ff; }
    .x { color: #4a4a4a; font-style: italic; }
    .p { color: #4a4a4a; }
    .c { color: #363636; font-style: italic; }
`;

const Gutter = styled.div`
    display: flex;
    flex-direction: column;
    padding: 14px 0;
    min-width: 44px;
    text-align: right;
    user-select: none;
    border-right: 1px solid rgba(255, 255, 255, 0.03);
    background: rgba(0, 0, 0, 0.15);
    flex-shrink: 0;
`;

const G = styled.span`
    padding: 0 10px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.1);
    line-height: 1.65;
`;

const Code = styled.pre`
    margin: 0;
    padding: 14px 20px;
    color: rgba(255, 255, 255, 0.65);
    white-space: pre;
    overflow-x: auto;
    flex: 1;
`;
