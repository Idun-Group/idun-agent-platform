import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import type { MarketplaceApp } from '../../../types/application.types';

type AppCardProps = {
    app: MarketplaceApp;
};

const AppCard = ({ app }: AppCardProps) => {
    const { t } = useTranslation();
    return (
        <Container>
            <Tag>{app.framework || app.category}</Tag>
            <AppImage src={app.imageUrl} alt={app.name} />
            <Title>{app.name}</Title>
            <By>
                {t('connected-app.marketplace.by', 'By')}: {app.by}
            </By>
            <Description>{app.description}</Description>
        </Container>
    );
};

export default AppCard;

const Container = styled.div`
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--overlay-subtle);
    box-shadow: 0 0 10px rgba(140, 82, 255, 0.38);
    border-radius: 8px;
    padding: 16px;
    height: 100%;
    min-height: 200px;
`;

const AppImage = styled.img`
    width: 64px;
    height: 64px;
    border-radius: 8px;
    object-fit: contain;
    margin-bottom: 16px;
`;

const Title = styled.h3`
    font-size: 1.25rem;
    font-weight: bold;
    margin: 0 0 8px 0;
    color: hsl(var(--foreground));
`;

const Description = styled.p`
    margin: 8px 0;
    color: hsl(var(--muted-foreground));
    font-size: 0.875rem;
    line-height: 1.5;
    flex: 1;
`;

const By = styled.p`
    margin: 0;
    font-size: 0.75rem;
    color: hsl(var(--text-tertiary));
`;

const Tag = styled.span`
    position: absolute;
    top: 12px;
    right: 12px;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
`;
