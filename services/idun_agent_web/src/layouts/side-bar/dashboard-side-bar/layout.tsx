import { useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import AccountInfo from '../../../components/side-bar/account-info/component';
import UserPopover from '../../../components/side-bar/user-popover/component';
import { useState, useEffect, useCallback, type ComponentType } from 'react';
import { UserIcon, Settings, Activity, Database, Eye, Wrench, ShieldCheck, KeyRound, Sparkles, LifeBuoy, Github, X, Plug, ChevronUp } from 'lucide-react';
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
    const [showUserPopover, setShowUserPopover] = useState(false);
    const { t } = useTranslation();

    const closeUserPopover = useCallback(() => setShowUserPopover(false), []);

    const dismissGithub = () => {
        setGithubDismissed(true);
        localStorage.setItem(GITHUB_DISMISSED_KEY, 'true');
    };

    // Effective collapsed state: collapsed when user set collapsed AND not hovered
    // Hovering temporarily expands the sidebar
    // Keep expanded when user popover is open
    const collapsed = isCollapsed && !isHovered && !showUserPopover;

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
                                        ? 'hsl(var(--primary))'
                                        : 'hsl(var(--sidebar-icon-inactive))'
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
                    <Sparkles size={17} color="hsl(var(--warning))" />
                    {!collapsed && <MenuLabel>Upgrade</MenuLabel>}
                </BottomLink>
                <BottomLink
                    $collapsed={collapsed}
                    href="mailto:contact@idun-group.com"
                >
                    <LifeBuoy size={17} color="hsl(var(--sidebar-icon-inactive))" />
                    {!collapsed && <MenuLabel>Support</MenuLabel>}
                </BottomLink>
                <MenuItem
                    $isActive={!!location.pathname.startsWith('/settings')}
                    $collapsed={collapsed}
                    onClick={() => navigate('/settings')}
                >
                    <Settings
                        size={17}
                        color={
                            location.pathname.startsWith('/settings')
                                ? 'hsl(var(--primary))'
                                : 'hsl(var(--sidebar-icon-inactive))'
                        }
                    />
                    {!collapsed && <MenuLabel>{t('sidebar.settings', 'Settings')}</MenuLabel>}
                </MenuItem>
                <UserRowWrapper>
                    {showUserPopover && <UserPopover onClose={closeUserPopover} />}
                    <UserRow
                        $collapsed={collapsed}
                        $isActive={showUserPopover || !!location.pathname.startsWith('/preferences')}
                        onClick={() => setShowUserPopover((prev) => !prev)}
                    >
                        {collapsed ? (
                            avatarUrl && !avatarError ? (
                                <AvatarImg
                                    src={avatarUrl}
                                    alt=""
                                    onError={() => setAvatarError(true)}
                                />
                            ) : (
                                <UserIcon size={17} color="hsl(var(--sidebar-icon-inactive))" />
                            )
                        ) : (
                            <>
                                <AccountInfo />
                                <ChevronUp
                                    size={15}
                                    color="hsl(var(--muted-foreground))"
                                    style={{
                                        flexShrink: 0,
                                        transition: 'transform 200ms ease',
                                        transform: showUserPopover ? 'rotate(0deg)' : 'rotate(180deg)',
                                    }}
                                />
                            </>
                        )}
                    </UserRow>
                </UserRowWrapper>
                {!collapsed && <VersionLabel>v{__APP_VERSION__}</VersionLabel>}
            </BottomSection>
        </SideBarContainer>
    );
};

// Styled Components
const SideBarContainer = styled.aside<{ $collapsed?: boolean }>`
    width: ${({ $collapsed }) => ($collapsed ? '72px' : '250px')};
    min-height: 100%;
    background: hsl(var(--sidebar-background));
    color: hsl(var(--sidebar-foreground));
    border-right: 1px solid hsl(var(--sidebar-border));
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
    background: hsl(var(--sidebar-item-bg));
    color: hsl(var(--foreground));
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
        background: hsl(var(--sidebar-item-hover));
        color: hsl(var(--foreground));
    }

    ${({ $isActive }) =>
        $isActive &&
        `
        background: hsl(var(--sidebar-item-active));
        font-weight: 700;
        border-right: 3px solid hsl(var(--primary));
    `}
`;

const MenuLabel = styled.span`
    flex: 1;
`;

const IconMask = styled.span<{ $src: string; $active?: boolean }>`
    width: 17px;
    height: 17px;
    display: inline-block;
    background-color: ${(props) => (props.$active ? 'hsl(var(--primary))' : 'hsl(var(--sidebar-icon-inactive))')};
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
    color: hsl(var(--muted-foreground));
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
    background: hsl(var(--sidebar-item-bg));
    color: hsl(var(--foreground));
    text-decoration: none;
    font-size: 15px;
    font-weight: 400;
    font-family: inherit;
    cursor: pointer;
    transition: background-color 200ms ease, color 200ms ease;
    width: 100%;

    &:hover {
        background: hsl(var(--sidebar-item-hover));
        color: hsl(var(--foreground));
    }
`;

const UserRow = styled.div<{ $collapsed?: boolean; $isActive?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
    min-height: 47px;
    padding: 0 16px 0 30px;
    background: ${({ $isActive }) =>
        $isActive ? 'hsl(var(--sidebar-item-active))' : 'hsl(var(--sidebar-background))'};
    border-top: 1px solid var(--border-subtle);
    overflow: hidden;
    cursor: pointer;
    transition: background-color 200ms ease;

    &:hover {
        background: hsl(var(--sidebar-item-hover));
    }

    ${({ $isActive }) =>
        $isActive &&
        `
        border-right: 3px solid hsl(var(--primary));
    `}
`;

const UserRowWrapper = styled.div`
    position: relative;
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
    background: hsl(var(--muted));
    border: 1px solid var(--border-light);
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
    color: hsl(var(--foreground));
`;

const GithubDismiss = styled.button`
    background: none;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        color: hsl(var(--foreground));
    }
`;

const GithubDesc = styled.p`
    margin: 0 0 14px 0;
    font-size: 13px;
    color: hsl(var(--text-secondary));
    line-height: 1.45;
`;

const GithubLink = styled.a`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    background: var(--overlay-light);
    border: 1px solid var(--border-light);
    color: hsl(var(--foreground));
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: background 150ms ease;

    &:hover {
        background: var(--overlay-medium);
        color: hsl(var(--foreground));
    }
`;
