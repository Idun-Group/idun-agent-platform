import { User as UserIcon } from 'lucide-react';
import styled from 'styled-components';
import { useAuth } from '../../../hooks/use-auth';

const AccountInfo = () => {
    const { session } = useAuth();
    const avatarUrl =
        (session as any)?.principal?.avatarUrl ||
        (session as any)?.principal?.picture ||
        (session as any)?.user?.avatarUrl ||
        (session as any)?.user?.picture ||
        '';
    return (
        <AccountInfoContainer>
            {avatarUrl ? (
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
                    <UserIcon size={17} color="#6B8EB5" />
                </UserAvatarFallback>
            )}

            <TextCol>
                <h3 title={session?.principal?.email ?? 'User'}>
                    {session?.principal?.email ?? 'User'}
                </h3>
            </TextCol>
        </AccountInfoContainer>
    );
};
export default AccountInfo;

const AccountInfoContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 0;
`;

const ProfileImage = styled.img`
    border-radius: 50%;
    width: 17px;
    height: 17px;
    object-fit: cover;
    display: block;
    flex-shrink: 0;
`;

const UserAvatarFallback = styled.div`
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background: rgba(12, 92, 171, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const TextCol = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;

    h3 {
        margin: 0;
        font-size: 13px;
        font-weight: 500;
        color: #e1e4e8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
`;
