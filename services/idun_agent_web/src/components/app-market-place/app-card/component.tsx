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
            <Tag>{app.category}</Tag>
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
    background: #5050501c;
    box-shadow: 0 0 10px #8c52ff61;
    border-radius: 8px;
    padding: 16px;
    height: 100%;
    min-height: 250px;
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
    color: #fff;
`;

const Description = styled.p`
    margin: 8px 0;
    color: #a0a0a0;
    font-size: 0.875rem;
    line-height: 1.5;
    flex: 1;
`;

const By = styled.p`
    margin: 0;
    font-size: 0.75rem;
    color: #666;
`;

const Tag = styled.span`
    position: absolute;
    top: 12px;
    right: 12px;
    background: #8c52ff;
    color: #fff;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
`;
