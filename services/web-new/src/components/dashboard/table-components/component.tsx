import styled from 'styled-components';

// Styled Components
export const TableRow = styled.tr`
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    transition: background-color 0.2s ease;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;

    &:hover {
        background: rgba(12, 92, 171, 0.04);
    }
`;

export const TableCell = styled.td`
    padding: 14px 24px;
    color: #e8edf5;
    font-size: 13px;
    vertical-align: middle;
    white-space: nowrap;

    &:first-child { padding-left: 24px; }
    &:last-child { padding-right: 24px; }

    a {
        color: #60a5fa;
        text-decoration: none;
        transition: color 0.15s;

        &:hover {
            color: #93c5fd;
        }
    }
`;

export const ActionsContainer = styled.td`
    display: flex;
    justify-content: center;
    gap: 8px;
    white-space: nowrap;
`;
