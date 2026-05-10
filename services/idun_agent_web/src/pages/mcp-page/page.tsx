import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import {
    Globe,
    Radio,
    Plug,
    Terminal,
    Eye,
    EyeOff,
    Copy,
    BookOpen,
    Search,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchApplications, deleteApplication, createApplication, updateApplication, discoverTools } from '../../services/applications';
import type { MCPTool } from '../../services/applications';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';
import { CapabilityCatalog, CapabilityItem } from '../../components/capability-catalog';
import { Drawer } from '../../components/drawer';
import type { ApplicationConfig } from '../../types/application.types';
import type { AppType } from '../../types/application.types';

// ── Transport type metadata ──────────────────────────────────────────────────

type TransportType = 'StreamableHTTP' | 'SSE' | 'WebSocket' | 'STDIO';

const TRANSPORT_API_VALUE: Record<TransportType, string> = {
    StreamableHTTP: 'streamable_http',
    SSE: 'sse',
    WebSocket: 'websocket',
    STDIO: 'stdio',
};

const API_VALUE_TO_TRANSPORT: Record<string, TransportType> = Object.fromEntries(
    Object.entries(TRANSPORT_API_VALUE).map(([k, v]) => [v, k as TransportType]),
) as Record<string, TransportType>;

interface TransportField {
    key: string;
    label: string;
    type: 'text' | 'password' | 'url';
    placeholder?: string;
    required?: boolean;
}

interface TransportMeta {
    id: TransportType;
    label: string;
    icon: LucideIcon;
    description: string;
    fields: TransportField[];
}

const TRANSPORTS: TransportMeta[] = [
    {
        id: 'StreamableHTTP',
        label: 'Streamable HTTP',
        icon: Globe,
        description: 'Modern HTTP-based transport with streaming',
        fields: [
            { key: 'url', label: 'Server URL', type: 'url', placeholder: 'https://mcp.example.com/mcp', required: true },
            { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Bearer token or API key' },
        ],
    },
    {
        id: 'SSE',
        label: 'SSE',
        icon: Radio,
        description: 'Server-Sent Events transport',
        fields: [
            { key: 'url', label: 'SSE Endpoint', type: 'url', placeholder: 'https://mcp.example.com/sse', required: true },
            { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Bearer token or API key' },
        ],
    },
    {
        id: 'WebSocket',
        label: 'WebSocket',
        icon: Plug,
        description: 'WebSocket-based bidirectional transport',
        fields: [
            { key: 'url', label: 'WebSocket URL', type: 'url', placeholder: 'wss://mcp.example.com/ws', required: true },
            { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Bearer token or API key' },
        ],
    },
    {
        id: 'STDIO',
        label: 'STDIO',
        icon: Terminal,
        description: 'Standard I/O process-based transport',
        fields: [
            { key: 'command', label: 'Command', type: 'text', placeholder: 'npx -y @modelcontextprotocol/server-everything', required: true },
            { key: 'args', label: 'Arguments (JSON array)', type: 'text', placeholder: '["--flag", "value"]' },
            { key: 'env', label: 'Environment (JSON object)', type: 'text', placeholder: '{"KEY": "value"}' },
        ],
    },
];

const TRANSPORT_MAP: Record<TransportType, TransportMeta> = Object.fromEntries(
    TRANSPORTS.map(t => [t.id, t]),
) as Record<TransportType, TransportMeta>;

// ── Animations ────────────────────────────────────────────────────────────────

const fadeIn = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); }`;
const spin = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;
const expandDown = keyframes`from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 600px; }`;

// ── Layout ────────────────────────────────────────────────────────────────────

const PageWrapper = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 32px;
    gap: 24px;
    animation: ${fadeIn} 0.3s ease;
    overflow: hidden;
`;

const PageHeader = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    flex-shrink: 0;
`;

const TitleBlock = styled.div``;

const PageTitle = styled.h1`
    font-size: 24px;
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0 0 6px;
`;

const PageSubtitle = styled.p`
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const HeaderActions = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

// ── Header buttons ───────────────────────────────────────────────────────────

const HeaderBtn = styled.a`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    height: 38px;
    background: var(--overlay-light);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    color: hsl(var(--muted-foreground));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s;
    white-space: nowrap;

    &:hover {
        color: hsl(var(--foreground));
        border-color: var(--border-medium);
        background: var(--overlay-medium);
    }
`;

// ── Stacked sections ─────────────────────────────────────────────────────────

const SectionDivider = styled.hr`
    border: none;
    border-top: 1px solid var(--border-subtle);
    margin: 4px 0;
`;

const ConfiguredSection = styled.section`
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
`;

const ConfiguredHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
`;

const SectionLabel = styled.div`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: hsl(var(--muted-foreground));
`;

const PrimaryButton = styled.button`
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    &:hover { opacity: 0.9; }
`;

const EmptyHint = styled.div`
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    padding: 20px 0;
`;

// ── Search bar (header) ──────────────────────────────────────────────────────

const SearchBar = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--overlay-light);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 0 14px;
    height: 38px;
`;

const SearchInput = styled.input`
    background: transparent;
    border: none;
    outline: none;
    color: hsl(var(--foreground));
    font-size: 14px;
    width: 100%;

    &::placeholder { color: hsl(var(--muted-foreground)); }
`;

// ── Stats Bar ─────────────────────────────────────────────────────────────────

const StatsBar = styled.div`
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    margin-bottom: 16px;
`;

const StatChip = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    font-size: 13px;
    color: hsl(var(--text-secondary));

    strong { color: hsl(var(--foreground)); font-weight: 700; }
`;

// ── Quick Start ────────────────────────────────────────────────────────────────

const QuickStart = styled.div`
    background: hsl(var(--surface-elevated));
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    overflow: hidden;
    margin-bottom: 16px;
`;

const QuickStartHeader = styled.button`
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: hsl(var(--foreground));

    &:hover { background: var(--overlay-subtle); }
`;

const QuickStartTitle = styled.span`
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
`;

const QuickStartBadge = styled.span`
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 999px;
    background: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
    border: 1px solid hsl(var(--primary) / 0.25);
    text-transform: uppercase;
    letter-spacing: 0.05em;
`;

const QuickStartBody = styled.div<{ $open: boolean }>`
    display: ${p => p.$open ? 'block' : 'none'};
    border-top: 1px solid var(--border-subtle);
    padding: 20px;
`;

const CodeGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;

    @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const CodeLabel = styled.p`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: hsl(var(--primary));
    margin: 0 0 8px;
`;

const CodeBlock = styled.div`
    position: relative;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 16px;

    pre {
        margin: 0;
        font-family: 'Fira Code', 'Cascadia Code', monospace;
        font-size: 12px;
        line-height: 1.7;
        color: hsl(var(--muted-foreground));
        white-space: pre;
        overflow-x: auto;
    }
`;

const CodeCopyBtn = styled.button`
    position: absolute;
    top: 10px;
    right: 10px;
    background: var(--overlay-light);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    padding: 4px 8px;
    color: hsl(var(--muted-foreground));
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;

    &:hover { color: hsl(var(--foreground)); background: var(--overlay-medium); }
`;

const LANGGRAPH_EXAMPLE = `from idun_agent_engine.mcp.helpers import get_langchain_tools

tools = await get_langchain_tools()`;

const ADK_EXAMPLE = `from idun_agent_engine.mcp.helpers import get_adk_tools

tools = get_adk_tools()`;

// ── Minimal Python syntax tokenizer (no external dependency) ──────────────────

type PyToken = { kind: 'keyword' | 'string' | 'comment' | 'call' | 'cls' | 'plain'; value: string };

const PY_KW = new Set([
    'from', 'import', 'async', 'await', 'def', 'global', 'if', 'is', 'None',
    'return', 'else', 'True', 'False', 'not', 'and', 'or', 'in', 'for',
    'class', 'as', 'with', 'try', 'except', 'pass', 'lambda',
]);

const PY_COLORS: Record<string, string> = {
    keyword: '#c792ea',
    string:  '#c3e88d',
    comment: '#546e7a',
    call:    '#82aaff',
    cls:     '#ffcb6b',
    plain:   '#9ea7b3',
};

function tokenizePython(code: string): PyToken[] {
    const out: PyToken[] = [];
    let i = 0;
    while (i < code.length) {
        // Comment
        if (code[i] === '#') {
            const nl = code.indexOf('\n', i);
            const end = nl === -1 ? code.length : nl;
            out.push({ kind: 'comment', value: code.slice(i, end) });
            i = end;
            continue;
        }
        // String
        if (code[i] === '"' || code[i] === "'") {
            const q = code[i]; let j = i + 1;
            while (j < code.length && code[j] !== q) { if (code[j] === '\\') j++; j++; }
            out.push({ kind: 'string', value: code.slice(i, j + 1) });
            i = j + 1;
            continue;
        }
        // Identifier
        if (/[a-zA-Z_]/.test(code[i])) {
            let j = i;
            while (j < code.length && /\w/.test(code[j])) j++;
            const word = code.slice(i, j);
            let k = j; while (k < code.length && code[k] === ' ') k++;
            if (PY_KW.has(word))         out.push({ kind: 'keyword', value: word });
            else if (/^[A-Z]/.test(word)) out.push({ kind: 'cls',     value: word });
            else if (code[k] === '(')     out.push({ kind: 'call',    value: word });
            else                          out.push({ kind: 'plain',   value: word });
            i = j;
            continue;
        }
        out.push({ kind: 'plain', value: code[i++] });
    }
    return out;
}

const PyHighlight: React.FC<{ code: string }> = ({ code }) => (
    <>
        {tokenizePython(code).map((t, i) => (
            <span key={i} style={{ color: PY_COLORS[t.kind] }}>{t.value}</span>
        ))}
    </>
);

// ── Accordion List ────────────────────────────────────────────────────────────

const ServerList = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
`;

const ServerCard = styled.div`
    background: hsl(var(--surface-elevated));
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: border-color 0.2s;

    &:hover { border-color: hsl(var(--primary) / 0.3); }
`;

const ServerHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const ServerIcon = styled.div`
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;

    img {
        width: 24px;
        height: 24px;
        object-fit: contain;
    }
`;

const ServerMeta = styled.div`
    flex: 1;
    min-width: 0;
`;

const ServerName = styled.p`
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 2px;
`;

const ServerSubtitle = styled.p`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const ServerHeaderRight = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
`;

const StatusBadge = styled.span<{ $active: boolean }>`
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    background: ${p => p.$active ? 'rgba(52, 211, 153, 0.15)' : 'var(--border-subtle)'};
    color: ${p => p.$active ? '#34d399' : '#888'};
    border: 1px solid ${p => p.$active ? 'rgba(52, 211, 153, 0.3)' : 'transparent'};
`;

const TransportBadge = styled.span`
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    background: hsl(var(--primary) / 0.12);
    color: hsl(var(--primary));
    border: 1px solid hsl(var(--primary) / 0.2);
`;

const ChevronIcon = styled.span<{ $open: boolean }>`
    font-size: 12px;
    transition: transform 0.2s;
    transform: ${p => p.$open ? 'rotate(180deg)' : 'rotate(0deg)'};
    color: hsl(var(--muted-foreground));
`;

const AccordionBody = styled.div<{ $open: boolean }>`
    display: ${p => p.$open ? 'block' : 'none'};
    animation: ${p => p.$open ? expandDown : 'none'} 0.25s ease;
    border-top: 1px solid var(--border-subtle);
    padding: 20px;
`;

const BodyGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const SectionTitle = styled.p`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: hsl(var(--muted-foreground));
    margin: 0 0 4px;
`;

const Divider = styled.hr`
    border: none;
    border-top: 1px solid var(--border-subtle);
    margin: 0;
`;

const ConfigList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const CardActions = styled.div`
    display: flex;
    gap: 8px;
    margin-top: auto;
`;

const ConfigRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`;

const ConfigKey = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    text-transform: capitalize;
    flex-shrink: 0;
`;

const ConfigValue = styled.span`
    font-size: 12px;
    color: hsl(var(--text-secondary));
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
`;

const SecretValue = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 200px;
`;

const SecretText = styled.span`
    font-size: 12px;
    color: hsl(var(--text-secondary));
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const EyeBtn = styled.button`
    background: none;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 0;
    font-size: 12px;
    flex-shrink: 0;

    &:hover { color: hsl(var(--foreground)); }
`;

const DiscoverButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px 16px;
    background: hsl(var(--primary) / 0.06);
    border: 1px dashed hsl(var(--primary) / 0.25);
    border-radius: 10px;
    color: hsl(var(--primary));
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
        background: hsl(var(--primary) / 0.12);
        border-style: solid;
    }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ToolList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
`;

const ToolCountBadge = styled.span`
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 20px;
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    border: 1px solid hsl(var(--primary) / 0.2);
`;

const ToolItem = styled.div`
    padding: 10px 14px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    transition: border-color 0.15s;

    &:hover { border-color: hsl(var(--primary) / 0.2); }
`;

const ToolName = styled.p`
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--primary));
    margin: 0 0 3px;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
`;

const ToolDescription = styled.p`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    margin: 0;
    line-height: 1.4;
`;

const DiscoverError = styled.p`
    font-size: 13px;
    color: hsl(var(--destructive));
    margin: 0;
    text-align: center;
`;

const DiscoverSpinner = styled.div`
    width: 14px;
    height: 14px;
    border: 2px solid hsl(var(--primary) / 0.2);
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

const AgentCountBadge = styled.span`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    display: flex;
    align-items: center;
    gap: 4px;
`;

const BodyActions = styled.div`
    display: flex;
    gap: 10px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--border-subtle);
`;

const EditBtn = styled.button`
    padding: 8px 18px;
    background: var(--border-subtle);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: var(--overlay-medium); }
`;

const DeleteBtn = styled.button`
    padding: 8px 18px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 8px;
    color: hsl(var(--destructive));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: rgba(248, 113, 113, 0.18); }
`;

// ── Drawer form styled components ────────────────────────────────────────────

const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

const Label = styled.label`
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--text-secondary));
    margin-bottom: 8px;
`;

const Required = styled.span`
    color: hsl(var(--destructive));
`;

const Hint = styled.p`
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    margin: 4px 0 0;
`;

const Input = styled.input`
    width: 100%;
    padding: 10px 14px;
    background: var(--overlay-light);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: hsl(var(--foreground));
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;

    &::placeholder { color: hsl(var(--muted-foreground)); }
    &:focus { border-color: hsl(var(--primary)); box-shadow: 0 0 0 2px hsl(var(--primary) / 0.12); }
`;

const PasswordWrapper = styled.div`
    position: relative;
    display: flex;
    align-items: center;
`;

const PasswordToggleBtn = styled.button`
    position: absolute;
    right: 12px;
    background: none;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    flex-shrink: 0;

    &:hover { color: hsl(var(--foreground)); }
`;

const ErrorMsg = styled.p`
    font-size: 13px;
    color: hsl(var(--destructive));
    margin: 0 0 16px;
    padding: 10px 14px;
    background: rgba(248, 113, 113, 0.1);
    border-radius: 8px;
    border: 1px solid rgba(248, 113, 113, 0.2);
`;

const FormFooter = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 20px;
    margin-top: 8px;
    border-top: 1px solid var(--border-subtle);
`;

const CancelBtn = styled.button`
    padding: 10px 20px;
    background: transparent;
    border: 1px solid var(--border-medium);
    border-radius: 8px;
    color: hsl(var(--text-secondary));
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: var(--overlay-light); color: hsl(var(--foreground)); }
`;

const SubmitBtn = styled.button`
    padding: 10px 24px;
    background: hsl(var(--primary));
    border: none;
    border-radius: 8px;
    color: hsl(var(--primary-foreground));
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
    gap: 8px;

    &:disabled { opacity: 0.5; cursor: not-allowed; }
    &:hover:not(:disabled) { opacity: 0.9; }
`;

const SmallSpinner = styled.div`
    width: 14px;
    height: 14px;
    border: 2px solid var(--overlay-strong);
    border-top-color: hsl(var(--foreground));
    border-radius: 50%;
    animation: ${spin} 0.7s linear infinite;
`;

// ── Loading ──────────────────────────────────────────────────────────────────

const CenterBox = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 80px;
    color: hsl(var(--muted-foreground));
    text-align: center;
`;

const LoadingSpinner = styled.div`
    width: 36px;
    height: 36px;
    border: 3px solid var(--border-light);
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const SECRET_KEYS = ['secret_key', 'secretKey', 'api_key', 'apiKey', 'password', 'token'];

const isSecretKey = (key: string) => SECRET_KEYS.some(s => key.toLowerCase().includes(s.toLowerCase()));

const flattenConfig = (config: unknown): Record<string, string> => {
    if (!config || typeof config !== 'object') return {};
    const obj = config as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const k in obj) {
        const v = obj[k];
        if (v !== null && v !== undefined && v !== '') {
            result[k] = typeof v === 'string' ? v : JSON.stringify(v);
        }
    }
    return result;
};

const getServerUrl = (config: Record<string, string>) => {
    return config.url ?? config.command ?? '';
};

// ── SecretField ───────────────────────────────────────────────────────────────

const SecretField: React.FC<{ value: string }> = ({ value }) => {
    const [visible, setVisible] = useState(false);
    return (
        <SecretValue>
            <SecretText>{visible ? value : '\u2022'.repeat(Math.min(value.length, 12))}</SecretText>
            <EyeBtn type="button" onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={14} /> : <Eye size={14} />}</EyeBtn>
        </SecretValue>
    );
};

// ── Per-transport modal component ────────────────────────────────────────────

interface TransportDrawerProps {
    open: boolean;
    transportId: TransportType | null;
    appToEdit: ApplicationConfig | null;
    onClose: () => void;
    onSaved: () => void;
}

const TransportDrawer: React.FC<TransportDrawerProps> = ({ open, transportId, appToEdit, onClose, onSaved }) => {
    const { t } = useTranslation();
    const meta = transportId ? TRANSPORT_MAP[transportId] : null;
    const fields = meta?.fields ?? [];
    const isEditMode = !!appToEdit;

    const [name, setName] = useState('');
    const [formValues, setFormValues] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (appToEdit) {
            setName(appToEdit.name ?? '');
            const cfg = (appToEdit.config ?? {}) as Record<string, unknown>;
            const strCfg: Record<string, string> = {};
            for (const k in cfg) {
                const v = cfg[k];
                if (v !== null && v !== undefined) strCfg[k] = typeof v === 'string' ? v : String(v);
            }
            setFormValues(strCfg);
        } else {
            setName('');
            setFormValues({});
        }
        setErrorMessage(null);
        setVisiblePasswords({});
    }, [appToEdit, transportId]);

    const handleChange = (key: string, value: string) => {
        setFormValues(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        if (!meta || !transportId) return;

        // Validate required fields
        for (const field of fields) {
            if (field.required && !formValues[field.key]?.trim()) {
                setErrorMessage(`${field.label} is required`);
                return;
            }
        }

        setIsSubmitting(true);
        try {
            const finalName = name.trim() || meta.label;
            const config: Record<string, string> = {
                ...formValues,
                transport: TRANSPORT_API_VALUE[transportId],
            };
            if (config.api_key && transportId !== 'STDIO') {
                config.headers = JSON.stringify({ Authorization: `Bearer ${config.api_key}` });
                delete config.api_key;
            }
            const payload = {
                name: finalName,
                type: 'MCPServer' as AppType,
                category: 'MCP' as const,
                config,
            };
            if (isEditMode && appToEdit?.id) {
                await updateApplication(appToEdit.id, payload);
            } else {
                await createApplication(payload);
            }
            onSaved();
            onClose();
        } catch (err: unknown) {
            setErrorMessage(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsSubmitting(false);
        }
    };

    const drawerTitle = meta
        ? (isEditMode
            ? t('admin.mcp.drawer_title_edit', `Edit ${meta.label}`)
            : t(`admin.mcp.transport.${transportSlug(meta.id)}.label`, meta.label))
        : '';

    return (
        <Drawer open={open} onClose={onClose} title={drawerTitle}>
            <form onSubmit={handleSubmit}>
                {errorMessage && <ErrorMsg>{errorMessage}</ErrorMsg>}

                <FieldGroup>
                    <Label htmlFor="server-name">Server Name</Label>
                    <Input
                        id="server-name"
                        type="text"
                        placeholder={meta?.label ?? ''}
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                </FieldGroup>

                {fields.map(field => (
                    <FieldGroup key={field.key}>
                        <Label htmlFor={field.key}>
                            {field.label}{field.required && <Required> *</Required>}
                        </Label>

                        {field.type === 'password' ? (
                            <PasswordWrapper>
                                <Input
                                    id={field.key}
                                    type={visiblePasswords[field.key] ? 'text' : 'password'}
                                    placeholder={field.placeholder}
                                    value={formValues[field.key] ?? ''}
                                    onChange={e => handleChange(field.key, e.target.value)}
                                    style={{ paddingRight: 40 }}
                                />
                                <PasswordToggleBtn type="button" onClick={() => setVisiblePasswords(prev => ({ ...prev, [field.key]: !prev[field.key] }))}>
                                    {visiblePasswords[field.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                                </PasswordToggleBtn>
                            </PasswordWrapper>
                        ) : (
                            <Input
                                id={field.key}
                                type={field.type === 'url' ? 'url' : 'text'}
                                placeholder={field.placeholder}
                                value={formValues[field.key] ?? ''}
                                onChange={e => handleChange(field.key, e.target.value)}
                            />
                        )}

                        {field.key === 'args' && <Hint>JSON array of command arguments</Hint>}
                        {field.key === 'env' && <Hint>JSON object of environment variables</Hint>}
                    </FieldGroup>
                ))}

                <FormFooter>
                    <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
                    <SubmitBtn type="submit" disabled={isSubmitting}>
                        {isSubmitting && <SmallSpinner />}
                        {isEditMode ? 'Save Changes' : 'Add Server'}
                    </SubmitBtn>
                </FormFooter>
            </form>
        </Drawer>
    );
};

// Helper used by both the catalog and drawer title resolution.
const transportSlug = (id: string) =>
    id === 'StreamableHTTP' ? 'streamable_http' : id.toLowerCase();

// ── Main Page ─────────────────────────────────────────────────────────────────

const MCPPage: React.FC = () => {
    const { t } = useTranslation();
    const [apps, setApps] = useState<ApplicationConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [openId, setOpenId] = useState<string | null>(null);
    const [quickStartOpen, setQuickStartOpen] = useState(true);

    // Drawer
    const [modalTransportId, setModalTransportId] = useState<TransportType | null>(null);
    const [appToEdit, setAppToEdit] = useState<ApplicationConfig | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Delete
    const [appToDelete, setAppToDelete] = useState<ApplicationConfig | null>(null);

    // Tool discovery
    const [toolsMap, setToolsMap] = useState<Record<string, MCPTool[]>>({});
    const [loadingTools, setLoadingTools] = useState<Record<string, boolean>>({});
    const [toolErrors, setToolErrors] = useState<Record<string, string>>({});

    const handleDiscover = async (appId: string) => {
        setLoadingTools(prev => ({ ...prev, [appId]: true }));
        setToolErrors(prev => ({ ...prev, [appId]: '' }));
        try {
            const tools = await discoverTools(appId);
            setToolsMap(prev => ({ ...prev, [appId]: tools }));
        } catch {
            setToolErrors(prev => ({ ...prev, [appId]: 'Failed to discover tools' }));
        } finally {
            setLoadingTools(prev => ({ ...prev, [appId]: false }));
        }
    };

    const loadApps = useCallback(async () => {
        setIsLoading(true);
        try {
            const all = await fetchApplications();
            setApps(all.filter(a => a.category === 'MCP'));
        } catch (e) {
            console.error('Failed to load MCP servers', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadApps(); }, [loadApps]);

    const openCreate = (transportId: TransportType) => {
        setAppToEdit(null);
        setModalTransportId(transportId);
        setIsDrawerOpen(true);
    };
    const openEdit = (app: ApplicationConfig) => {
        setAppToEdit(app);
        // Reverse-map stored transport value back to the UI transport type
        const transportId = API_VALUE_TO_TRANSPORT[app.type] ?? 'StreamableHTTP';
        setModalTransportId(transportId);
        setIsDrawerOpen(true);
    };
    const closeModal = () => {
        setIsDrawerOpen(false);
        setModalTransportId(null);
        setAppToEdit(null);
    };

    const catalogItems: CapabilityItem[] = useMemo(
        () =>
            TRANSPORTS.map(transport => {
                const Icon = transport.icon;
                const slug = transportSlug(transport.id);
                return {
                    id: transport.id,
                    label: t(`admin.mcp.transport.${slug}.label`, transport.label),
                    description: t(`admin.mcp.transport.${slug}.description`, transport.description),
                    icon: <Icon size={20} />,
                };
            }),
        [t],
    );

    const handleDeleteConfirm = async () => {
        if (!appToDelete?.id) return;
        await deleteApplication(appToDelete.id);
        setAppToDelete(null);
        loadApps();
    };

    const filtered = apps.filter(a =>
        !searchTerm ||
        (a.name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.type ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const activeCount = apps.length;

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>{t('admin.mcp.title', 'MCP Servers')}</PageTitle>
                    <PageSubtitle>{t('admin.mcp.subtitle', 'Model Context Protocol integrations for your agents')}</PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <Search size={14} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                        <SearchInput
                            placeholder="Search servers..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </SearchBar>
                    <HeaderBtn href="https://docs.idunplatform.com/tool-governance/overview" target="_blank" rel="noopener noreferrer">
                        <BookOpen size={15} /> Docs
                    </HeaderBtn>
                </HeaderActions>
            </PageHeader>

            <CapabilityCatalog
                items={catalogItems}
                label={t('admin.mcp.available_label', 'AVAILABLE TRANSPORTS')}
                onSelect={id => openCreate(id as TransportType)}
            />

            <SectionDivider />

            <ConfiguredSection>
                <ConfiguredHeader>
                    <SectionLabel>
                        {t('admin.mcp.configured_label', 'YOUR MCP SERVERS')}
                        {apps.length > 0 && ` · ${apps.length} configured`}
                    </SectionLabel>
                    <PrimaryButton onClick={() => openCreate('StreamableHTTP')}>
                        + {t('admin.mcp.new_button', 'New MCP server')}
                    </PrimaryButton>
                </ConfiguredHeader>

                {isLoading ? (
                    <CenterBox>
                        <LoadingSpinner />
                        <p>Loading MCP servers…</p>
                    </CenterBox>
                ) : apps.length === 0 ? (
                    <EmptyHint>
                        {t('admin.mcp.empty_state', 'No MCP servers yet — pick a transport above to add one.')}
                    </EmptyHint>
                ) : (
                    <>
                        <StatsBar>
                            <StatChip><strong>{apps.length}</strong> Total servers</StatChip>
                            <StatChip><strong>{activeCount}</strong> Active</StatChip>
                        </StatsBar>

                        <QuickStart>
                            <QuickStartHeader onClick={() => setQuickStartOpen(o => !o)}>
                                <QuickStartTitle>
                                    Quick Start
                                    <QuickStartBadge>Guide</QuickStartBadge>
                                </QuickStartTitle>
                                <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>
                                    {quickStartOpen ? '\u25B2' : '\u25BC'}
                                </span>
                            </QuickStartHeader>
                            <QuickStartBody $open={quickStartOpen}>
                                <CodeGrid>
                                    <div>
                                        <CodeLabel>LangGraph</CodeLabel>
                                        <CodeBlock>
                                            <pre><PyHighlight code={LANGGRAPH_EXAMPLE} /></pre>
                                            <CodeCopyBtn onClick={() => navigator.clipboard.writeText(LANGGRAPH_EXAMPLE)}>
                                                <Copy size={11} /> Copy
                                            </CodeCopyBtn>
                                        </CodeBlock>
                                    </div>
                                    <div>
                                        <CodeLabel>Google ADK</CodeLabel>
                                        <CodeBlock>
                                            <pre><PyHighlight code={ADK_EXAMPLE} /></pre>
                                            <CodeCopyBtn onClick={() => navigator.clipboard.writeText(ADK_EXAMPLE)}>
                                                <Copy size={11} /> Copy
                                            </CodeCopyBtn>
                                        </CodeBlock>
                                    </div>
                                </CodeGrid>
                            </QuickStartBody>
                        </QuickStart>

                        <ServerList>
                            {filtered.map(app => {
                                const config = flattenConfig(app.config);
                                const configEntries = Object.entries(config);
                                const url = getServerUrl(config);
                                const transportLabel =
                                    config.transport === 'streamable_http' ? 'Streamable HTTP' :
                                    config.transport === 'sse' ? 'SSE' :
                                    config.transport === 'websocket' ? 'WebSocket' :
                                    config.transport === 'stdio' ? 'STDIO' :
                                    app.type;

                                return (
                                    <ServerCard key={app.id}>
                                        <ServerHeader>
                                            <ServerIcon><img src="/img/mcp.png" alt="MCP" /></ServerIcon>
                                            <ServerMeta>
                                                <ServerName>{app.name}</ServerName>
                                                <ServerSubtitle>{url || app.type}</ServerSubtitle>
                                            </ServerMeta>
                                        </ServerHeader>

                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            <TransportBadge>{transportLabel}</TransportBadge>
                                            {toolsMap[app.id] && toolsMap[app.id].length > 0 && (
                                                <ToolCountBadge>{toolsMap[app.id].length} tools</ToolCountBadge>
                                            )}
                                            <StatusBadge $active={true}>Active</StatusBadge>
                                        </div>

                                        {configEntries.length > 0 && (
                                            <>
                                                <Divider />
                                                <ConfigList>
                                                    {configEntries.slice(0, 4).map(([k, v]) => (
                                                        <ConfigRow key={k}>
                                                            <ConfigKey>{k.replace(/_/g, ' ')}</ConfigKey>
                                                            {isSecretKey(k) ? (
                                                                <SecretField value={v} />
                                                            ) : (
                                                                <ConfigValue title={v}>{v}</ConfigValue>
                                                            )}
                                                        </ConfigRow>
                                                    ))}
                                                </ConfigList>
                                            </>
                                        )}

                                        {!toolsMap[app.id] && (
                                            <>
                                                <DiscoverButton
                                                    onClick={() => handleDiscover(app.id)}
                                                    disabled={loadingTools[app.id]}
                                                >
                                                    {loadingTools[app.id] ? (
                                                        <><DiscoverSpinner /> Discovering…</>
                                                    ) : (
                                                        'Discover tools'
                                                    )}
                                                </DiscoverButton>
                                                {toolErrors[app.id] && (
                                                    <DiscoverError>{toolErrors[app.id]}</DiscoverError>
                                                )}
                                            </>
                                        )}

                                        {toolsMap[app.id] && toolsMap[app.id].length > 0 && (
                                            <>
                                                <Divider />
                                                <ToolList>
                                                    {toolsMap[app.id].map(tool => (
                                                        <ToolItem key={tool.name}>
                                                            <ToolName>{tool.name}</ToolName>
                                                            {tool.description && (
                                                                <ToolDescription>{tool.description}</ToolDescription>
                                                            )}
                                                        </ToolItem>
                                                    ))}
                                                </ToolList>
                                            </>
                                        )}

                                        {(app.agentCount ?? 0) > 0 && (
                                            <AgentCountBadge>
                                                Used by {app.agentCount} agent{app.agentCount !== 1 ? 's' : ''}
                                            </AgentCountBadge>
                                        )}

                                        <CardActions>
                                            <EditBtn onClick={() => openEdit(app)}>Edit</EditBtn>
                                            <DeleteBtn onClick={() => setAppToDelete(app)}>Remove</DeleteBtn>
                                        </CardActions>
                                    </ServerCard>
                                );
                            })}
                        </ServerList>
                    </>
                )}
            </ConfiguredSection>

            <TransportDrawer
                open={isDrawerOpen}
                transportId={modalTransportId}
                appToEdit={appToEdit}
                onClose={closeModal}
                onSaved={loadApps}
            />

            <DeleteConfirmModal
                isOpen={!!appToDelete}
                onClose={() => setAppToDelete(null)}
                onConfirm={handleDeleteConfirm}
                itemName={appToDelete?.name ?? ''}
                description={(appToDelete?.agentCount ?? 0) > 0
                    ? `This MCP server is used by ${appToDelete!.agentCount} agent${appToDelete!.agentCount !== 1 ? 's' : ''}. Remove it from those agents first.`
                    : undefined}
            />
        </PageWrapper>
    );
};

export default MCPPage;
