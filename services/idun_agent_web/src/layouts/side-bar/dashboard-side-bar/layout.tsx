import { useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import AccountInfo from '../../../components/side-bar/account-info/component';
import UserPopover from '../../../components/side-bar/user-popover/component';
import { useState, useEffect, useCallback, type ComponentType } from 'react';
import { UserIcon, Settings, Activity, Database, Eye, Wrench, ShieldCheck, KeyRound, Sparkles, LifeBuoy, Github, X, Plug, ChevronUp, FileText, Bot } from 'lucide-react';
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
            icon: Bot,
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
            icon: FileText,
            label: t('sidebar.prompts', 'Prompts'),
            key: 'prompts',
            path: '/prompts',
            onClick: () => navigate('/prompts'),
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
                        <ActiveIndicator $visible={!!location.pathname.startsWith(item.path)} />
                        {item.iconSrc ? (
                            <IconMask
                                $src={item.iconSrc}
                                $active={!!location.pathname.startsWith(
                                    item.path
                                )}
                            />
                        ) : item.icon ? (
                            <item.icon
                                size={18}
                                color={
                                    location.pathname.startsWith(item.path)
                                        ? '#0C5CAB'
                                        : '#4a5568'
                                }
                            />
                        ) : null}
                        {!collapsed && <MenuLabel>{item.label}</MenuLabel>}
                        {collapsed && <Tooltip>{item.label}</Tooltip>}
                    </MenuItem>
                ))}
            </SideBarNav>

            {!collapsed && !githubDismissed && (
                <GithubCard>
                    <GithubHeader>
                        <GithubTitle>Star Idun</GithubTitle>
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
                    <Sparkles size={18} color="#f59e0b" />
                    {!collapsed && <MenuLabel>Upgrade</MenuLabel>}
                    {collapsed && <Tooltip>Upgrade</Tooltip>}
                </BottomLink>
                <BottomLink
                    $collapsed={collapsed}
                    href="mailto:contact@idun-group.com"
                >
                    <LifeBuoy size={18} color="#4a5568" />
                    {!collapsed && <MenuLabel>Support</MenuLabel>}
                    {collapsed && <Tooltip>Support</Tooltip>}
                </BottomLink>
                <MenuItem
                    $isActive={!!location.pathname.startsWith('/settings')}
                    $collapsed={collapsed}
                    onClick={() => navigate('/settings')}
                >
                    <ActiveIndicator $visible={!!location.pathname.startsWith('/settings')} />
                    <Settings
                        size={18}
                        color={
                            location.pathname.startsWith('/settings')
                                ? '#0C5CAB'
                                : '#4a5568'
                        }
                    />
                    {!collapsed && <MenuLabel>{t('sidebar.settings', 'Settings')}</MenuLabel>}
                    {collapsed && <Tooltip>{t('sidebar.settings', 'Settings')}</Tooltip>}
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
                                <UserIcon size={18} color="#4a5568" />
                            )
                        ) : (
                            <>
                                <AccountInfo />
                                <ChevronUp
                                    size={15}
                                    color="#8899a6"
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
    width: ${({ $collapsed }) => ($collapsed ? '64px' : '240px')};
    min-height: 100%;
    background: #0d1117;
    color: #8899a6;
    border-right: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    z-index: 10;
`;

const SideBarNav = styled.nav<{ $collapsed?: boolean }>`
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const Tooltip = styled.span`
    position: absolute;
    left: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
    background: #1a2332;
    color: #e1e4e8;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.08);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s;
    z-index: 100;
`;

const ActiveIndicator = styled.span<{ $visible?: boolean }>`
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: #0C5CAB;
    opacity: ${({ $visible }) => ($visible ? 1 : 0)};
    transition: opacity 200ms ease;
`;

const MenuItem = styled.button<{ $isActive?: boolean; $collapsed?: boolean }>`
    display: flex;
    align-items: center;
    gap: ${({ $collapsed }) => ($collapsed ? '0' : '10px')};
    height: 40px;
    padding: ${({ $collapsed }) => ($collapsed ? '0' : '0 12px 0 16px')};
    border: none;
    border-radius: 8px;
    background: ${({ $isActive }) =>
        $isActive ? 'rgba(12, 92, 171, 0.12)' : 'transparent'};
    color: ${({ $isActive }) =>
        $isActive ? '#e1e4e8' : '#8899a6'};
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
    text-align: left;
    width: 100%;
    font-size: 13px;
    font-weight: ${({ $isActive }) => ($isActive ? '600' : '400')};
    font-family: inherit;
    position: relative;
    justify-content: ${({ $collapsed }) =>
        $collapsed ? 'center' : 'flex-start'};
    overflow: ${({ $collapsed }) => ($collapsed ? 'visible' : 'hidden')};

    &:hover {
        background: ${({ $isActive }) =>
            $isActive ? 'rgba(12, 92, 171, 0.12)' : 'rgba(255, 255, 255, 0.04)'};
    }

    &:hover > ${Tooltip} {
        opacity: 1;
    }
`;

const MenuLabel = styled.span`
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const IconMask = styled.span<{ $src: string; $active?: boolean }>`
    width: 18px;
    height: 18px;
    display: inline-block;
    flex-shrink: 0;
    background-color: ${(props) => (props.$active ? '#0C5CAB' : '#4a5568')};
    -webkit-mask: url(${(props) => props.$src}) no-repeat center / contain;
    mask: url(${(props) => props.$src}) no-repeat center / contain;
`;

export default SideBar;

const BottomSection = styled.div`
    display: flex;
    flex-direction: column;
    margin-top: auto;
    padding: 8px;
    gap: 2px;
`;

const VersionLabel = styled.span`
    font-size: 11px;
    color: #4a5568;
    text-align: center;
    padding: 4px 0 8px;
`;

const BottomLink = styled.a<{ $collapsed?: boolean }>`
    display: flex;
    align-items: center;
    gap: ${({ $collapsed }) => ($collapsed ? '0' : '10px')};
    justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
    height: 40px;
    padding: ${({ $collapsed }) => ($collapsed ? '0' : '0 12px 0 16px')};
    border-radius: 8px;
    background: transparent;
    color: #8899a6;
    text-decoration: none;
    font-size: 13px;
    font-weight: 400;
    font-family: inherit;
    cursor: pointer;
    transition: background 150ms ease;
    width: 100%;
    position: relative;

    &:hover {
        background: rgba(255, 255, 255, 0.04);
    }

    &:hover > ${Tooltip} {
        opacity: 1;
    }
`;

const UserRow = styled.div<{ $collapsed?: boolean; $isActive?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
    min-height: 40px;
    padding: ${({ $collapsed }) => ($collapsed ? '0' : '0 12px 0 16px')};
    border-radius: 8px;
    background: ${({ $isActive }) =>
        $isActive ? 'rgba(12, 92, 171, 0.12)' : 'transparent'};
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    margin-top: 4px;
    padding-top: 4px;
    overflow: hidden;
    cursor: pointer;
    transition: background 150ms ease;

    &:hover {
        background: rgba(255, 255, 255, 0.04);
    }
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
    margin: 8px;
    padding: 14px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
`;

const GithubHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
`;

const GithubTitle = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: #e1e4e8;
`;

const GithubDismiss = styled.button`
    background: none;
    border: none;
    color: #8899a6;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    width: 20px;
    height: 20px;

    &:hover {
        color: #e1e4e8;
        background: rgba(255, 255, 255, 0.04);
    }
`;

const GithubDesc = styled.p`
    margin: 0 0 12px 0;
    font-size: 12px;
    color: #6b7a8d;
    line-height: 1.5;
`;

const GithubLink = styled.a`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: #e1e4e8;
    font-size: 12px;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: background 150ms ease;

    &:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #e1e4e8;
    }
`;
