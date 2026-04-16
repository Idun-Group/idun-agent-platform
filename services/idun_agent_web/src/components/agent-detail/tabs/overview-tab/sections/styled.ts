import styled from 'styled-components';

export const SectionCard = styled.div`
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 24px;
    backdrop-filter: blur(12px);
`;

export const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
`;

export const CollapsibleHeader = styled.button<{ $collapsed?: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    background: none;
    border: none;
    padding: 0 0 ${p => p.$collapsed ? '0' : '16px'} 0;
    margin-bottom: ${p => p.$collapsed ? '0' : '20px'};
    border-bottom: 1px solid ${p => p.$collapsed ? 'transparent' : 'rgba(255, 255, 255, 0.06)'};
    color: inherit;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    transition: all 0.2s ease;

    &:hover {
        opacity: 0.85;
    }
`;

export const CollapseChevron = styled.div<{ $collapsed?: boolean }>`
    margin-left: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7a8d;
    transition: transform 0.2s ease;
    transform: rotate(${p => p.$collapsed ? '-90deg' : '0deg'});
`;

export const SectionTitle = styled.h3`
    font-size: 16px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0;
    font-family: 'IBM Plex Sans', sans-serif;
`;

export const SectionIcon = styled.div<{ $color?: string }>`
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${p => {
        switch (p.$color) {
            case 'purple': return 'rgba(12, 92, 171, 0.1)';
            case 'blue': return 'rgba(12, 92, 171, 0.1)';
            case 'green': return 'rgba(16, 185, 129, 0.1)';
            case 'amber': return 'rgba(245, 158, 11, 0.1)';
            default: return 'rgba(12, 92, 171, 0.1)';
        }
    }};
    color: ${p => {
        switch (p.$color) {
            case 'purple': return '#4a9ede';
            case 'blue': return '#4a9ede';
            case 'green': return '#34d399';
            case 'amber': return '#fbbf24';
            default: return '#4a9ede';
        }
    }};
`;

export const DetailRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);

    &:last-child {
        border-bottom: none;
    }
`;

export const DetailLabel = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: #8899a6;
`;

export const DetailValue = styled.span`
    font-size: 13px;
    font-weight: 500;
    color: #e1e4e8;
    text-align: right;
    max-width: 60%;
    word-break: break-all;
`;

export const Badge = styled.span<{ $variant?: 'active' | 'draft' | 'error' | 'default' }>`
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;

    ${p => {
        switch (p.$variant) {
            case 'active':
                return 'background: rgba(16, 185, 129, 0.1); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.2);';
            case 'error':
                return 'background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2);';
            case 'draft':
            default:
                return `background: rgba(107, 114, 128, 0.1); color: #8899a6; border: 1px solid rgba(107, 114, 128, 0.2);`;
        }
    }}
`;

export const EditableInput = styled.input`
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 6px 10px;
    color: #e1e4e8;
    font-size: 13px;
    width: 100%;
    max-width: 300px;
    text-align: right;
    transition: border-color 0.2s;
    font-family: 'IBM Plex Sans', sans-serif;

    &:focus {
        outline: none;
        border-color: #0C5CAB;
    }
`;

export const EditableTextarea = styled.textarea`
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 8px 10px;
    color: #e1e4e8;
    font-size: 13px;
    width: 100%;
    max-width: 300px;
    text-align: left;
    resize: vertical;
    min-height: 60px;
    transition: border-color 0.2s;
    font-family: 'IBM Plex Sans', sans-serif;

    &:focus {
        outline: none;
        border-color: #0C5CAB;
    }
`;

export const ResourceGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
`;

export const ResourceCardContainer = styled.div<{ $configured?: boolean }>`
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid ${p => p.$configured ? 'rgba(12, 92, 171, 0.15)' : 'rgba(255, 255, 255, 0.06)'};
    border-radius: 10px;
    padding: 16px;
    transition: border-color 0.2s;
`;

export const ResourceCardHeader = styled.div<{ $hasBody?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: ${p => p.$hasBody !== false ? '12px' : '0'};
`;

export const ResourceCardTitle = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: #e1e4e8;
`;

export const NotAssignedBadge = styled.span`
    font-size: 11px;
    color: #8899a6;
    font-weight: 500;
    font-style: italic;
`;

export const ConfigChip = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    background: rgba(12, 92, 171, 0.1);
    color: #4a9ede;
    border: 1px solid rgba(12, 92, 171, 0.15);
`;

export const SelectableCard = styled.button<{ $selected?: boolean }>`
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid ${p => p.$selected ? 'rgba(12, 92, 171, 0.4)' : 'rgba(255, 255, 255, 0.06)'};
    background: ${p => p.$selected ? 'rgba(12, 92, 171, 0.08)' : 'rgba(255, 255, 255, 0.02)'};
    color: #e1e4e8;
    cursor: pointer;
    text-align: left;
    width: 100%;
    font-size: 13px;
    transition: all 0.15s;

    &:hover {
        border-color: rgba(12, 92, 171, 0.3);
        background: rgba(12, 92, 171, 0.05);
    }
`;

export const SelectableCardBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
`;

export const SelectableCardName = styled.span`
    font-weight: 600;
    font-size: 13px;
    color: #e1e4e8;
`;

export const SelectableCardType = styled.span`
    font-size: 11px;
    color: #8899a6;
`;

export const SelectableCardDetail = styled.span`
    font-size: 11px;
    color: #6b7280;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

export const CreateNewButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px dashed rgba(12, 92, 171, 0.3);
    background: transparent;
    color: #4a9ede;
    cursor: pointer;
    width: 100%;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.15s;

    &:hover {
        border-color: rgba(12, 92, 171, 0.5);
        background: rgba(12, 92, 171, 0.04);
    }
`;

export const ActionBar = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 0 0;
    margin-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
`;

export const ActionButton = styled.button<{ $primary?: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'IBM Plex Sans', sans-serif;

    ${p => p.$primary
        ? `
            background: #0C5CAB;
            color: #ffffff;
            border: none;
            &:hover { background: #0a4e94; }
            &:disabled { opacity: 0.5; cursor: not-allowed; }
        `
        : `
            background: transparent;
            color: #8899a6;
            border: 1px solid rgba(255, 255, 255, 0.08);
            &:hover { color: #e1e4e8; border-color: rgba(255, 255, 255, 0.15); }
        `
    }
`;

export const CheckIndicator = styled.div<{ $checked?: boolean }>`
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 1.5px solid ${p => p.$checked ? '#0C5CAB' : 'rgba(255, 255, 255, 0.15)'};
    background: ${p => p.$checked ? '#0C5CAB' : 'transparent'};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s;
`;

export const TwoColumnGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: start;

    @media (max-width: 900px) {
        grid-template-columns: 1fr;
    }
`;

export const ColumnStack = styled.div`
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

/* -- View-mode detail components -- */

export const ViewModeDetails = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

export const ViewDetailItem = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
`;

export const ViewDetailHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`;

export const ViewDetailName = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: #e1e4e8;
`;

export const ViewDetailBadge = styled.span`
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(12, 92, 171, 0.1);
    color: #4a9ede;
    border: 1px solid rgba(12, 92, 171, 0.15);
    white-space: nowrap;
`;

export const ViewDetailMeta = styled.span`
    font-size: 11px;
    color: #8899a6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

export const ViewConfigButton = styled.button<{ $active?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid ${p => p.$active ? 'rgba(12, 92, 171, 0.4)' : 'rgba(255, 255, 255, 0.08)'};
    background: ${p => p.$active ? 'rgba(12, 92, 171, 0.15)' : 'transparent'};
    color: ${p => p.$active ? '#4a9ede' : '#8899a6'};
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;

    &:hover {
        border-color: rgba(12, 92, 171, 0.4);
        background: rgba(12, 92, 171, 0.1);
        color: #4a9ede;
    }
`;

export const ManageButton = styled.button`
    font-size: 11px;
    color: #4a9ede;
    font-weight: 500;
    align-self: flex-start;
    margin-top: 4px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: color 0.15s;

    &:hover {
        color: #7ab8eb;
        text-decoration: underline;
    }
`;

export const QuickAddButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px dashed rgba(12, 92, 171, 0.3);
    background: transparent;
    color: #4a9ede;
    cursor: pointer;
    width: 100%;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.15s;

    &:hover {
        border-color: rgba(12, 92, 171, 0.5);
        background: rgba(12, 92, 171, 0.04);
    }
`;

/* -- Expandable config view -- */

export const ExpandedConfig = styled.div`
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 6px;
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.03);
`;

export const ExpandedConfigRow = styled.div`
    display: flex;
    gap: 10px;
    font-size: 11px;
    line-height: 1.5;
`;

export const ExpandedConfigKey = styled.span`
    color: #8899a6;
    flex-shrink: 0;
    min-width: 80px;
    font-weight: 500;
`;

export const ExpandedConfigValue = styled.span`
    color: #6b7280;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
`;
