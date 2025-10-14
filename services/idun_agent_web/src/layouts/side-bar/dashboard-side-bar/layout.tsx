import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import AccountInfo from '../../../components/side-bar/account-info/component';
import { useState, useEffect } from 'react';
import { UserIcon, Settings } from 'lucide-react';
import { useAuth } from '../../../hooks/use-auth';
import { useTranslation } from 'react-i18next';

type SideBarProps = {
    // config your component props here
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

    const menuItems = [
        {
            iconSrc: '/img/agent-icon.svg',
            label: t('sidebar.agents'),
            key: 'agent',
            path: '/agents',
            onClick: () => navigate('/agents'),
        },
        {
            // leave users icon as-is per request
            icon: UserIcon,
            label: t('sidebar.users'),
            key: 'users',
            path: '/users',
            onClick: () => navigate('/users'),
        },
        {
            iconSrc: '/img/tools.svg',
            label: t('sidebar.tools'),
            key: 'tools',
            path: '/tools',
            onClick: () => navigate('/tools'),
        },
        {
            iconSrc: '/img/guardrail.svg',
            label: t('sidebar.guard'),
            key: 'guard',
            path: '/guard',
            onClick: () => navigate('/guard'),
        },
    ];

    return (
        <SideBarContainer
            $collapsed={collapsed}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <SideBarNav>
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

            {collapsed && (
                <AvatarRow>
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
                </AvatarRow>
            )}

            {!collapsed && <AccountInfo />}
        </SideBarContainer>
    );
};

// Styled Components
const SideBarContainer = styled.aside<{ $collapsed?: boolean }>`
    width: ${({ $collapsed }) => ($collapsed ? '72px' : '250px')};
    min-height: 100%;
<<<<<<< HEAD
    background: #030711; /* unified sidebar background */
=======
    background: #121122; /* from Figma frame fill */
>>>>>>> 9af1c19 (Working on front design)
    color: hsl(var(--sidebar-foreground));
    border-right: 1px solid #25325a; /* from Figma stroke */
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    transition: width 300ms ease, background-color 300ms ease, color 300ms ease;
    position: relative;
    z-index: 10;
`;

const SideBarNav = styled.nav`
    flex: 1;
    padding: 0 0 0 0;
    display: flex;
    flex-direction: column;
`;

const MenuItem = styled.button<{ $isActive?: boolean; $collapsed?: boolean }>`
    display: flex;
    align-items: center;
    gap: ${({ $collapsed }) => ($collapsed ? '0' : '10px')};
    height: 47px;
    padding: 0 16px 0 30px; /* left 30px per Figma */
    border: none;
    border-radius: 0; /* no radius in figma */
<<<<<<< HEAD
    background: #030711;
=======
    background: ${(props) => (props.$isActive ? '#040210' : '#252B45')};
>>>>>>> 9af1c19 (Working on front design)
    color: #ffffff; /* text always white */
    cursor: pointer;
    transition: background-color 200ms ease, color 200ms ease;
    text-align: left;
    width: 100%;
    font-size: 15px; /* 15px text box height */
<<<<<<< HEAD
    font-weight: 400;
=======
    font-weight: 500;
>>>>>>> 9af1c19 (Working on front design)
    font-family: inherit;
    position: relative;
    justify-content: ${({ $collapsed }) =>
        $collapsed ? 'center' : 'flex-start'};

    &:hover {
<<<<<<< HEAD
        background: #121122;
        color: #ffffff;
        border-right: 3px solid #8C52FF;
=======
        background: #040210;
        color: #ffffff;
>>>>>>> 9af1c19 (Working on front design)
    }

    ${({ $isActive }) =>
        $isActive &&
        `
<<<<<<< HEAD
        background: #121122;
        font-weight: 700;
        border-right: 3px solid #8C52FF;
=======
        background: #040210;
        font-weight: 600;
>>>>>>> 9af1c19 (Working on front design)

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

const AvatarRow = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 47px;
    width: 100%;
    padding: 0 16px 0 30px; /* match MenuItem padding for consistent centering */
    background: #030711;
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
