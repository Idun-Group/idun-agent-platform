import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

type HomeProps = {
    // config your component props here
};

const HomePage = ({}: HomeProps) => {
    const navigate = useNavigate();
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            navigate('/agents');
        } else {
            navigate('/login');
        }
    }, []);
    return (
        <div>
            {/* Your component implementation here */}
            <h1>Home Component</h1>
        </div>
    );
};

export default HomePage;
