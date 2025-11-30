import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Calendar, Filter, Download, RefreshCw, Clock } from 'lucide-react';

interface LogEntry {
    timestamp: string;
    level: string;
    component: string;
    operation: string;
    message: string;
    agent_id?: string;
    agent_name?: string;
    session_id?: string;
    user_query?: string;
    agent_response?: string;
    log_id: string;
}

interface ServerLogsTabProps {
    agentId?: string;
}

const ServerLogsTab: React.FC<ServerLogsTabProps> = ({ agentId }) => {
    // Hardcode agent ID for testing
    const testAgentId = "5799d1dc-85a2-4f0e-8104-87e5ef66e8b9";
    const actualAgentId = testAgentId || agentId;
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [logLevel, setLogLevel] = useState<string>('all');
    const [dateRange, setDateRange] = useState({
        start: '2025-11-30', // Fixed date where we know logs exist
        end: '2025-11-30'   // Same day
    });
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    const fetchLogs = useCallback(async () => {
        if (!actualAgentId) return;

        setLoading(true);
        setError(null);

        try {
            const startTime = new Date(dateRange.start + 'T00:00:00Z').toISOString();
            const endTime = new Date(dateRange.end + 'T23:59:59Z').toISOString();

            let query = `{component=~".+"}`;
            if (logLevel !== 'all') {
                query = `{component=~".+", level="${logLevel.toUpperCase()}"}`;
            }

            const params = new URLSearchParams({
                query: query,
                start: startTime,
                end: endTime,
                limit: '100'
            });

            const response = await fetch(`http://localhost:8000/api/v1/logs/query_range?${params}`);

            if (!response.ok) {
                throw new Error(`Loki query failed: ${response.status}`);
            }

            const data = await response.json();

            if (data.status !== 'success') {
                throw new Error('Loki query unsuccessful');
            }

            // Parse logs from Loki response
            const parsedLogs: LogEntry[] = [];

            if (data.data.result) {
                for (const stream of data.data.result) {
                    for (const [timestamp, logLine] of stream.values) {
                        try {
                            const logData = JSON.parse(logLine);
                            // Only include logs for the specific agent ID if provided
                            if (!actualAgentId || logData.agent_id === actualAgentId) {
                                parsedLogs.push({
                                    timestamp: new Date(parseInt(timestamp) / 1000000).toISOString(),
                                    level: logData.level || 'info',
                                    component: logData.component || 'unknown',
                                    operation: logData.operation || 'unknown',
                                    message: logData.event || logData.message || logLine,
                                    agent_id: logData.agent_id,
                                    agent_name: logData.agent_name,
                                    session_id: logData.session_id,
                                    user_query: logData.user_query,
                                    agent_response: logData.agent_response,
                                    log_id: logData.log_id
                                });
                            }
                        } catch (e) {
                            // If log line is not JSON, treat as plain text
                            parsedLogs.push({
                                timestamp: new Date(parseInt(timestamp) / 1000000).toISOString(),
                                level: 'info',
                                component: 'unknown',
                                operation: 'unknown',
                                message: logLine,
                                log_id: timestamp
                            });
                        }
                    }
                }
            }

            // Sort by timestamp (newest first)
            parsedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            setLogs(parsedLogs);
            setLastRefresh(new Date());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch logs');
        } finally {
            setLoading(false);
        }
    }, [actualAgentId, dateRange, logLevel]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(fetchLogs, 5000); // Refresh every 5 seconds
        return () => clearInterval(interval);
    }, [autoRefresh, fetchLogs]);

    const handleExport = () => {
        const csvContent = [
            'Timestamp,Level,Component,Operation,Message,Session ID,User Query,Agent Response',
            ...logs.map(log => [
                log.timestamp,
                log.level,
                log.component,
                log.operation,
                `"${log.message.replace(/"/g, '""')}"`,
                log.session_id || '',
                `"${(log.user_query || '').replace(/"/g, '""')}"`,
                `"${(log.agent_response || '').replace(/"/g, '""')}"`,
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agent-logs-${actualAgentId}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const formatTimestamp = (timestamp: string) => {
        return new Date(timestamp).toLocaleString('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
    };

    return (
        <ServerLogsSection>
            <ServerLogsHeader>
                <ServerLogsTitle>
                    <Clock size={20} />
                    Server Logs
                    {actualAgentId && <AgentIdBadge>Agent: {actualAgentId.slice(0, 8)}...</AgentIdBadge>}
                </ServerLogsTitle>
                <ServerLogsActions>
                    <FilterContainer>
                        <FilterGroup>
                            <FilterLabel>
                                <Calendar size={16} />
                                Date Range
                            </FilterLabel>
                            <DateInputGroup>
                                <DateInput
                                    type="date"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                />
                                <DateSeparator>to</DateSeparator>
                                <DateInput
                                    type="date"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                />
                            </DateInputGroup>
                        </FilterGroup>

                        <FilterGroup>
                            <FilterLabel>
                                <Filter size={16} />
                                Level
                            </FilterLabel>
                            <LevelSelect
                                value={logLevel}
                                onChange={(e) => setLogLevel(e.target.value)}
                            >
                                <option value="all">All Levels</option>
                                <option value="debug">Debug</option>
                                <option value="info">Info</option>
                                <option value="warning">Warning</option>
                                <option value="error">Error</option>
                            </LevelSelect>
                        </FilterGroup>
                    </FilterContainer>

                    <ActionButtonGroup>
                        <RefreshButton
                            onClick={fetchLogs}
                            disabled={loading}
                            $isRefreshing={loading}
                        >
                            <RefreshCw size={16} />
                            Refresh
                        </RefreshButton>

                        <AutoRefreshToggle
                            $active={autoRefresh}
                            onClick={() => setAutoRefresh(!autoRefresh)}
                        >
                            Auto Refresh
                        </AutoRefreshToggle>

                        <ExportButton onClick={handleExport} disabled={logs.length === 0}>
                            <Download size={16} />
                            Export
                        </ExportButton>
                    </ActionButtonGroup>
                </ServerLogsActions>
            </ServerLogsHeader>

            {error && (
                <ErrorBanner>
                    <strong>Error:</strong> {error}
                </ErrorBanner>
            )}

            <LogsMetadata>
                <MetadataItem>
                    <strong>{logs.length}</strong> logs found
                </MetadataItem>
                <MetadataItem>
                    Last updated: {lastRefresh.toLocaleTimeString('fr-FR')}
                </MetadataItem>
            </LogsMetadata>

            <ServerLogsContainer>
                {loading && logs.length === 0 ? (
                    <LoadingState>
                        <RefreshCw size={24} />
                        Loading logs...
                    </LoadingState>
                ) : logs.length === 0 ? (
                    <EmptyState>
                        <Clock size={48} />
                        <h3>No logs found</h3>
                        <p>No server logs found for the selected time range and filters.</p>
                    </EmptyState>
                ) : (
                    logs.map((log) => (
                        <LogEntryCard key={log.log_id} $level={log.level}>
                            <LogEntryHeader>
                                <LogTimestamp>{formatTimestamp(log.timestamp)}</LogTimestamp>
                                <LogLevel $level={log.level}>{log.level.toUpperCase()}</LogLevel>
                                <LogComponent>{log.component}</LogComponent>
                                <LogOperation>{log.operation}</LogOperation>
                            </LogEntryHeader>
                            <LogMessage>{log.message}</LogMessage>

                            {(log.user_query || log.agent_response || log.session_id) && (
                                <LogDetails>
                                    {log.session_id && (
                                        <LogDetail>
                                            <DetailLabel>Session:</DetailLabel>
                                            <DetailValue>{log.session_id}</DetailValue>
                                        </LogDetail>
                                    )}
                                    {log.user_query && (
                                        <LogDetail>
                                            <DetailLabel>Query:</DetailLabel>
                                            <DetailValue>{log.user_query}</DetailValue>
                                        </LogDetail>
                                    )}
                                    {log.agent_response && (
                                        <LogDetail>
                                            <DetailLabel>Response:</DetailLabel>
                                            <DetailValue>{log.agent_response}</DetailValue>
                                        </LogDetail>
                                    )}
                                </LogDetails>
                            )}
                        </LogEntryCard>
                    ))
                )}
            </ServerLogsContainer>
        </ServerLogsSection>
    );
};

export default ServerLogsTab;

// Styled Components
const ServerLogsSection = styled.div`
    flex: 1;
    padding: 40px;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--color-background-primary, #0f1016);
`;

const ServerLogsHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--color-border-primary, #2a3f5f);
    gap: 20px;
`;

const ServerLogsTitle = styled.h2`
    font-size: 20px;
    font-weight: 600;
    margin: 0;
    color: var(--color-text-primary, #ffffff);
    display: flex;
    align-items: center;
    gap: 12px;
`;

const AgentIdBadge = styled.span`
    background: rgba(140, 82, 255, 0.15);
    color: var(--color-primary, #8c52ff);
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid rgba(140, 82, 255, 0.3);
`;

const ServerLogsActions = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: flex-end;
`;

const FilterContainer = styled.div`
    display: flex;
    gap: 20px;
    align-items: flex-end;
`;

const FilterGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const FilterLabel = styled.label`
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-secondary, #8892b0);
    display: flex;
    align-items: center;
    gap: 6px;
`;

const DateInputGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const DateInput = styled.input`
    padding: 8px 12px;
    background: var(--color-background-secondary, #1a1a2e);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 6px;
    color: var(--color-text-primary, #ffffff);
    font-size: 14px;

    &:focus {
        outline: none;
        border-color: var(--color-primary, #8c52ff);
        box-shadow: 0 0 0 2px rgba(140, 82, 255, 0.2);
    }
`;

const DateSeparator = styled.span`
    color: var(--color-text-secondary, #8892b0);
    font-size: 14px;
`;

const LevelSelect = styled.select`
    padding: 8px 12px;
    background: var(--color-background-secondary, #1a1a2e);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 6px;
    color: var(--color-text-primary, #ffffff);
    font-size: 14px;
    min-width: 120px;

    &:focus {
        outline: none;
        border-color: var(--color-primary, #8c52ff);
        box-shadow: 0 0 0 2px rgba(140, 82, 255, 0.2);
    }
`;

const ActionButtonGroup = styled.div`
    display: flex;
    gap: 12px;
`;

const RefreshButton = styled.button<{ $isRefreshing: boolean }>`
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

    ${props => props.$isRefreshing && `
        svg {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `}

    &:hover:not(:disabled) {
        background: var(--color-background-tertiary, #2a3f5f);
        color: var(--color-text-primary, #ffffff);
        border-color: var(--color-primary, #8c52ff);
    }

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;

const AutoRefreshToggle = styled.button<{ $active: boolean }>`
    padding: 8px 16px;
    background: ${props => props.$active ? 'var(--color-primary, #8c52ff)' : 'var(--color-background-secondary, #1a1a2e)'};
    border: 1px solid ${props => props.$active ? 'var(--color-primary, #8c52ff)' : 'var(--color-border-primary, #2a3f5f)'};
    border-radius: 6px;
    color: ${props => props.$active ? '#ffffff' : 'var(--color-text-secondary, #8892b0)'};
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: ${props => props.$active ? '600' : '400'};

    &:hover {
        background: ${props => props.$active ? 'var(--color-primary, #8c52ff)' : 'var(--color-background-tertiary, #2a3f5f)'};
        color: #ffffff;
    }
`;

const ExportButton = styled.button`
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

    &:hover:not(:disabled) {
        background: var(--color-background-tertiary, #2a3f5f);
        color: var(--color-text-primary, #ffffff);
        border-color: var(--color-primary, #8c52ff);
    }

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;

const ErrorBanner = styled.div`
    margin-bottom: 16px;
    padding: 12px 16px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    color: #f87171;
    font-size: 14px;
`;

const LogsMetadata = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding: 12px 16px;
    background: var(--color-background-secondary, #1a1a2e);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 8px;
    font-size: 14px;
`;

const MetadataItem = styled.span`
    color: var(--color-text-secondary, #8892b0);
`;

const ServerLogsContainer = styled.div`
    flex: 1;
    background: var(--color-background-primary, #0f1016);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 8px;
    overflow-y: auto;
    max-height: 100%;
    min-height: 400px;
`;

const LoadingState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    gap: 16px;
    color: var(--color-text-secondary, #8892b0);

    svg {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    gap: 16px;
    color: var(--color-text-secondary, #8892b0);

    h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
    }

    p {
        margin: 0;
        font-size: 14px;
        text-align: center;
    }
`;

const LogEntryCard = styled.div<{ $level: string }>`
    border-left: 4px solid ${(props) => {
        switch (props.$level.toLowerCase()) {
            case 'error': return '#ef4444';
            case 'warning': return '#f59e0b';
            case 'info': return '#10b981';
            case 'debug': return '#60a5fa';
            default: return '#8892b0';
        }
    }};
    padding: 16px 20px;
    margin: 0;
    background: var(--color-background-primary, #0f1016);
    border-bottom: 1px solid var(--color-border-primary, #2a3f5f);
    transition: background-color 0.2s ease;

    &:hover {
        background: rgba(255, 255, 255, 0.02);
    }

    &:last-child {
        border-bottom: none;
    }
`;

const LogEntryHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 8px;
    flex-wrap: wrap;
`;

const LogTimestamp = styled.span`
    color: #6b7280;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 13px;
    min-width: 180px;
`;

const LogLevel = styled.span<{ $level: string }>`
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    min-width: 60px;
    text-align: center;

    background: ${(props) => {
        switch (props.$level.toLowerCase()) {
            case 'error': return 'rgba(239, 68, 68, 0.2)';
            case 'warning': return 'rgba(245, 158, 11, 0.2)';
            case 'info': return 'rgba(16, 185, 129, 0.2)';
            case 'debug': return 'rgba(96, 165, 250, 0.2)';
            default: return 'rgba(136, 146, 176, 0.2)';
        }
    }};

    color: ${(props) => {
        switch (props.$level.toLowerCase()) {
            case 'error': return '#f87171';
            case 'warning': return '#fbbf24';
            case 'info': return '#34d399';
            case 'debug': return '#93c5fd';
            default: return '#8892b0';
        }
    }};
`;

const LogComponent = styled.span`
    background: rgba(140, 82, 255, 0.15);
    color: var(--color-primary, #8c52ff);
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
`;

const LogOperation = styled.span`
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text-secondary, #8892b0);
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
`;

const LogMessage = styled.div`
    color: var(--color-text-primary, #e5e7eb);
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 14px;
    line-height: 1.5;
    margin-bottom: 8px;
    word-break: break-word;
`;

const LogDetails = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
`;

const LogDetail = styled.div`
    display: flex;
    gap: 8px;
    align-items: flex-start;
`;

const DetailLabel = styled.span`
    color: var(--color-text-secondary, #8892b0);
    font-size: 12px;
    font-weight: 600;
    min-width: 70px;
    text-transform: uppercase;
`;

const DetailValue = styled.span`
    color: var(--color-text-primary, #e5e7eb);
    font-size: 13px;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    flex: 1;
    word-break: break-word;
`;