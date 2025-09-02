import styled from 'styled-components';

// Styled Components
export const TableRow = styled.tr`
    border-bottom: 1px solid var(--color-border-primary);
    transition: all var(--transition-default);

    &:hover {
        background: var(--color-background-tertiary);
    }
`;

export const TableCell = styled.td`
    padding: 16px 12px;
    color: var(--color-text-primary);
    font-size: 14px;
    vertical-align: middle;

    &:first-child {
        padding-left: 20px;
    }

    &:last-child {
        padding-right: 20px;
    }
`;

export const ActionsContainer = styled.td`
    display: flex;
    justify-content: center;
    gap: 4px;
`;
