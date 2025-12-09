import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import AccountInfo from '../../../components/side-bar/account-info/component';
import { useState, useEffect, type ComponentType } from 'react';
import { UserIcon, Settings, Activity, Database, Eye, Wrench, ShieldCheck, Key } from 'lucide-react';
import { useAuth } from '../../../hooks/use-auth';
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation();

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
            label: t('sidebar.guard', 'Guardrails'),
            key: 'guard',
            path: '/guardrails',
            onClick: () => navigate('/guardrails'),
        },
        {
            icon: Key,
            label: t('sidebar.sso', 'SSO'),
            key: 'sso',
            path: '/sso',
            onClick: () => navigate('/sso'),
        },
    ];

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
            <MenuItem
                $collapsed={collapsed}
                $isActive={location.pathname.startsWith('/settings')}
                onClick={() => navigate('/settings')}
            >
                <Settings
                    size={17}
                    color={
                        location.pathname.startsWith('/settings')
                            ? '#8C52FF'
                            : '#826F95'
                    }
                />
                {!collapsed && <MenuLabel>{t('header.settings')}</MenuLabel>}
            </MenuItem>

            <UserArea $collapsed={collapsed}>
                <AvatarRowOverlay $visible={collapsed}>
                    {(() => {
                        const avatarUrl =
                            (session as any)?.principal?.avatarUrl ||
                            (session as any)?.principal?.picture ||
                            (session as any)?.user?.avatarUrl ||
                            (session as any)?.user?.picture ||
                            '';
                        return avatarUrl && !avatarError ? (
                            <AvatarImg
                                src={avatarUrl}
                                alt=""
                                onError={() => setAvatarError(true)}
                            />
                        ) : (
                            <UserIcon size={17} color="#826F95" />
                        );
                    })()}
                </AvatarRowOverlay>
                <AccountInfoWrapper $visible={!collapsed}>
                    <AccountInfo />
                </AccountInfoWrapper>
            </UserArea>
        </SideBarContainer>
    );
};

// Styled Components
const SideBarContainer = styled.aside<{ $collapsed?: boolean }>`
    width: ${({ $collapsed }) => ($collapsed ? '72px' : '250px')};
    min-height: 100%;
    background: #030711; /* unified sidebar background */
    color: hsl(var(--sidebar-foreground));
    border-right: 1px solid #25325a; /* from Figma stroke */
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    transition: width 300ms ease, background-color 300ms ease, color 300ms ease;
    position: relative;
    z-index: 10; /* Lower z-index */
    padding-bottom: ${({ $collapsed }) => ($collapsed ? '47px' : '120px')}; /* reserve space for fixed user area */
`;

const SideBarNav = styled.nav<{ $collapsed?: boolean }>`
    flex: 1;
    padding: 0 0 0 0;
    display: flex;
    flex-direction: column;
    ${({ $collapsed }) =>
        !$collapsed && `
        /* No separators currently applied */
    `}
`;

const MenuItem = styled.button<{ $isActive?: boolean; $collapsed?: boolean }>`
    display: flex;
    align-items: center;
    gap: ${({ $collapsed }) => ($collapsed ? '0' : '10px')};
    height: 47px;
    padding: 0 16px 0 30px; /* left 30px per Figma */
    border: none;
    border-radius: 0; /* no radius in figma */
    background: #040210;
    color: #ffffff; /* text always white */
    cursor: pointer;
    transition: background-color 200ms ease, color 200ms ease;
    text-align: left;
    width: 100%;
    font-size: 15px; /* 15px text box height */
    font-weight: 400;
    font-family: inherit;
    position: relative;
    justify-content: ${({ $collapsed }) =>
        $collapsed ? 'center' : 'flex-start'};

    &:hover {
        background: #000000; /* maximum contrast vs default */
        color: #ffffff;
    }

    ${({ $isActive }) =>
        $isActive &&
        `
        background: #000000; /* maximum contrast */
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

// Ensure icons turn purple on hover (for both masked images and lucide SVGs)
const MenuItemWithHover = styled(MenuItem)`
    &:hover ${IconMask} {
        background-color: #8C52FF;
    }
    &:hover svg {
        stroke: #8C52FF;
        color: #8C52FF;
    }
`;

export default SideBar;

const UserArea = styled.div<{ $collapsed?: boolean }>`
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: ${({ $collapsed }) => ($collapsed ? '47px' : '120px')}; /* reserve space to avoid jumping */
`;

const AvatarRow = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 47px;
    width: 100%;
    padding: 0 16px 0 30px; /* match MenuItem padding for consistent centering */
    background: #030711;
`;

const AvatarRowOverlay = styled(AvatarRow)<{ $visible?: boolean }>`
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    display: ${(p) => (p.$visible ? 'flex' : 'none')};
`;

const AvatarImg = styled.img`
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
    aspect-ratio: 1 / 1;
    overflow: hidden;
`;

const AccountInfoWrapper = styled.div<{ $visible?: boolean }>`
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    padding: 8px 12px;
    display: ${(p) => (p.$visible ? 'flex' : 'none')};
    align-items: center;
    justify-content: center;
`;
