import styled from 'styled-components';

type ToggleButtonProps = {
    isOn: boolean;
    onToggle: () => void;
};

const ToggleButton = ({ isOn, onToggle }: ToggleButtonProps) => {
    return (
        <Container $isOn={isOn} onClick={onToggle}>
            <Toggle $isOn={isOn} />
        </Container>
    );
};
export default ToggleButton;

const Container = styled.div<{ $isOn: boolean }>`
    width: 60px;
    height: 30px;
    border: none;
    border-radius: 15px;
    background-color: ${({ $isOn: isOn }) => (isOn ? '#4caf50' : '#616161')};
    color: white;
    cursor: pointer;
    display: flex;
`;

const Toggle = styled.div<{ $isOn: boolean }>`
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background-color: white;
    transition: transform 0.2s;
    transform: ${({ $isOn: isOn }) => (isOn ? 'translateX(30px)' : 'translateX(0)')};
`;
