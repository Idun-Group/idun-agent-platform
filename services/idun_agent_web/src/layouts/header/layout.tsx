import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import useWorkspace from '../../hooks/use-workspace';
import { useAuth } from '../../hooks/use-auth';
import { useTranslation } from 'react-i18next';
import { UserIcon } from 'lucide-react';

const Header = () => {
    const [workspaces, setWorkspaces] = useState<
        { id: string; name: string; icon: string; description: string }[]
    >([]);
    const navigate = useNavigate();

    const { setSelectedWorkspaceId, getAllWorkspace } = useWorkspace();
    const { session, isLoading: isAuthLoading } = useAuth();

    const { t } = useTranslation();

    useEffect(() => {
        if (isAuthLoading || !session) return;
        getAllWorkspace().then((data) => setWorkspaces(data));
    }, [isAuthLoading, session, getAllWorkspace]);

    const [workspaceId, setWorkspaceId] = useState<string>('');

    const avatarUrl =
        (session as any)?.principal?.avatarUrl ||
        (session as any)?.principal?.picture ||
        (session as any)?.user?.avatarUrl ||
        (session as any)?.user?.picture ||
        '';

    const [avatarError, setAvatarError] = useState(false);
    useEffect(() => {
        setAvatarError(false);
    }, [session]);

    return (
        <HeaderContainer>
            <LeftSection>
                <LogoGroup onClick={() => navigate('/agents')} style={{ cursor: 'pointer' }}>
                    <Logo src="/img/logo/favicon.svg" alt="Idun Logo" />
                    <Title>Idun Platform</Title>
                </LogoGroup>

                {/** Workspace selector temporarily disabled */}
                {false && (
                    <Select
                        value={workspaceId}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            const value = e.target.value;
                            setWorkspaceId(value);
                            setSelectedWorkspaceId(value || null);
                        }}
                    >
                        <option value="">
                            {t('header.workspace.select')}
                        </option>
                        {workspaces.length === 0 ? (
                            <option value="" disabled>
                                No workspaces
                            </option>
                        ) : null}
                        {workspaces.map((workspace) => (
                            <option key={workspace.id} value={workspace.id}>
                                {workspace.icon} {workspace.name}
                            </option>
                        ))}
                    </Select>
                )}
            </LeftSection>

            <RightSection>
                <AvatarButton>
                    {avatarUrl && !avatarError ? (
                        <HeaderAvatar
                            src={avatarUrl}
                            alt=""
                            onError={() => setAvatarError(true)}
                        />
                    ) : (
                        <UserIcon size={16} color="#8899a6" />
                    )}
                </AvatarButton>
            </RightSection>
        </HeaderContainer>
    );
};

export default Header;

const HeaderContainer = styled.header`
    height: 56px;
    padding: 0 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    width: 100%;
    position: sticky;
    top: 0;
    z-index: 50;
    backdrop-filter: saturate(180%) blur(12px);
    background: rgba(10, 14, 23, 0.85);
`;

const LeftSection = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
`;

const LogoGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const Logo = styled.img`
    height: 26px;
    width: 26px;
    object-fit: contain;
`;

const Title = styled.h1`
    font-size: 15px;
    color: #e1e4e8;
    display: flex;
    align-items: center;
    margin: 0;
    font-weight: 600;
    letter-spacing: -0.01em;
`;

const RightSection = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const AvatarButton = styled.button`
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
    transition: border-color 200ms ease;

    &:hover {
        border-color: rgba(12, 92, 171, 0.4);
    }
`;

const HeaderAvatar = styled.img`
    width: 100%;
    height: 100%;
    object-fit: cover;
`;

const Select = styled.select`
    margin-left: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    font-size: 13px;
    color: #e1e4e8;
    min-width: 200px;
    cursor: pointer;
    transition: all 200ms ease;

    &:hover {
        border-color: rgba(12, 92, 171, 0.4);
    }

    &:focus {
        border-color: #0C5CAB;
        outline: none;
        box-shadow: 0 0 0 2px rgba(12, 92, 171, 0.15);
    }

    option {
        background: #0a0e17;
        color: #e1e4e8;
        padding: 8px;
    }
`;
