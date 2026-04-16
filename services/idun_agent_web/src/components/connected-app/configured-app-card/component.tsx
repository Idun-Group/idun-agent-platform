import styled from 'styled-components';
import type { ApplicationConfig } from '../../../types/application.types';

interface ConfiguredAppCardProps {
    app: ApplicationConfig;
    onClick: () => void;
}

const ConfiguredAppCard = ({ app, onClick }: ConfiguredAppCardProps) => {
    return (
        <CardContainer onClick={onClick}>
            <Header>
                <AppIcon src={app.imageUrl} alt={app.name} />
                <AppInfo>
                    <AppName>{app.name}</AppName>
                    <AppType>{app.type}</AppType>
                </AppInfo>
            </Header>
            <MetaInfo>
                <MetaRow>
                    <MetaLabel>Owner:</MetaLabel>
                    <MetaValue>{app.owner}</MetaValue>
                </MetaRow>
                <MetaRow>
                    <MetaLabel>Created:</MetaLabel>
                    <MetaValue>{new Date(app.createdAt).toLocaleDateString()}</MetaValue>
                </MetaRow>
                <MetaRow>
                    <MetaLabel>Updated:</MetaLabel>
                    <MetaValue>{new Date(app.updatedAt).toLocaleDateString()}</MetaValue>
                </MetaRow>
            </MetaInfo>
            <StatusTag>{app.category}</StatusTag>
        </CardContainer>
    );
};

export default ConfiguredAppCard;

const CardContainer = styled.div`
    background: rgba(255, 255, 255, 0.02);
    box-shadow: 0 0 10px rgba(12, 92, 171, 0.38);
    border-radius: 8px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    cursor: pointer;
    position: relative;
    transition: transform 0.2s, background-color 0.2s;
    min-width: 280px;

    &:hover {
        transform: translateY(-2px);
        background: rgba(255, 255, 255, 0.04);
    }
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const AppIcon = styled.img`
    width: 40px;
    height: 40px;
    border-radius: 6px;
    object-fit: contain;
    background: #fff;
    padding: 2px;
`;

const AppInfo = styled.div`
    display: flex;
    flex-direction: column;
`;

const AppName = styled.h3`
    font-size: 16px;
    font-weight: 600;
    color: #e1e4e8;
    margin: 0;
`;

const AppType = styled.span`
    font-size: 12px;
    color: #8899a6;
`;

const MetaInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
    color: #8899a6;
`;

const MetaRow = styled.div`
    display: flex;
    justify-content: space-between;
`;

const MetaLabel = styled.span`
    color: #6b7a8d;
`;

const MetaValue = styled.span`
    color: #e1e4e8;
`;

const StatusTag = styled.div`
    position: absolute;
    top: 12px;
    right: 12px;
    background: rgba(12, 92, 171, 0.2);
    color: #0C5CAB;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
`;
