import { useTranslation } from 'react-i18next';
import { Button } from '../../components/general/button/component';
import styled from 'styled-components';
import { Label } from '../../components/create-agent/popup-styled';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { Form, TextInput } from '../../components/general/form/component';

const LoginPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) {
            toast.error(t('login.error'));
            return;
        } else {
            toast.success(t('login.success'));
            localStorage.setItem('token', 'your_token_here');
            navigate('/agents');
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            navigate('/agents');
        }
    }, [navigate]);

    return (
        <main>
            <StyledForm onSubmit={handleSubmit}>
                <h1>Idun Engine</h1>
                <h2>{t('login.title')}</h2>
                <p>{t('login.description')}</p>

                <TextInput
                    label={t('login.email')}
                    name="email"
                    type="email"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('login.email.placeholder')}
                    required
                />
                <TextInput
                    label={t('login.password')}
                    name="password"
                    type="password"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('login.password.placeholder')}
                    required
                />

                <Label>
                    <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        name="rememberMe"
                    />
                    {t('login.rememberMe')}
                </Label>

                <Button type="submit" $variants="base">
                    {t('login.submit')}
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
