import { LogOut } from 'lucide-react';
import { Button } from '../../general/button/component';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../hooks/use-auth';
const AccountInfo = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { logout, session } = useAuth();
    return (
        <AccountInfoContainer>
            <ProfileImage
                src="https://via.placeholder.com/150"
                alt="Profile Photo"
            />
            <div>
                <h3>{session?.principal?.email ?? 'User'}</h3>
                <h4> {t('account.info.sub-title')} </h4>
            </div>
            <Button
                $variants="transparent"
                onClick={() => {
                    void logout().then(() => navigate('/login'));
                }}
            >
                <LogOut />
            </Button>
        </AccountInfoContainer>
    );
};
export default AccountInfo;

const AccountInfoContainer = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;

    h4 {
        color: grey;
    }
`;

const ProfileImage = styled.img`
    border-radius: 50%;
    width: 50px;
    height: 50px;
    margin-right: 16px;
    object-fit: cover;
`;
