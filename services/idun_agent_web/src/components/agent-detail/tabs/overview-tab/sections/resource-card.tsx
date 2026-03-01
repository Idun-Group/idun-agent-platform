import { Check } from 'lucide-react';
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
    SelectableCardName,
    SelectableCardType,
    CheckIndicator,
} from './styled';

type ResourceItem =
    | { kind: 'app'; data: ApplicationConfig }
    | { kind: 'sso'; data: ManagedSSO }
    | { kind: 'integration'; data: ManagedIntegration };

interface ResourceCardProps {
    icon: React.ReactNode;
    title: string;
    items: ResourceItem[];
    selectedIds: string[];
    isEditing: boolean;
    multiSelect: boolean;
    onToggle: (id: string) => void;
    /** Names/labels of currently assigned configs (view mode) */
    assignedNames: string[];
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
}: ResourceCardProps) {
    const hasAssigned = assignedNames.length > 0;

    return (
        <ResourceCardContainer $configured={hasAssigned}>
            <ResourceCardHeader>
                <ResourceCardTitle>
                    {icon}
                    {title}
                </ResourceCardTitle>
                {!isEditing && !hasAssigned && (
                    <NotAssignedBadge>Not assigned</NotAssignedBadge>
                )}
            </ResourceCardHeader>

            {!isEditing && hasAssigned && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {assignedNames.map((name, i) => (
                        <ConfigChip key={i}>{name}</ConfigChip>
                    ))}
                </div>
            )}

            {isEditing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                    {items.length === 0 ? (
                        <div style={{ color: '#6b7280', fontSize: '12px', fontStyle: 'italic' }}>
                            No configurations available
                        </div>
                    ) : (
                        items.map(item => {
                            const id = item.data.id;
                            const isSelected = selectedIds.includes(id);
                            const name = item.kind === 'app'
                                ? item.data.name
                                : item.kind === 'sso'
                                    ? item.data.name
                                    : item.data.name;
                            const type = item.kind === 'app'
                                ? item.data.type
                                : item.kind === 'sso'
                                    ? 'SSO'
                                    : item.data.integration.provider;

                            return (
                                <SelectableCard
                                    key={id}
                                    type="button"
                                    $selected={isSelected}
                                    onClick={() => {
                                        if (!multiSelect && !isSelected) {
                                            // Single select: deselect others first via parent
                                        }
                                        onToggle(id);
                                    }}
                                >
                                    <CheckIndicator $checked={isSelected}>
                                        {isSelected && <Check size={12} color="white" />}
                                    </CheckIndicator>
                                    <SelectableCardName>{name}</SelectableCardName>
                                    <SelectableCardType>{type}</SelectableCardType>
                                </SelectableCard>
                            );
                        })
                    )}
                </div>
            )}
        </ResourceCardContainer>
    );
}
