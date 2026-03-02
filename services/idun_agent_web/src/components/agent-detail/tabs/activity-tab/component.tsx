import styled from 'styled-components';
import { Activity, CheckCircle, AlertCircle } from 'lucide-react';
import { activityData } from '../../../../data/agent-mock-data';

interface ActivityTabProps {}

const ActivityTab = ({}: ActivityTabProps) => {
    return (
        <ActivitySection>
            <ActivityHeader>
                <Activity size={24} />
                <h2>Activité récente</h2>
            </ActivityHeader>

            <ActivityList>
                {activityData.map((activity) => (
                    <ActivityItem key={activity.id}>
                        <ActivityIcon $status={activity.status}>
                            {activity.status === 'success' ? (
                                <CheckCircle size={16} />
                            ) : (
                                <AlertCircle size={16} />
                            )}
                        </ActivityIcon>

                        <ActivityContent>
                            <ActivityTitle>{activity.title}</ActivityTitle>
                            <ActivityMeta>
                                <ActivityType>{activity.details}</ActivityType>
                                <ActivityDuration>
                                    {activity.duration}
                                </ActivityDuration>
                                <ActivityStatus $status={activity.status}>
                                    {activity.status}
                                </ActivityStatus>
                            </ActivityMeta>
                        </ActivityContent>

                        <ActivityTimestamp>
                            {activity.timestamp}
                        </ActivityTimestamp>
                    </ActivityItem>
                ))}
            </ActivityList>
        </ActivitySection>
    );
};

export default ActivityTab;

// Styled components pour l'onglet activité
const ActivitySection = styled.div`
    flex: 1;
    padding: 0 40px;
`;

const ActivityHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 32px;
    color: hsl(var(--foreground));

    h2 {
        font-size: 24px;
        font-weight: 600;
        margin: 0;
    }
`;

const ActivityList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const ActivityItem = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 0;
    border-bottom: 1px solid hsl(var(--border));

    &:last-child {
        border-bottom: none;
    }
`;

const ActivityIcon = styled.div<{ $status: string }>`
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    ${(props) => {
        switch (props.$status) {
            case 'success':
                return `
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
        `;
            case 'error':
                return `
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
        `;
            default:
                return `
          background: rgba(107, 114, 128, 0.2);
          color: #9ca3af;
        `;
        }
    }}
`;

const ActivityContent = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const ActivityTitle = styled.h3`
    font-size: 16px;
    font-weight: 500;
    margin: 0;
    color: hsl(var(--foreground));
`;

const ActivityMeta = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
`;

const ActivityType = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    padding: 2px 8px;
    background: hsl(var(--accent));
    border-radius: 4px;
`;

const ActivityDuration = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
`;

const ActivityStatus = styled.span<{ $status: string }>`
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;

    ${(props) => {
        switch (props.$status) {
            case 'success':
                return 'color: #34d399;';
            case 'error':
                return 'color: #f87171;';
            default:
                return 'color: #9ca3af;';
        }
    }}
`;

const ActivityTimestamp = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
`;
