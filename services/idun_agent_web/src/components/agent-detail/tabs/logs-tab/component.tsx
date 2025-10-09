import styled from 'styled-components';
import { logsData } from '../../../../data/agent-mock-data';

interface LogsTabProps {}

const LogsTab = ({}: LogsTabProps) => {
    return (
        <LogsSection>
            <LogsHeader>
                <LogsTitle>▶ Journaux de l'agent</LogsTitle>
                <LogsActions>
                    <LogsButton>⬇ Exporter</LogsButton>
                    <LogsButton>🔍 View in LangFuse</LogsButton>
                </LogsActions>
            </LogsHeader>
            <LogsContainer>
                {logsData.map((log) => (
                    <LogEntry key={log.id} $level={log.level}>
                        <LogTimestamp>[{log.timestamp}]</LogTimestamp>
                        <LogLevel $level={log.level}>{log.level}</LogLevel>
                        <LogMessage>{log.message}</LogMessage>
                    </LogEntry>
                ))}
            </LogsContainer>
        </LogsSection>
    );
};

export default LogsTab;

const LogsSection = styled.div`
    flex: 1;
    padding: 40px;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
`;

const LogsHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--color-border-primary, #2a3f5f);
`;

const LogsTitle = styled.h2`
    font-size: 20px;
    font-weight: 600;
    margin: 0;
    color: var(--color-text-primary, #ffffff);
    display: flex;
    align-items: center;
    gap: 8px;
`;

const LogsActions = styled.div`
    display: flex;
    gap: 12px;
`;

const LogsButton = styled.button`
    padding: 8px 16px;
    background: var(--color-background-secondary, #1a1a2e);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 6px;
    color: var(--color-text-secondary, #8892b0);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;

    &:hover {
        background: var(--color-background-tertiary, #2a3f5f);
        color: var(--color-text-primary, #ffffff);
        border-color: var(--color-primary, #8c52ff);
    }
`;

const LogsContainer = styled.div`
    flex: 1;
    background: #0a0e1a;
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 8px;
    padding: 16px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.4;
    overflow-y: auto;
    max-height: 100%;
`;

const LogEntry = styled.div<{ $level: string }>`
    display: flex;
    margin-bottom: 4px;
    padding: 2px 0;

    &:hover {
        background: rgba(255, 255, 255, 0.02);
    }
`;

const LogTimestamp = styled.span`
    color: #6b7280;
    margin-right: 8px;
    flex-shrink: 0;
    width: 180px;
`;

const LogLevel = styled.span<{ $level: string }>`
    margin-right: 8px;
    flex-shrink: 0;
    width: 60px;
    font-weight: 600;

    ${(props) => {
        switch (props.$level) {
            case 'INFO':
                return 'color: #10b981;';
            case 'WARN':
                return 'color: #f59e0b;';
            case 'ERROR':
                return 'color: #ef4444;';
            case 'DEBUG':
                return 'color: #60a5fa;';
            default:
                return 'color: #8892b0;';
        }
    }}
`;

const LogMessage = styled.span`
    color: #e5e7eb;
    flex: 1;
    word-break: break-word;
`;
