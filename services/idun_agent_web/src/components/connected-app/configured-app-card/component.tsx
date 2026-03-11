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
    background: var(--overlay-subtle);
    box-shadow: 0 0 10px rgba(140, 82, 255, 0.38);
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
        background: var(--overlay-light);
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
    color: hsl(var(--foreground));
    margin: 0;
`;

const AppType = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
`;

const MetaInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
`;

const MetaRow = styled.div`
    display: flex;
    justify-content: space-between;
`;

const MetaLabel = styled.span`
    color: hsl(var(--text-secondary));
`;

const MetaValue = styled.span`
    color: hsl(var(--foreground));
`;

const StatusTag = styled.div`
    position: absolute;
    top: 12px;
    right: 12px;
    background: rgba(140, 82, 255, 0.2);
    color: hsl(var(--primary));
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
`;
