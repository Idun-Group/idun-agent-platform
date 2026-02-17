import { useTranslation } from 'react-i18next';
import { Button } from '../../components/general/button/component';
import styled from 'styled-components';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form } from '../../components/general/form/component';
import { useAuth } from '../../hooks/use-auth';

const LoginPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { session, loginOIDC } = useAuth();

    // Redirect to app if already authenticated
    useEffect(() => {
        if (session) {
            navigate('/agents', { replace: true });
        }
    }, [session, navigate]);

    return (
        <main>
            <StyledForm onSubmit={(e) => e.preventDefault()} noValidate>
                <h1>Idun Agent Platform</h1>
                <h2>{t('login.title')}</h2>
                <p>{t('login.description')}</p>

                <Button type="button" $variants="base" onClick={loginOIDC}>
                    {t('login.sso', { defaultValue: 'Continue with Google' })}
                </Button>
            </StyledForm>
        </main>
    );
};

const StyledForm = styled(Form)`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);

    button {
        margin: auto;
    }
    h2 {
        padding: 0;
        margin: 0;
        margin-top: 16px;
    }
    p {
        padding: 0;
        margin: 0;
        margin-bottom: 16px;
    }
`;

export default LoginPage;
