import { useState } from 'react';
import { Check, Plus, Eye } from 'lucide-react';
import type { ApplicationConfig } from '../../../../../types/application.types';
import type { ManagedSSO } from '../../../../../services/sso';
import type { ManagedIntegration } from '../../../../../services/integrations';
import {
    ResourceCardContainer,
    ResourceCardHeader,
    ResourceCardTitle,
    NotAssignedBadge,
    ConfigChip,
    SelectableCard,
    SelectableCardBody,
    SelectableCardName,
    SelectableCardType,
    SelectableCardDetail,
    CheckIndicator,
    CreateNewButton,
    ViewModeDetails,
    ViewDetailItem,
    ViewDetailHeader,
    ViewDetailName,
    ViewDetailBadge,
    ViewDetailMeta,
    QuickAddButton,
    ExpandedConfig,
    ExpandedConfigRow,
    ExpandedConfigKey,
    ExpandedConfigValue,
    ViewConfigButton,
    ManageButton,
} from './styled';

export interface ConfigEntry {
    key: string;
    value: string;
}

export interface AssignedResourceDetail {
    name: string;
    type: string;
    detail: string;
    badge?: string;
    linkTo?: string;
    configEntries?: ConfigEntry[];
}

export type ResourceItem =
    | { kind: 'app'; data: ApplicationConfig }
    | { kind: 'sso'; data: ManagedSSO }
    | { kind: 'integration'; data: ManagedIntegration };

function getItemDetails(item: ResourceItem): { name: string; type: string; detail: string } {
    if (item.kind === 'app') {
        const cfg = item.data.config || {};
        let detail = '';
        switch (item.data.type) {
            case 'Langfuse':
                detail = cfg.host || '';
                break;
            case 'Phoenix':
                detail = cfg.host || '';
                break;
            case 'LangSmith':
                detail = cfg.projectName || cfg.endpoint || '';
                break;
            case 'GoogleCloudLogging':
            case 'GoogleCloudTrace':
                detail = cfg.gcpProjectId || '';
                break;
            case 'PostgreSQL':
            case 'SQLite':
            case 'AdkDatabase':
                detail = cfg.connectionString ? `${cfg.connectionString.substring(0, 40)}...` : '';
                break;
            case 'AdkVertexAi':
                detail = cfg.project_id ? `${cfg.project_id} / ${cfg.location || ''}` : '';
                break;
            case 'MCPServer':
                detail = cfg.transport === 'stdio'
                    ? `stdio: ${cfg.command || ''}`
                    : `${cfg.transport || 'http'}: ${cfg.url || ''}`;
                break;
            default:
                detail = Object.values(cfg).filter(v => typeof v === 'string').join(', ').substring(0, 50);
        }
        return { name: item.data.name, type: item.data.type, detail };
    }
    if (item.kind === 'sso') {
        return {
            name: item.data.name,
            type: 'SSO',
            detail: item.data.sso?.issuer || '',
        };
    }
    return {
        name: item.data.name,
        type: item.data.integration?.provider || 'Integration',
        detail: '',
    };
}

const MAX_VISIBLE_DETAILS = 3;

interface ResourceCardProps {
    icon: React.ReactNode;
    title: string;
    items: ResourceItem[];
    selectedIds: string[];
    isEditing: boolean;
    multiSelect: boolean;
    onToggle: (id: string) => void;
    assignedNames: string[];
    assignedDetails?: AssignedResourceDetail[];
    onCreateNew?: () => void;
    onQuickAdd?: () => void;
    onManage?: () => void;
}

export default function ResourceCard({
    icon,
    title,
    items,
    selectedIds,
    isEditing,
    multiSelect,
    onToggle,
    assignedNames,
    assignedDetails,
    onCreateNew,
    onQuickAdd,
    onManage,
}: ResourceCardProps) {
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    const hasAssigned = assignedNames.length > 0;
    const hasViewBody = !isEditing && hasAssigned && assignedDetails && assignedDetails.length > 0;
    const hasEditBody = isEditing;
    const hasQuickAdd = !isEditing && !hasAssigned && onQuickAdd;
    const hasBody = hasViewBody || hasEditBody || hasQuickAdd;

    const toggleExpand = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedIndex(prev => prev === index ? null : index);
    };

    return (
        <ResourceCardContainer $configured={hasAssigned}>
            <ResourceCardHeader $hasBody={!!hasBody}>
                <ResourceCardTitle>
                    {icon}
                    {title}
                    {!isEditing && !hasAssigned && !onQuickAdd && (
                        <NotAssignedBadge>Not assigned</NotAssignedBadge>
                    )}
                </ResourceCardTitle>
                {!isEditing && hasAssigned && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {assignedNames.map((name, i) => (
                            <ConfigChip key={i}>{name}</ConfigChip>
                        ))}
                    </div>
                )}
            </ResourceCardHeader>

            {/* View mode: rich detail items */}
            {hasViewBody && (
                <ViewModeDetails>
                    {assignedDetails!.slice(0, MAX_VISIBLE_DETAILS).map((item, i) => {
                        const hasConfig = item.configEntries && item.configEntries.length > 0;
                        const isExpanded = expandedIndex === i;

                        return (
                            <ViewDetailItem key={i}>
                                <ViewDetailHeader>
                                    <ViewDetailName>{item.name}</ViewDetailName>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {item.badge && <ViewDetailBadge>{item.badge}</ViewDetailBadge>}
                                        {hasConfig && (
                                            <ViewConfigButton
                                                type="button"
                                                title="View configuration"
                                                $active={isExpanded}
                                                onClick={(e) => toggleExpand(i, e)}
                                            >
                                                <Eye size={14} />
                                            </ViewConfigButton>
                                        )}
                                    </div>
                                </ViewDetailHeader>

                                {isExpanded && item.configEntries && (
                                    <ExpandedConfig>
                                        {item.configEntries.map(entry => (
                                            <ExpandedConfigRow key={entry.key}>
                                                <ExpandedConfigKey>{entry.key}</ExpandedConfigKey>
                                                <ExpandedConfigValue>{entry.value}</ExpandedConfigValue>
                                            </ExpandedConfigRow>
                                        ))}
                                    </ExpandedConfig>
                                )}
                            </ViewDetailItem>
                        );
                    })}
                    {assignedDetails!.length > MAX_VISIBLE_DETAILS && onManage && (
                        <ManageButton type="button" onClick={onManage}>
                            and {assignedDetails!.length - MAX_VISIBLE_DETAILS} more — Manage all
                        </ManageButton>
                    )}
                    {onManage && assignedDetails!.length <= MAX_VISIBLE_DETAILS && (
                        <ManageButton type="button" onClick={onManage}>
                            Manage →
                        </ManageButton>
                    )}
                </ViewModeDetails>
            )}

            {/* View mode: quick-add button for unassigned resources */}
            {hasQuickAdd && (
                <QuickAddButton type="button" onClick={onQuickAdd}>
                    <Plus size={14} />
                    Add {title.toLowerCase()}
                </QuickAddButton>
            )}

            {/* Edit mode: selectable cards */}
            {isEditing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {items.length === 0 && !onCreateNew && (
                        <div style={{ color: '#6b7280', fontSize: '12px', fontStyle: 'italic' }}>
                            No configurations available
                        </div>
                    )}

                    {items.map(item => {
                        const id = item.data.id;
                        const isSelected = selectedIds.includes(id);
                        const { name, type, detail } = getItemDetails(item);

                        return (
                            <SelectableCard
                                key={id}
                                type="button"
                                $selected={isSelected}
                                onClick={() => onToggle(id)}
                            >
                                <CheckIndicator $checked={isSelected}>
                                    {isSelected && <Check size={12} color="white" />}
                                </CheckIndicator>
                                <SelectableCardBody>
                                    <SelectableCardName>{name}</SelectableCardName>
                                    <SelectableCardType>{type}{multiSelect ? '' : ' (single)'}</SelectableCardType>
                                    {detail && <SelectableCardDetail>{detail}</SelectableCardDetail>}
                                </SelectableCardBody>
                            </SelectableCard>
                        );
                    })}

                    {onCreateNew && (
                        <CreateNewButton type="button" onClick={onCreateNew}>
                            <Plus size={14} />
                            Create new {title.toLowerCase()}
                        </CreateNewButton>
                    )}
                </div>
            )}
        </ResourceCardContainer>
    );
}
