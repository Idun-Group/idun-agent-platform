import { Check, Plus } from 'lucide-react';
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
} from './styled';

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

interface ResourceCardProps {
    icon: React.ReactNode;
    title: string;
    items: ResourceItem[];
    selectedIds: string[];
    isEditing: boolean;
    multiSelect: boolean;
    onToggle: (id: string) => void;
    assignedNames: string[];
    onCreateNew?: () => void;
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
    onCreateNew,
}: ResourceCardProps) {
    const hasAssigned = assignedNames.length > 0;

    return (
        <ResourceCardContainer $configured={hasAssigned}>
            <ResourceCardHeader>
                <ResourceCardTitle>
                    {icon}
                    {title}
                    {!isEditing && !hasAssigned && (
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
