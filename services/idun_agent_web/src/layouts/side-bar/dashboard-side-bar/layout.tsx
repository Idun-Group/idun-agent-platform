import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import AccountInfo from '../../../components/side-bar/account-info/component';
import { useState } from 'react';
import {
    BotIcon,
    EyeIcon,
    Grid2x2PlusIcon,
    HammerIcon,
    ShieldIcon,
    UserIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

type SideBarProps = {
    // config your component props here
};

const SideBar = ({}: SideBarProps) => {
    const navigate = useNavigate();
    const location = useLocation();
    // by default the sidebar should be collapsed; hovering will expand it
    const [isCollapsed] = useState(true);
    const [isHovered, setIsHovered] = useState(false);
    const { t } = useTranslation();

    // Effective collapsed state: collapsed when user set collapsed AND not hovered
    // Hovering temporarily expands the sidebar
    const collapsed = isCollapsed && !isHovered;

    const menuItems = [
        {
            icon: BotIcon,
            label: t('sidebar.agents'),
            key: 'agent',
            path: '/agents',
            onClick: () => navigate('/agents'),
        },
        // {
        //     icon: ShieldIcon,
        //     label: t('sidebar.guard'),
        //     key: 'guard',
        //     path: '/guard',
        //     onClick: () => toast.error('This feature is not implemented yet'),
        // },
        // {
        //     icon: EyeIcon,
        //     label: t('sidebar.observation'),
        //     key: 'observation',
        //     path: '/observation',
        //     onClick: () => navigate('/observation'),
        // },
        // {
        //     icon: HammerIcon,
        //     label: t('sidebar.tools'),
        //     key: 'tools',
        //     path: '/tools',
        //     onClick: () => toast.error('This feature is not implemented yet'),
        // },
        {
            icon: UserIcon,
            label: t('sidebar.users'),
            key: 'users',
            path: '/users',
            onClick: () => navigate('/users'),
        },
        // {
        //     icon: Grid2x2PlusIcon,
        //     label: t('sidebar.apps'),
        //     key: 'apps',
        //     path: '/apps',
        //     onClick: () => navigate('/apps'),
        // },
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
                        <item.icon size={17} />
                        {!collapsed && <MenuLabel>{item.label}</MenuLabel>}
                    </MenuItem>
                ))}
            </SideBarNav>

            {!collapsed && <AccountInfo />}
        </SideBarContainer>
    );
};

// Styled Components
const SideBarContainer = styled.aside<{ $collapsed?: boolean }>`
    width: ${({ $collapsed }) => ($collapsed ? '72px' : '250px')};
    min-height: 100%;
    background: #121122; /* from Figma frame fill */
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
    gap: 8px;
`;

const MenuItem = styled.button<{ $isActive?: boolean; $collapsed?: boolean }>`
    display: flex;
    align-items: center;
    gap: ${({ $collapsed }) => ($collapsed ? '0' : '10px')};
    height: 47px;
    padding: 0 16px 0 30px; /* left 30px per Figma */
    border: none;
    border-radius: 0; /* no radius in figma */
    background: ${(props) => (props.$isActive ? '#040210' : '#252B45')};
    color: #ffffff; /* text always white */
    cursor: pointer;
    transition: background-color 200ms ease, color 200ms ease;
    text-align: left;
    width: 100%;
    font-size: 15px; /* 15px text box height */
    font-weight: 500;
    font-family: inherit;
    position: relative;
    justify-content: ${({ $collapsed }) =>
        $collapsed ? 'center' : 'flex-start'};

    &:hover {
        background: #040210;
        color: #ffffff;
    }

    ${({ $isActive }) =>
        $isActive &&
        `
        background: #040210;
        font-weight: 600;

    `}
`;

const MenuLabel = styled.span`
    flex: 1;
`;

export default SideBar;
