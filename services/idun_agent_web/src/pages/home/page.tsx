import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
        <div>
            {/* Your component implementation here */}
            <h1>Home Component</h1>
        </div>
    );
};

export default HomePage;
