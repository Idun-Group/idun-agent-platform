import styled, { keyframes } from 'styled-components';

/* ── Animations ─────────────────────────────────────────────────────────────── */

export const fadeIn = keyframes`
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
`;

const spin = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
`;

/* ── Layout ─────────────────────────────────────────────────────────────────── */

export const PageWrapper = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 32px;
    gap: 24px;
    animation: ${fadeIn} 0.3s ease;
    overflow-y: auto;
    background: #0a0e17;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
    color: #e1e4e8;
`;

export const PageHeader = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
`;

export const TitleBlock = styled.div``;

export const PageTitle = styled.h1`
    font-size: 24px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0 0 4px;
    letter-spacing: -0.02em;
    font-family: 'IBM Plex Sans', sans-serif;
`;

export const PageSubtitle = styled.p`
    font-size: 13px;
    color: #6b7a8d;
    margin: 0;
`;

export const DocsLink = styled.a`
    color: #6b7a8d;
    text-decoration: none;
    transition: color 0.15s;
    &:hover { color: #5B9BD5; }
`;

export const HeaderActions = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

export const SearchBar = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 0 14px;
    height: 38px;
    color: #6b7a8d;
    transition: border-color 0.15s;
    &:focus-within { border-color: rgba(12, 92, 171, 0.5); }
`;

export const SearchInput = styled.input`
    background: transparent;
    border: none;
    outline: none;
    color: #e1e4e8;
    font-size: 14px;
    width: 200px;
    font-family: 'IBM Plex Sans', sans-serif;
    &::placeholder { color: #6b7a8d; }
`;

export const PrimaryBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 20px;
    height: 38px;
    background: #0C5CAB;
    border: none;
    border-radius: 10px;
    color: #ffffff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
    &:hover { opacity: 0.88; }
`;

/* ── States ──────────────────────────────────────────────────────────────────── */

export const CenterBox = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 80px;
`;

export const Spinner = styled.div`
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.06);
    border-top-color: #0C5CAB;
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

export const MutedText = styled.p`
    font-size: 14px;
    color: #6b7a8d;
    margin: 0;
`;

export const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
    padding: 100px 40px 80px;
    text-align: center;
    position: relative;

    &::before {
        content: '';
        position: absolute;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 400px;
        height: 400px;
        background: radial-gradient(circle, rgba(12, 92, 171, 0.06) 0%, transparent 70%);
        pointer-events: none;
    }
`;

export const EmptyIconWrap = styled.div`
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: rgba(12, 92, 171, 0.08);
    border: 1px solid rgba(12, 92, 171, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(12, 92, 171, 0.5);
    position: relative;
`;

export const EmptyTextBlock = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
`;

export const EmptyTitle = styled.p`
    font-size: 18px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0;
    letter-spacing: -0.02em;
`;

export const EmptyDesc = styled.p`
    font-size: 14px;
    color: #6b7a8d;
    margin: 0;
    line-height: 1.5;

    code {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.04);
        color: #8899a6;
    }
`;

export const EmptyCTA = styled.button`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 24px;
    height: 42px;
    background: rgba(12, 92, 171, 0.12);
    border: 1px solid rgba(12, 92, 171, 0.25);
    border-radius: 10px;
    color: #5B9BD5;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        background: rgba(12, 92, 171, 0.2);
        border-color: rgba(12, 92, 171, 0.4);
        color: #7CB9E8;
        box-shadow: 0 0 24px rgba(12, 92, 171, 0.12);
    }
`;

/* ── Group Cards ─────────────────────────────────────────────────────────────── */

export const GroupList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

export const GroupCard = styled.div`
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-left: 3px solid rgba(12, 92, 171, 0.3);
    border-radius: 16px;
    overflow: hidden;
    animation: ${fadeIn} 0.3s ease both;
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
    &:hover {
        border-color: rgba(12, 92, 171, 0.25);
        border-left-color: #0C5CAB;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
        transform: translateY(-1px);
    }
`;

export const GroupHeader = styled.button`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 16px 22px;
    background: transparent;
    border: none;
    color: #e1e4e8;
    cursor: pointer;
    font-family: 'IBM Plex Sans', sans-serif;
    text-align: left;
    transition: background 0.12s ease;
    &:hover { background: rgba(255, 255, 255, 0.04); }
`;

export const GroupLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

export const ChevronWrap = styled.span<{ $expanded: boolean }>`
    color: #6b7a8d;
    display: flex;
    transition: transform 0.2s ease, color 0.15s;
    transform: rotate(${p => p.$expanded ? '90deg' : '0deg'});
`;

export const GroupId = styled.span`
    font-size: 15px;
    font-weight: 600;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: -0.02em;
`;

export const VersionBadge = styled.span`
    font-size: 11px;
    font-weight: 500;
    font-family: 'IBM Plex Mono', monospace;
    padding: 2px 8px;
    border-radius: 6px;
    background: rgba(12, 92, 171, 0.1);
    color: #5B9BD5;
    border: 1px solid rgba(12, 92, 171, 0.15);
`;

export const VersionCount = styled.span`
    font-size: 11px;
    color: #6b7a8d;
`;

export const GroupRight = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

export const VarGroup = styled.div`
    display: flex;
    gap: 4px;
`;

export const VarPill = styled.span`
    font-size: 10px;
    font-family: 'IBM Plex Mono', monospace;
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
    color: #6b7a8d;
    border: 1px solid rgba(255, 255, 255, 0.06);
`;

export const AgentIndicator = styled.span`
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: rgba(52, 211, 153, 0.7);
    padding: 2px 8px;
    border-radius: 6px;
    background: rgba(52, 211, 153, 0.08);
    border: 1px solid rgba(52, 211, 153, 0.12);
`;

/* ── Expanded Body ───────────────────────────────────────────────────────────── */

export const ExpandedBody = styled.div`
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding: 20px 22px 22px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    animation: ${fadeIn} 0.2s ease-out;
`;

export const SectionLabel = styled.div`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b7a8d;
    margin-bottom: 10px;
`;

/* ── Usage ───────────────────────────────────────────────────────────────────── */

export const UsageSection = styled.div`
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding-bottom: 16px;
`;

export const UsageHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
`;

export const TooltipContainer = styled.div`
    position: relative;
    display: inline-flex;
    align-items: center;
    cursor: help;
`;

export const TooltipContent = styled.div`
    visibility: hidden;
    width: max-content;
    max-width: 300px;
    background-color: #141a26;
    color: #e1e4e8;
    text-align: left;
    border-radius: 6px;
    padding: 8px 12px;
    position: absolute;
    z-index: 100;
    bottom: 125%;
    left: -10px;
    opacity: 0;
    transition: opacity 0.2s;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.5;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.06);
    pointer-events: none;
    white-space: normal;

    &::after {
        content: "";
        position: absolute;
        top: 100%;
        left: 17px;
        border-width: 5px;
        border-style: solid;
        border-color: #141a26 transparent transparent transparent;
    }

    ${TooltipContainer}:hover & {
        visibility: visible;
        opacity: 1;
    }
`;

/* ── Assignment ──────────────────────────────────────────────────────────────── */

export const AssignmentSection = styled.div``;

export const SectionRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
`;

export const AssignBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    background: rgba(12, 92, 171, 0.08);
    border: 1px solid rgba(12, 92, 171, 0.18);
    border-radius: 8px;
    color: #5B9BD5;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    &:hover { background: rgba(12, 92, 171, 0.16); border-color: rgba(12, 92, 171, 0.3); }
`;

export const ChipRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`;

export const AgentChip = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    font-size: 13px;
    color: #8899a6;
    transition: border-color 0.15s;
    &:hover { border-color: rgba(255, 255, 255, 0.1); }
`;

export const ChipX = styled.button`
    background: none;
    border: none;
    color: #6b7a8d;
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    transition: color 0.15s;
    &:hover { color: #f87171; }
`;

export const EmptyAssign = styled.span`
    font-size: 13px;
    color: #6b7a8d;
`;

/* ── Version History ─────────────────────────────────────────────────────────── */

export const VersionSection = styled.div`
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding-top: 16px;
`;

export const VersionTable = styled.div``;

export const VersionRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    animation: ${fadeIn} 0.15s ease both;
    & + & { border-top: 1px solid rgba(255, 255, 255, 0.06); }
`;

export const VersionLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

export const VNum = styled.span<{ $active?: boolean }>`
    font-size: 12px;
    font-weight: 600;
    font-family: 'IBM Plex Mono', monospace;
    color: ${p => p.$active ? '#5B9BD5' : '#8899a6'};
    min-width: 28px;
`;

export const TagRow = styled.div`
    display: flex;
    gap: 4px;
`;

export const TagPill = styled.span<{ $latest?: boolean }>`
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    background: ${p => p.$latest ? 'rgba(52, 211, 153, 0.1)' : 'rgba(255, 255, 255, 0.04)'};
    color: ${p => p.$latest ? '#34d399' : '#6b7a8d'};
    border: 1px solid ${p => p.$latest ? 'rgba(52, 211, 153, 0.18)' : 'rgba(255, 255, 255, 0.06)'};
`;

export const VersionRight = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

export const VDate = styled.span`
    font-size: 11px;
    color: #6b7a8d;
`;

export const DeleteIcon = styled.button`
    display: flex;
    align-items: center;
    background: none;
    border: none;
    color: #6b7a8d;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.15s;
    &:hover { color: #f87171; background: rgba(248, 113, 113, 0.08); }
`;

export const VersionContent = styled.pre`
    font-size: 13px;
    color: #8899a6;
    font-family: 'IBM Plex Mono', monospace;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0 0 8px;
    max-height: 320px;
    overflow-y: auto;
    line-height: 1.6;
    background: rgba(255, 255, 255, 0.04);
    padding: 14px 16px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
`;

export const ViewToggle = styled.div`
    display: flex;
    gap: 2px;
    margin-bottom: 6px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 6px;
    padding: 2px;
    width: fit-content;
`;

export const ToggleBtn = styled.button<{ $active: boolean }>`
    padding: 3px 12px;
    font-size: 11px;
    font-weight: 500;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s;
    background: ${p => p.$active ? 'rgba(12, 92, 171, 0.15)' : 'transparent'};
    color: ${p => p.$active ? '#5B9BD5' : '#6b7a8d'};
    &:hover { color: ${p => p.$active ? '#5B9BD5' : '#8899a6'}; }
`;

export const MarkdownWrap = styled.div`
    font-size: 14px;
    color: rgba(225, 228, 232, 0.85);
    line-height: 1.7;
    margin: 0 0 8px;
    max-height: 320px;
    overflow-y: auto;
    background: rgba(255, 255, 255, 0.04);
    padding: 14px 16px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);

    h1, h2, h3, h4 { color: #e1e4e8; margin: 0.5em 0 0.3em; }
    h1 { font-size: 1.3em; }
    h2 { font-size: 1.15em; }
    h3 { font-size: 1.05em; }
    p { margin: 0.4em 0; }
    code {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 0.9em;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.04);
    }
    pre {
        background: rgba(255, 255, 255, 0.04);
        padding: 12px;
        border-radius: 8px;
        overflow-x: auto;
        code { padding: 0; background: none; }
    }
    ul, ol { padding-left: 1.4em; margin: 0.4em 0; }
    li { margin: 0.2em 0; }
    blockquote {
        border-left: 3px solid rgba(12, 92, 171, 0.3);
        padding-left: 12px;
        margin: 0.5em 0;
        color: #8899a6;
    }
    a { color: #5B9BD5; }
    hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.06); margin: 0.8em 0; }
`;

/* ── Picker Modal ────────────────────────────────────────────────────────────── */

export const ModalOverlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 1001;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
`;

export const PickerModal = styled.div`
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(12px);
    border-radius: 16px;
    width: 420px;
    max-width: 94vw;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.06);
    animation: ${fadeIn} 0.15s ease;
`;

export const PickerHeader = styled.div`
    padding: 22px 24px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

export const PickerTitle = styled.h3`
    font-size: 16px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0;
`;

export const CloseBtn = styled.button`
    background: rgba(255, 255, 255, 0.04);
    border: none;
    border-radius: 8px;
    width: 30px;
    height: 30px;
    color: #8899a6;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    &:hover { background: rgba(255, 255, 255, 0.08); color: #e1e4e8; }
`;

export const PickerBody = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 8px;
`;

export const PickerEmpty = styled.div`
    padding: 36px;
    text-align: center;
    color: #6b7a8d;
    font-size: 13px;
`;

export const PickerItem = styled.button`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-radius: 10px;
    color: #e1e4e8;
    cursor: pointer;
    font-family: 'IBM Plex Sans', sans-serif;
    text-align: left;
    transition: background 0.12s;
    &:hover { background: rgba(255, 255, 255, 0.04); }
`;

export const PickerName = styled.span`
    font-size: 14px;
    font-weight: 500;
`;

export const PickerMeta = styled.span`
    font-size: 11px;
    color: #6b7a8d;
    text-transform: uppercase;
    letter-spacing: 0.04em;
`;
