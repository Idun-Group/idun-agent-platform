import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import AccountInfo from '../../../components/side-bar/account-info/component';
import { useState, useEffect, type ComponentType } from 'react';
import { UserIcon, Settings, Activity, Database, Eye, Wrench, ShieldCheck, KeyRound, Sparkles, LifeBuoy, Github, X, Plug } from 'lucide-react';
import { useAuth } from '../../../hooks/use-auth';
import { useTranslation } from 'react-i18next';

const GITHUB_DISMISSED_KEY = 'idun-github-card-dismissed';

type SideBarProps = {
    // config your component props here
};

type MenuItemConfig = {
    iconSrc?: string;
    icon?: ComponentType<{ size?: number; color?: string }>;
    label: string;
    key: string;
    path: string;
    onClick: () => void | Promise<void>;
};

const SideBar = ({}: SideBarProps) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { session } = useAuth();
    const [avatarError, setAvatarError] = useState(false);
    useEffect(() => {
        setAvatarError(false);
    }, [session]);
    // by default the sidebar should be collapsed; hovering will expand it
    const [isCollapsed] = useState(true);
    const [isHovered, setIsHovered] = useState(false);
    const [githubDismissed, setGithubDismissed] = useState(() =>
        localStorage.getItem(GITHUB_DISMISSED_KEY) === 'true'
    );
    const { t } = useTranslation();

    const dismissGithub = () => {
        setGithubDismissed(true);
        localStorage.setItem(GITHUB_DISMISSED_KEY, 'true');
    };

    // Effective collapsed state: collapsed when user set collapsed AND not hovered
    // Hovering temporarily expands the sidebar
    const collapsed = isCollapsed && !isHovered;

    const menuItems: MenuItemConfig[] = [
        {
            iconSrc: '/img/agent-icon.svg',
            label: t('sidebar.agents'),
            key: 'agent',
            path: '/agents',
            onClick: () => navigate('/agents'),
        },
        {
            icon: Activity,
            label: t('sidebar.observability', 'Observability'),
            key: 'observability',
            path: '/observability',
            onClick: () => navigate('/observability'),
        },
        {
            icon: Database,
            label: t('sidebar.memory', 'Memory'),
            key: 'memory',
            path: '/memory',
            onClick: () => navigate('/memory'),
        },
        {
            icon: Wrench,
            label: t('sidebar.mcp', 'MCP'),
            key: 'mcp',
            path: '/mcp',
            onClick: () => navigate('/mcp'),
        },
        {
            icon: ShieldCheck,
            label: t('sidebar.guard'),
            key: 'guard',
            path: '/guardrails',
            onClick: () => navigate('/guardrails'),
        },
        {
            icon: Plug,
            label: t('sidebar.integrations', 'Integrations'),
            key: 'integrations',
            path: '/integrations',
            onClick: () => navigate('/integrations'),
        },
        {
            icon: KeyRound,
            label: t('sidebar.sso', 'SSO'),
            key: 'sso',
            path: '/sso',
            onClick: () => navigate('/sso'),
        },
    ];

    const avatarUrl =
        (session as any)?.principal?.avatarUrl ||
        (session as any)?.principal?.picture ||
        (session as any)?.user?.avatarUrl ||
        (session as any)?.user?.picture ||
        '';

    return (
        <SideBarContainer
            $collapsed={collapsed}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <SideBarNav $collapsed={collapsed}>
                {menuItems.map((item) => (
                    <MenuItem
                        key={item.key}
                        $isActive={!!location.pathname.startsWith(item.path)}
                        $collapsed={collapsed}
                        onClick={item.onClick}
                    >
                        {item.iconSrc ? (
                            <IconMask
                                $src={item.iconSrc}
                                $active={!!location.pathname.startsWith(
                                    item.path
                                )}
                            />
                        ) : item.icon ? (
                            <item.icon
                                size={17}
                                color={
                                    location.pathname.startsWith(item.path)
                                        ? '#8C52FF'
                                        : '#826F95'
                                }
                            />
                        ) : null}
                        {!collapsed && <MenuLabel>{item.label}</MenuLabel>}
                    </MenuItem>
                ))}
            </SideBarNav>

            {!collapsed && !githubDismissed && (
                <GithubCard>
                    <GithubHeader>
                        <GithubTitle>⭐ Star Idun</GithubTitle>
                        <GithubDismiss onClick={dismissGithub}>
                            <X size={14} />
                        </GithubDismiss>
                    </GithubHeader>
                    <GithubDesc>
                        See the latest releases and help grow the community on GitHub
                    </GithubDesc>
                    <GithubLink
                        href="https://github.com/idun-corp/idun-agent-platform"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Github size={14} />
                        Idun Platform
                    </GithubLink>
                </GithubCard>
            )}

            <BottomSection>
                <BottomLink
                    $collapsed={collapsed}
                    href="https://idunplatform.com/#pricing"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <Sparkles size={17} color="#fbbf24" />
                    {!collapsed && <MenuLabel>Upgrade</MenuLabel>}
                </BottomLink>
                <BottomLink
                    $collapsed={collapsed}
                    href="mailto:contact@idun-group.com"
                >
                    <LifeBuoy size={17} color="#826F95" />
                    {!collapsed && <MenuLabel>Support</MenuLabel>}
                </BottomLink>
                <UserRow $collapsed={collapsed}>
                    {collapsed ? (
                        avatarUrl && !avatarError ? (
                            <AvatarImg
                                src={avatarUrl}
                                alt=""
                                onError={() => setAvatarError(true)}
                            />
                        ) : (
                            <UserIcon size={17} color="#826F95" />
                        )
                    ) : (
                        <AccountInfo />
                    )}
                </UserRow>
                {!collapsed && <VersionLabel>v{__APP_VERSION__}</VersionLabel>}
            </BottomSection>
        </SideBarContainer>
    );
};

// Styled Components
const SideBarContainer = styled.aside<{ $collapsed?: boolean }>`
    width: ${({ $collapsed }) => ($collapsed ? '72px' : '250px')};
    min-height: 100%;
    background: #030711;
    color: hsl(var(--sidebar-foreground));
    border-right: 1px solid #25325a;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    transition: width 300ms ease, background-color 300ms ease, color 300ms ease;
    position: relative;
    z-index: 10;
`;

const SideBarNav = styled.nav<{ $collapsed?: boolean }>`
    padding: 0;
    display: flex;
    flex-direction: column;
`;

const MenuItem = styled.button<{ $isActive?: boolean; $collapsed?: boolean }>`
    display: flex;
    align-items: center;
    gap: ${({ $collapsed }) => ($collapsed ? '0' : '10px')};
    height: 47px;
    padding: 0 16px 0 30px;
    border: none;
    border-radius: 0;
    background: #040210;
    color: #ffffff;
    cursor: pointer;
    transition: background-color 200ms ease, color 200ms ease;
    text-align: left;
    width: 100%;
    font-size: 15px;
    font-weight: 400;
    font-family: inherit;
    position: relative;
    justify-content: ${({ $collapsed }) =>
        $collapsed ? 'center' : 'flex-start'};

    &:hover {
        background: #000000;
        color: #ffffff;
    }

    ${({ $isActive }) =>
        $isActive &&
        `
        background: #000000;
        font-weight: 700;
        border-right: 3px solid #8C52FF;
    `}
`;

const MenuLabel = styled.span`
    flex: 1;
`;

const IconMask = styled.span<{ $src: string; $active?: boolean }>`
    width: 17px;
    height: 17px;
    display: inline-block;
    background-color: ${(props) => (props.$active ? '#8C52FF' : '#826F95')};
    -webkit-mask: url(${(props) => props.$src}) no-repeat center / contain;
    mask: url(${(props) => props.$src}) no-repeat center / contain;
`;

export default SideBar;

const BottomSection = styled.div`
    display: flex;
    flex-direction: column;
    margin-top: auto;
`;

const VersionLabel = styled.span`
    font-size: 11px;
    color: #4b5563;
    text-align: center;
    padding: 4px 0 8px;
`;

const BottomLink = styled.a<{ $collapsed?: boolean }>`
    display: flex;
    align-items: center;
    gap: ${({ $collapsed }) => ($collapsed ? '0' : '10px')};
    justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
    height: 47px;
    padding: 0 16px 0 30px;
    background: #040210;
    color: #ffffff;
    text-decoration: none;
    font-size: 15px;
    font-weight: 400;
    font-family: inherit;
    cursor: pointer;
    transition: background-color 200ms ease, color 200ms ease;
    width: 100%;

    &:hover {
        background: #000000;
        color: #ffffff;
    }
`;

const UserRow = styled.div<{ $collapsed?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
    min-height: 47px;
    padding: 0 16px 0 30px;
    background: #030711;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    overflow: hidden;
`;

const AvatarImg = styled.img`
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
`;

const GithubCard = styled.div`
    margin: 12px 16px;
    padding: 16px;
    border-radius: 8px;
    background: #0d1117;
    border: 1px solid rgba(255, 255, 255, 0.08);
`;

const GithubHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
`;

const GithubTitle = styled.span`
    font-size: 14px;
    font-weight: 600;
    color: #ffffff;
`;

const GithubDismiss = styled.button`
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.3);
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        color: rgba(255, 255, 255, 0.6);
    }
`;

const GithubDesc = styled.p`
    margin: 0 0 14px 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.45);
    line-height: 1.45;
`;

const GithubLink = styled.a`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.8);
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: background 150ms ease;

    &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #ffffff;
    }
`;
