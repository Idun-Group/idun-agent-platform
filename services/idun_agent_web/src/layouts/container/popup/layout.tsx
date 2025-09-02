import type { ReactNode } from 'react';
import styled from 'styled-components';

const Popup = ({ children }: { children: ReactNode }) => {
    return (
        <Background>
            <PopupContainer>{children}</PopupContainer>
        </Background>
    );
};
export default Popup;

const Background = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
`;

const PopupContainer = styled.div``;
