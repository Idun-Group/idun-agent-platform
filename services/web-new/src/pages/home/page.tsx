import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../../hooks/use-auth';

type HomeProps = {
    // config your component props here
};

const HomePage = ({}: HomeProps) => {
    const navigate = useNavigate();
    const { session, isLoading } = useAuth();
    useEffect(() => {
        if (isLoading) return;
        if (session) navigate('/agents');
        else navigate('/login');
    }, [session, isLoading, navigate]);
    return (
        <PageWrapper>
            <LoadingIndicator>
                <Spinner />
            </LoadingIndicator>
        </PageWrapper>
    );
};

const PageWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #0a0e17;
    font-family: 'IBM Plex Sans', sans-serif;
`;

const LoadingIndicator = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
`;

const Spinner = styled.div`
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.06);
    border-top-color: #0C5CAB;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
`;

export default HomePage;
