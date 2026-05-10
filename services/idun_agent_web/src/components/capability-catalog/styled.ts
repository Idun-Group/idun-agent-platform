import styled from 'styled-components';

export const Wrapper = styled.section`
    display: flex;
    flex-direction: column;
    gap: 18px;
`;

export const HeaderRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
`;

export const Label = styled.div`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: hsl(var(--muted-foreground));
`;

export const SearchWrap = styled.label`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: hsl(var(--card));
    min-width: 220px;
`;

export const SearchInput = styled.input`
    border: none;
    background: transparent;
    color: hsl(var(--foreground));
    font-size: 13px;
    flex: 1;
    outline: none;

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

export const GroupBlock = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

export const GroupHeader = styled.div<{ $allDimmed?: boolean }>`
    font-size: 12px;
    font-weight: 600;
    color: hsl(var(--foreground));
    opacity: ${p => (p.$allDimmed ? 0.5 : 1)};
    margin-top: 4px;
`;

export const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;

    @media (max-width: 1100px) {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    @media (max-width: 800px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    @media (max-width: 520px) {
        grid-template-columns: 1fr;
    }
`;

export const Card = styled.div<{ $disabled?: boolean }>`
    background: hsl(var(--card));
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    cursor: ${p => (p.$disabled ? 'not-allowed' : 'pointer')};
    opacity: ${p => (p.$disabled ? 0.4 : 1)};
    transition: transform 0.18s ease, box-shadow 0.18s ease;
    position: relative;

    &:hover {
        transform: ${p => (p.$disabled ? 'none' : 'translateY(-2px)')};
        box-shadow: ${p => (p.$disabled ? 'none' : '0 8px 22px rgba(0, 0, 0, 0.08)')};
    }

    &:focus-visible {
        outline: 2px solid hsl(var(--primary));
        outline-offset: 2px;
    }
`;

export const CardTopRow = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

export const IconBox = styled.div`
    width: 36px;
    height: 36px;
    border-radius: 9px;
    background: var(--overlay-light);
    color: hsl(var(--foreground));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

export const CardTitle = styled.div`
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--foreground));
`;

export const CardDescription = styled.div`
    font-size: 11px;
    line-height: 1.4;
    color: hsl(var(--muted-foreground));
`;

export const SoonPill = styled.div`
    position: absolute;
    top: 10px;
    right: 10px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--overlay-light);
    color: hsl(var(--muted-foreground));
`;
