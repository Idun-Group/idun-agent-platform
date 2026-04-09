import { Button } from '../../general/button/component';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const Overview = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    return (
        <>
            <TopSection>
                <AppSection>
                    <img
                        src="<image_url>"
                        alt={t('connected-app.apps.image-alt')}
                    />
                    <TopSectionText>
                        <h2>{t('connected-app.apps.title')}</h2>
                        <p>{t('connected-app.apps.description')}</p>
                        <Button
                            $variants="base"
                            onClick={() => navigate('/apps/marketplace')}
                        >
                            {t('connected-app.apps.first-install')}
                        </Button>
                    </TopSectionText>
                </AppSection>

                <aside></aside>
            </TopSection>

            <InformationSection></InformationSection>
        </>
    );
};
export default Overview;

const AppSection = styled.article`
    display: flex;
    flex-direction: row-reverse;
    align-items: center;
    justify-content: center;
    width: 60%;
    height: 100%;

    padding: 15%;
    flex: 1;
    gap: 32px;
    box-sizing: border-box;
    text-align: left;

    background: rgba(255, 255, 255, 0.02);
    box-shadow: 0 0 10px rgba(12, 92, 171, 0.38);
    button {
        margin: 0;
    }
    h1 {
        font-size: 24px;
        font-weight: bold;
        text-align: center;
        margin: auto;
    }

    img {
        width: 25%;
        height: 30%;
        background: red;
    }

    @media (max-width: 768px) {
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 20%;
        height: 35vh;
        width: 100%;

        button {
            margin: auto;
        }
        img {
            width: 100%;
            height: auto;
        }
    }
`;

const TopSectionText = styled.div``;

const TopSection = styled.section`
    display: flex;
    width: 90%;
    border: 2px solid rgba(255, 255, 255, 0.08);
    height: 80vh;
    gap: 24px;
    @media (max-width: 768px) {
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        height: auto;
    }

    aside {
        width: 30%;
        height: 100;
        background: #5050501c;
        box-shadow: 0 0 10px #0C5CAB61;
        @media (max-width: 768px) {
            width: 100%;
            height: auto;
        }
    }
`;

const InformationSection = styled.section`
    display: flex;
    flex-direction: column;
    width: 90%;
    padding: 24px;
    height: 100%;
    background: rgba(255, 255, 255, 0.02);
    box-shadow: 0 0 10px rgba(12, 92, 171, 0.38);
`;
