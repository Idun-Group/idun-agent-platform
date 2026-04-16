import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { BookOpen, GitPullRequest, Search } from 'lucide-react';
import { fetchIntegrations, deleteIntegration } from '../../services/integrations';
import type { ManagedIntegration } from '../../services/integrations';
import CreateIntegrationModal from '../../components/applications/create-integration-modal/component';
import DeleteConfirmModal from '../../components/applications/delete-confirm-modal/component';
import type { IntegrationProvider } from '../../services/integrations';
import { useTranslation } from 'react-i18next';

// ── Provider metadata ────────────────────────────────────────────────────────

interface ProviderMeta {
    label: string;
    color: string;
    comingSoon?: boolean;
}

const PROVIDERS: Record<string, ProviderMeta> = {
    WHATSAPP: { label: 'WhatsApp', color: '#25D366' },
    DISCORD: { label: 'Discord', color: '#5865F2' },
    SLACK: { label: 'Slack', color: '#E01E5A' },
    TEAMS: { label: 'Microsoft Teams', color: '#5059C9', comingSoon: true },
    TELEGRAM: { label: 'Telegram', color: '#26A5E4', comingSoon: true },
    LINE: { label: 'LINE', color: '#06C755', comingSoon: true },
    NOTION: { label: 'Notion', color: '#FFFFFF', comingSoon: true },
    GOOGLE_CHAT: { label: 'Google Chat', color: '#1A73E8' },
};

const WhatsAppIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);

const SlackIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" />
    </svg>
);

const DiscordIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
);

const TeamsIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.625 8.127q-.55 0-1.025-.205-.475-.205-.832-.563-.358-.357-.563-.832Q18 6.053 18 5.502q0-.54.205-1.02t.563-.837q.357-.358.832-.563.474-.205 1.025-.205.54 0 1.02.205t.837.563q.358.357.563.837.205.48.205 1.02 0 .55-.205 1.025-.205.475-.563.832-.357.358-.837.563-.48.205-1.02.205zm0-3.75q-.469 0-.797.328-.328.328-.328.797 0 .469.328.797.328.328.797.328.469 0 .797-.328.328-.328.328-.797 0-.469-.328-.797-.328-.328-.797-.328zM24 10.002v5.578q0 .774-.293 1.46-.293.685-.803 1.194-.51.51-1.195.803-.686.293-1.459.293-.445 0-.908-.105-.463-.106-.85-.329-.293.95-.855 1.729-.563.78-1.319 1.336-.756.557-1.67.861-.914.305-1.898.305-1.148 0-2.162-.398-1.014-.399-1.805-1.102-.79-.703-1.312-1.664t-.674-2.086h-5.8q-.411 0-.704-.293T0 16.881V6.873q0-.41.293-.703t.703-.293h8.59q-.34-.715-.34-1.5 0-.727.275-1.365.276-.639.75-1.114.475-.474 1.114-.75.638-.275 1.365-.275t1.365.275q.639.276 1.114.75.474.475.75 1.114.275.638.275 1.365t-.275 1.365q-.276.639-.75 1.113-.475.475-1.114.75-.638.276-1.365.276-.188 0-.375-.024-.188-.023-.375-.058v1.078h10.875q.469 0 .797.328.328.328.328.797zM12.75 2.373q-.41 0-.78.158-.368.158-.638.434-.27.275-.428.639-.158.363-.158.773 0 .41.158.78.159.368.428.638.27.27.639.428.369.158.779.158.41 0 .773-.158.364-.159.64-.428.274-.27.433-.639.158-.369.158-.779 0-.41-.158-.773-.159-.364-.434-.64-.275-.275-.639-.433-.363-.158-.773-.158zM6.937 9.814h2.25V7.94H2.814v1.875h2.25v6h1.875zm10.313 7.313v-6.75H12v6.504q0 .41-.293.703t-.703.293H8.309q.152.809.556 1.5.405.691.985 1.19.58.497 1.318.779.738.281 1.582.281.926 0 1.746-.352.82-.351 1.436-.966.615-.616.966-1.43.352-.815.352-1.752zm5.25-1.547v-5.203h-3.75v6.855q.305.305.691.452.387.146.809.146.469 0 .879-.176.41-.175.715-.48.304-.305.48-.715t.176-.879Z" />
    </svg>
);

const TelegramIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
);

const LineIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386a.63.63 0 0 1-.63-.629V8.108c0-.345.281-.63.63-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016a.63.63 0 0 1-.63.629.626.626 0 0 1-.51-.262l-2.397-3.274v2.906a.63.63 0 0 1-.629.63.63.63 0 0 1-.63-.63V8.108a.63.63 0 0 1 .63-.63c.2 0 .381.095.51.259l2.397 3.274V8.108a.63.63 0 0 1 1.259 0v4.771zm-5.741 0a.63.63 0 0 1-1.26 0V8.108a.63.63 0 0 1 1.26 0v4.771zm-2.451.63H4.932a.63.63 0 0 1-.63-.63V8.108c0-.345.282-.63.63-.63.349 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
);

const NotionIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
    </svg>
);

const GoogleChatIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M1.637 0C.733 0 0 .733 0 1.637v16.126c0 .904.733 1.637 1.637 1.637h5.726V24l4.86-4.6h10.14c.904 0 1.637-.733 1.637-1.637V1.637C24 .733 23.267 0 22.363 0zm5.726 5.727h9.274v2.727H7.363zm0 4.364h6.545v2.727H7.363z" />
    </svg>
);

const PROVIDER_ICONS: Record<string, React.FC> = {
    WHATSAPP: WhatsAppIcon,
    SLACK: SlackIcon,
    DISCORD: DiscordIcon,
    TEAMS: TeamsIcon,
    TELEGRAM: TelegramIcon,
    LINE: LineIcon,
    NOTION: NotionIcon,
    GOOGLE_CHAT: GoogleChatIcon,
};

const PROVIDER_GROUPS = ['Messaging', 'Coming Soon'];

// ── Animations ────────────────────────────────────────────────────────────────

const fadeIn = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); }`;
const spin = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;

// ── Layout ────────────────────────────────────────────────────────────────────

const PageWrapper = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 32px;
    gap: 24px;
    animation: ${fadeIn} 0.3s ease;
    overflow: hidden;
    font-family: 'IBM Plex Sans', sans-serif;
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
    color: #e1e4e8;
    margin: 0 0 6px;
`;

const PageSubtitle = styled.p`
    font-size: 14px;
    color: #8899a6;
    margin: 0;
`;

const HeaderActions = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const DocsButton = styled.a`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    height: 38px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    color: #8899a6;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s;
    white-space: nowrap;

    &:hover {
        color: #e1e4e8;
        border-color: rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.08);
    }
`;

const SearchBar = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 0 14px;
    height: 38px;
`;

const SearchInput = styled.input`
    background: transparent;
    border: none;
    outline: none;
    color: #e1e4e8;
    font-size: 14px;
    width: 160px;
    &::placeholder { color: #8899a6; }
`;

// ── Two-column layout ─────────────────────────────────────────────────────────

const MainLayout = styled.div`
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 0;
`;

// ── Left column: provider picker ──────────────────────────────────────────────

const ProviderColumn = styled.div`
    width: 260px;
    flex-shrink: 0;
    border-right: 1px solid rgba(255, 255, 255, 0.04);
    padding-right: 24px;
    overflow-y: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
`;

const GroupLabel = styled.p`
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #4a5568;
    margin: 20px 0 8px 10px;

    &:first-child { margin-top: 0; }
`;

const ProviderBtn = styled.button<{ $disabled?: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: ${p => p.$disabled ? '#8899a6' : '#6b7a8d'};
    font-size: 13px;
    font-weight: 400;
    cursor: ${p => p.$disabled ? 'default' : 'pointer'};
    opacity: ${p => p.$disabled ? 0.5 : 1};
    transition: all 0.15s ease;
    text-align: left;
    margin-bottom: 2px;

    &:hover {
        background: ${p => p.$disabled ? 'transparent' : 'rgba(255, 255, 255, 0.04)'};
        color: ${p => p.$disabled ? '#8899a6' : '#e1e4e8'};
    }
`;

const ProviderIconBox = styled.div<{ $color: string }>`
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: ${p => `${p.$color}15`};
    color: ${p => p.$color};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const ProviderIconBoxSmall = styled.div<{ $color: string }>`
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: ${p => `${p.$color}15`};
    color: ${p => p.$color};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    svg {
        width: 15px;
        height: 15px;
    }
`;

const AddIndicator = styled.span`
    margin-left: auto;
    font-size: 16px;
    color: #8899a6;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;

    ${ProviderBtn}:hover & {
        opacity: 1;
    }
`;

const ComingSoonBadge = styled.span`
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
    color: #8899a6;
    margin-left: auto;
    flex-shrink: 0;
`;

const RequestBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px dashed rgba(255, 255, 255, 0.06);
    background: transparent;
    color: #8899a6;
    font-size: 13px;
    font-weight: 400;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    margin-top: 16px;

    &:hover {
        border-color: rgba(12, 92, 171, 0.4);
        color: #e1e4e8;
        background: rgba(12, 92, 171, 0.04);
    }
`;

const RequestIcon = styled.span`
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #0C5CAB;
`;

// ── Right column: configs + empty state ───────────────────────────────────────

const ContentColumn = styled.div`
    flex: 1;
    padding-left: 28px;
    overflow-y: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px 20px;
    gap: 16px;
`;

const EmptyTitle = styled.h3`
    font-size: 16px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0;
`;

const EmptyDescription = styled.p`
    font-size: 13px;
    line-height: 1.7;
    color: #6b7a8d;
    margin: 0;
    max-width: 420px;
`;

const EmptyChips = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
`;

const Chip = styled.span<{ $color: string }>`
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 6px;
    background: ${p => `${p.$color}14`};
    color: ${p => p.$color};
    border: 1px solid ${p => `${p.$color}20`};
    letter-spacing: 0.02em;
`;

// ── Config cards ──────────────────────────────────────────────────────────────

const CardsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
`;

const Card = styled.div<{ $borderColor?: string }>`
    background: rgba(20, 26, 38, 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid ${p => p.$borderColor ? `${p.$borderColor}20` : 'rgba(255, 255, 255, 0.04)'};
    border-radius: 14px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: border-color 0.2s, box-shadow 0.2s;

    &:hover {
        border-color: ${p => p.$borderColor ? `${p.$borderColor}50` : 'rgba(12, 92, 171, 0.3)'};
        box-shadow: 0 4px 24px rgba(12, 92, 171, 0.08);
    }
`;

const CardHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const ProviderInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const ProviderName = styled.div``;

const ProviderTitle = styled.p`
    font-size: 14px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0;
`;

const ProviderType = styled.p`
    font-size: 11px;
    color: #8899a6;
    margin: 2px 0 0;
`;

const StatusBadge = styled.span<{ $active: boolean }>`
    font-size: 10px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 20px;
    background: ${p => p.$active ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.04)'};
    color: ${p => p.$active ? '#34d399' : '#888'};
    border: 1px solid ${p => p.$active ? 'rgba(52, 211, 153, 0.3)' : 'transparent'};
`;

const Divider = styled.hr`
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    margin: 0;
`;

const ConfigList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const ConfigRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`;

const ConfigKey = styled.span`
    font-size: 12px;
    color: #8899a6;
    flex-shrink: 0;
`;

const ConfigValue = styled.span`
    font-size: 12px;
    color: #6b7a8d;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
`;

const AgentCountBadge = styled.span`
    font-size: 11px;
    color: #8899a6;
`;

const CardActions = styled.div`
    display: flex;
    gap: 8px;
    margin-top: auto;
`;

const EditBtn = styled.button`
    flex: 1;
    padding: 7px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    color: #e1e4e8;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    &:hover { background: rgba(255, 255, 255, 0.08); }
`;

const DeleteBtn = styled.button`
    flex: 1;
    padding: 7px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 8px;
    color: #f87171;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    &:hover { background: rgba(248, 113, 113, 0.18); }
`;

// ── Loading ───────────────────────────────────────────────────────────────────

const CenterBox = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 80px;
    color: #8899a6;
    text-align: center;
`;

const LoadingSpinner = styled.div`
    width: 36px;
    height: 36px;
    border: 3px solid rgba(255, 255, 255, 0.06);
    border-top-color: #0C5CAB;
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const maskToken = (token: string): string => {
    if (token.length <= 8) return '••••••••';
    return token.slice(0, 4) + '••••' + token.slice(-4);
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const IntegrationsPage: React.FC = () => {
    const { t } = useTranslation();
    const [configs, setConfigs] = useState<ManagedIntegration[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalProvider, setModalProvider] = useState<IntegrationProvider>('WHATSAPP');
    const [configToEdit, setConfigToEdit] = useState<ManagedIntegration | null>(null);
    const [configToDelete, setConfigToDelete] = useState<ManagedIntegration | null>(null);

    const loadConfigs = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await fetchIntegrations();
            setConfigs(data);
        } catch (e) {
            console.error('Failed to load integrations', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadConfigs(); }, [loadConfigs]);

    const openCreate = (provider: IntegrationProvider) => { setConfigToEdit(null); setModalProvider(provider); setIsModalOpen(true); };
    const openEdit = (config: ManagedIntegration) => { setConfigToEdit(config); setModalProvider(config.integration.provider); setIsModalOpen(true); };
    const closeModal = () => { setIsModalOpen(false); setConfigToEdit(null); };

    const handleDeleteConfirm = async () => {
        if (!configToDelete?.id) return;
        await deleteIntegration(configToDelete.id);
        setConfigToDelete(null);
        loadConfigs();
    };

    const availableProviders = Object.entries(PROVIDERS).filter(([, meta]) => !meta.comingSoon);
    const comingSoonProviders = Object.entries(PROVIDERS).filter(([, meta]) => meta.comingSoon);

    return (
        <PageWrapper>
            <PageHeader>
                <TitleBlock>
                    <PageTitle>{t('integrations.title', 'Integrations')}</PageTitle>
                    <PageSubtitle>{t('integrations.subtitle', 'Connect external messaging platforms to your agents')}</PageSubtitle>
                </TitleBlock>
                <HeaderActions>
                    <SearchBar>
                        <Search size={14} style={{ color: '#8899a6', flexShrink: 0 }} />
                        <SearchInput placeholder="Search integrations..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </SearchBar>
                    <DocsButton href="https://docs.idunplatform.com/integrations/discord" target="_blank" rel="noopener noreferrer">
                        <BookOpen size={15} /> Docs
                    </DocsButton>
                </HeaderActions>
            </PageHeader>

            <MainLayout>
                {/* ── Left: Provider picker ──────────────────────── */}
                <ProviderColumn>
                    {PROVIDER_GROUPS.map(group => {
                        const providers = group === 'Messaging' ? availableProviders : comingSoonProviders;
                        if (providers.length === 0) return null;
                        return (
                            <React.Fragment key={group}>
                                <GroupLabel>{group}</GroupLabel>
                                {providers.map(([key, meta]) => {
                                    const Icon = PROVIDER_ICONS[key];
                                    const isDisabled = !!meta.comingSoon;
                                    return (
                                        <ProviderBtn
                                            key={key}
                                            type="button"
                                            $disabled={isDisabled}
                                            onClick={() => { if (!isDisabled) openCreate(key as IntegrationProvider); }}
                                        >
                                            <ProviderIconBoxSmall $color={meta.color}>
                                                {Icon ? <Icon /> : <span>+</span>}
                                            </ProviderIconBoxSmall>
                                            {meta.label}
                                            {isDisabled ? <ComingSoonBadge>Soon</ComingSoonBadge> : <AddIndicator>+</AddIndicator>}
                                        </ProviderBtn>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}

                    <RequestBtn
                        type="button"
                        onClick={() => window.open('https://github.com/Idun-Group/idun-agent-platform/issues/new?labels=enhancement&template=feature_request.md&title=%5BIntegrations%5D+New+integration+request', '_blank')}
                    >
                        <RequestIcon><GitPullRequest size={15} /></RequestIcon>
                        Request an integration
                    </RequestBtn>
                </ProviderColumn>

                {/* ── Right: Configured integrations ────────────────── */}
                <ContentColumn>
                    {isLoading ? (
                        <CenterBox>
                            <LoadingSpinner />
                            <p>{t('integrations.loading', 'Loading integrations...')}</p>
                        </CenterBox>
                    ) : configs.length === 0 ? (
                        <EmptyState>
                            <EmptyTitle>{t('integrations.emptyTitle', 'Connect a messaging platform to get started')}</EmptyTitle>
                            <EmptyDescription>
                                {t('integrations.emptyDescription', 'Bridge your AI agents to messaging platforms. Idun handles webhooks, message routing, and bidirectional communication so your agents can interact with users on any channel.')}
                            </EmptyDescription>
                            <EmptyChips>
                                {availableProviders.map(([key, meta]) => (
                                    <Chip key={key} $color={meta.color}>{meta.label}</Chip>
                                ))}
                            </EmptyChips>
                        </EmptyState>
                    ) : (
                        <CardsGrid>
                            {configs.filter(c => {
                                if (!searchTerm) return true;
                                const term = searchTerm.toLowerCase();
                                const providerLabel = PROVIDERS[c.integration.provider]?.label ?? c.integration.provider;
                                return (c.name?.toLowerCase().includes(term) || providerLabel.toLowerCase().includes(term));
                            }).map(config => {
                                const provider = config.integration.provider;
                                const meta = PROVIDERS[provider] ?? { label: provider, color: '#0C5CAB' };
                                const Icon = PROVIDER_ICONS[provider];

                                return (
                                    <Card key={config.id} $borderColor={meta.color}>
                                        <CardHeader>
                                            <ProviderInfo>
                                                <ProviderIconBox $color={meta.color}>
                                                    {Icon ? <Icon /> : <span>+</span>}
                                                </ProviderIconBox>
                                                <ProviderName>
                                                    <ProviderTitle>{config.name}</ProviderTitle>
                                                    <ProviderType>{meta.label}</ProviderType>
                                                </ProviderName>
                                            </ProviderInfo>
                                            <StatusBadge $active={config.integration.enabled}>
                                                {config.integration.enabled ? 'Active' : 'Disabled'}
                                            </StatusBadge>
                                        </CardHeader>

                                        <Divider />
                                        <ConfigList>
                                            {provider === 'WHATSAPP' && 'phone_number_id' in config.integration.config && (
                                                <>
                                                    <ConfigRow>
                                                        <ConfigKey>Phone Number ID</ConfigKey>
                                                        <ConfigValue>{config.integration.config.phone_number_id}</ConfigValue>
                                                    </ConfigRow>
                                                    <ConfigRow>
                                                        <ConfigKey>Access Token</ConfigKey>
                                                        <ConfigValue title={config.integration.config.access_token}>
                                                            {maskToken(config.integration.config.access_token)}
                                                        </ConfigValue>
                                                    </ConfigRow>
                                                    <ConfigRow>
                                                        <ConfigKey>API Version</ConfigKey>
                                                        <ConfigValue>{config.integration.config.api_version ?? 'v21.0'}</ConfigValue>
                                                    </ConfigRow>
                                                </>
                                            )}
                                            {provider === 'DISCORD' && 'application_id' in config.integration.config && (
                                                <>
                                                    <ConfigRow>
                                                        <ConfigKey>Application ID</ConfigKey>
                                                        <ConfigValue>{config.integration.config.application_id}</ConfigValue>
                                                    </ConfigRow>
                                                    <ConfigRow>
                                                        <ConfigKey>Bot Token</ConfigKey>
                                                        <ConfigValue title={config.integration.config.bot_token}>
                                                            {maskToken(config.integration.config.bot_token)}
                                                        </ConfigValue>
                                                    </ConfigRow>
                                                    <ConfigRow>
                                                        <ConfigKey>Guild ID</ConfigKey>
                                                        <ConfigValue>{config.integration.config.guild_id ?? 'All servers'}</ConfigValue>
                                                    </ConfigRow>
                                                </>
                                            )}
                                            {provider === 'SLACK' && 'signing_secret' in config.integration.config && (
                                                <>
                                                    <ConfigRow>
                                                        <ConfigKey>Bot Token</ConfigKey>
                                                        <ConfigValue title={config.integration.config.bot_token}>
                                                            {maskToken(config.integration.config.bot_token)}
                                                        </ConfigValue>
                                                    </ConfigRow>
                                                    <ConfigRow>
                                                        <ConfigKey>Signing Secret</ConfigKey>
                                                        <ConfigValue title={config.integration.config.signing_secret}>
                                                            {maskToken(config.integration.config.signing_secret)}
                                                        </ConfigValue>
                                                    </ConfigRow>
                                                </>
                                            )}
                                            {provider === 'GOOGLE_CHAT' && 'project_number' in config.integration.config && (
                                                <>
                                                    <ConfigRow>
                                                        <ConfigKey>Project Number</ConfigKey>
                                                        <ConfigValue>{config.integration.config.project_number}</ConfigValue>
                                                    </ConfigRow>
                                                    <ConfigRow>
                                                        <ConfigKey>Credentials</ConfigKey>
                                                        <ConfigValue>
                                                            {maskToken(config.integration.config.service_account_credentials_json)}
                                                        </ConfigValue>
                                                    </ConfigRow>
                                                </>
                                            )}
                                        </ConfigList>

                                        {(config.agentCount ?? 0) > 0 && (
                                            <AgentCountBadge>
                                                Used by {config.agentCount} agent{config.agentCount !== 1 ? 's' : ''}
                                            </AgentCountBadge>
                                        )}

                                        <CardActions>
                                            <EditBtn onClick={() => openEdit(config)}>Edit</EditBtn>
                                            <DeleteBtn onClick={() => setConfigToDelete(config)}>Remove</DeleteBtn>
                                        </CardActions>
                                    </Card>
                                );
                            })}
                        </CardsGrid>
                    )}
                </ContentColumn>
            </MainLayout>

            <CreateIntegrationModal
                isOpen={isModalOpen}
                onClose={closeModal}
                onCreated={loadConfigs}
                appToEdit={configToEdit}
                provider={modalProvider}
                providerIcon={PROVIDER_ICONS[modalProvider] ? React.createElement(PROVIDER_ICONS[modalProvider]) : undefined}
            />
            <DeleteConfirmModal
                isOpen={!!configToDelete}
                onClose={() => setConfigToDelete(null)}
                onConfirm={handleDeleteConfirm}
                itemName={configToDelete?.name ?? ''}
                description={(configToDelete?.agentCount ?? 0) > 0
                    ? `This integration is used by ${configToDelete!.agentCount} agent${configToDelete!.agentCount !== 1 ? 's' : ''}. Remove it from those agents first.`
                    : undefined}
            />
        </PageWrapper>
    );
};

export default IntegrationsPage;
