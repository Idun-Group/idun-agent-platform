import type { AppType } from '../../../pages/app-marketplace-page/page';
import styled from 'styled-components';
import { Button } from '../../general/button/component';
import { useTranslation } from 'react-i18next';
import { useLoader } from '../../../hooks/use-loader';

type AppCardProps = {
    app: AppType;
};

const AppCard = ({ app }: AppCardProps) => {
    const { t } = useTranslation();
    return (
        <Container>
            <Tag>{app.tag}</Tag>
            <AppImage src={app.imageUrl} alt={app.name} />
            <Title>{app.name}</Title>
            <By>
                {t('connected-app.marketplace.by')}: {app.by}
            </By>
            <Description>{app.description}</Description>
            <PopupButton url={app.urlConnector} />
        </Container>
    );
};

export default AppCard;

const PopupButton = ({ url }: { url: string }) => {
    const { t } = useTranslation();
    const { setIsLoading } = useLoader();

    const width = 800;
    const height = 600;

    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;

    // Calcul position centrée
    const left = screenWidth / 2 - width / 2;
    const top = screenHeight / 2 - height / 2;

    return (
        <InstallButton
            onClick={() => {
                setIsLoading(true);

                setTimeout(() => {
                    const popup = window.open(
                        url,
                        'popup',
                        `width=${width},height=${height},left=${left},top=${top}`
                    );

                    if (popup) {
                        const timer = setInterval(() => {
                            if (popup.closed) {
                                clearInterval(timer);
                                setIsLoading(false);
                            }
                        }, 500);
                    } else {
                        setIsLoading(false);
                    }
                }, Math.random() * 1000);
            }}
            $variants="base"
        >
            {t('connected-app.marketplace.install')}
        </InstallButton>
    );
};

const Container = styled.li`
    position: relative;
    display: flex;
    flex-direction: column;
    background: #5050501c;
    box-shadow: 0 0 10px #8c52ff61;
    border-radius: 8px;
    padding: 16px;
`;

const InstallButton = styled(Button)`
    margin-top: 12px;
    width: max-content;
    align-self: flex-end;
    font-size: 16px;
    font-weight: 600;
    padding: 8px 32px;
`;

const AppImage = styled.img`
    width: 96px;
    height: 96px;
    border-radius: 8px;
    object-fit: contain;
`;
const Title = styled.h1`
    font-size: 1.5rem;
    font-weight: bold;
    margin: 0;
`;

const Description = styled.p`
    margin: 8px 0;
`;

const By = styled.p`
    margin: 8px 0;
    font-size: 0.875rem;
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
    font-size: 16px;
    font-weight: 600;
`;
