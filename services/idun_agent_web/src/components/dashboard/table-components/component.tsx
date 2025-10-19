import styled from 'styled-components';

// Styled Components
export const TableRow = styled.tr`
    border-bottom: 1px solid hsl(var(--border));
    transition: background-color 0.2s ease;

    &:hover {
        background: hsl(var(--accent));
    }
`;

export const TableCell = styled.td`
    padding: 14px 24px;
    color: hsl(var(--foreground));
    font-size: 13px;
    vertical-align: middle;
    white-space: nowrap;

    &:first-child { padding-left: 24px; }
    &:last-child { padding-right: 24px; }
`;

export const ActionsContainer = styled.td`
    display: flex;
    justify-content: center;
    gap: 8px;
    white-space: nowrap;
`;
