import styled, { keyframes } from 'styled-components';

const slideInRight = keyframes`
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
`;

const fadeIn = keyframes`
    from { opacity: 0; }
    to { opacity: 1; }
`;

export const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 1001;
    background: var(--overlay-backdrop);
    display: flex;
    justify-content: flex-end;
    animation: ${fadeIn} 0.15s ease;
`;

export const Panel = styled.div`
    background: hsl(var(--card));
    width: 480px;
    max-width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: -25px 0 60px rgba(0, 0, 0, 0.5);
    border-left: 1px solid var(--border-light);
    animation: ${slideInRight} 0.2s ease;
`;

export const Header = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
`;

export const Title = styled.h2`
    font-size: 16px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
`;

export const CloseButton = styled.button`
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    color: hsl(var(--muted-foreground));
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background: var(--overlay-light);
        color: hsl(var(--foreground));
    }
`;

export const Body = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 22px;
`;
