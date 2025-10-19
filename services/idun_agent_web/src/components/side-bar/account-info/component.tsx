import { LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '../../general/button/component';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../hooks/use-auth';
const AccountInfo = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { logout, session } = useAuth();
    const avatarUrl =
        (session as any)?.principal?.avatarUrl ||
        (session as any)?.principal?.picture ||
        (session as any)?.user?.avatarUrl ||
        (session as any)?.user?.picture ||
        '';
    return (
        <AccountInfoContainer>
            <AvatarWrapper>
                {avatarUrl && !false ? (
                    <ProfileImage
                        src={avatarUrl}
                        alt="Profile Photo"
                        onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            target.style.display = 'none';
                        }}
                    />
                ) : (
                    <UserAvatarFallback>
                        <UserIcon size={24} color="#826F95" />
                    </UserAvatarFallback>
                )}
            </AvatarWrapper>

            <ContentRow>
                <TextCol>
                    <h3 title={session?.principal?.email ?? 'User'}>
                        {session?.principal?.email ?? 'User'}
                    </h3>
                    <h4>{t('account.info.sub-title')}</h4>
                </TextCol>
                <Button
                    $variants="transparent"
                    onClick={() => {
                        void logout().then(() => navigate('/login'));
                    }}
                >
                    <LogOut />
                </Button>
            </ContentRow>
        </AccountInfoContainer>
    );
};
export default AccountInfo;

const AccountInfoContainer = styled.div`
    display: flex;
    flex-direction: column;
    padding: 12px 0;
    gap: 12px;

    h4 {
        color: grey;
    }
`;

const AvatarWrapper = styled.div`
    display: flex;
    justify-content: center;
`;

const ProfileImage = styled.img`
    border-radius: 50%;
    width: 50px;
    height: 50px;
    margin-right: 16px;
    object-fit: cover;
    display: block;
    aspect-ratio: 1 / 1;
    flex: 0 0 50px;
    overflow: hidden;
`;

const UserAvatarFallback = styled.div`
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: #121122;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 16px;
    flex: 0 0 50px;
    aspect-ratio: 1 / 1;
    overflow: hidden;
`;

const ContentRow = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    margin: 0 auto;
`;

const TextCol = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 0;
    align-items: center;
    text-align: center;

    h3 {
        margin: 0;
        font-size: 16px;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 180px;
    }

    h4 {
        margin: 4px 0 0;
        font-size: 14px;
        color: grey;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 180px;
    }
`;
