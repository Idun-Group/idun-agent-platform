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
                        <item.icon size={30} />
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
    background: var(--color-background-primary);
    border-right: 1px solid var(--color-border-primary);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    transition: width 300ms ease;
    position: relative;
    z-index: 10;
`;

const SideBarNav = styled.nav`
    flex: 1;
    padding: 48px 0 20px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const MenuItem = styled.button<{ $isActive?: boolean; $collapsed?: boolean }>`
    display: flex;
    align-items: center;
    gap: ${({ $collapsed }) => ($collapsed ? '0' : '12px')};
    padding: 12px 20px;
    border: none;
    border-radius: 8px;
    background: ${(props) =>
        props.$isActive ? 'var(--color-background-tertiary)' : 'transparent'};
    color: ${(props) =>
        props.$isActive
            ? 'var(--color-primary)'
            : 'var(--color-text-secondary)'};
    cursor: pointer;
    transition: all var(--transition-default);
    text-align: left;
    width: 100%;
    font-size: 18px;
    font-weight: 500;
    position: relative;
    justify-content: ${({ $collapsed }) =>
        $collapsed ? 'center' : 'flex-start'};

    &:hover {
        background: #8c52ff14;
        color: var(--color-text-primary);
    }

    ${({ $isActive }) =>
        $isActive &&
        `
        background: #8C52FF14;
        border-left: 4px solid #8C52FF;

    `}

    ${(props) =>
        props.$isActive &&
        `
        &::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 3px;
            background: var(--color-primary);
        }
    `}
`;

const MenuLabel = styled.span`
    flex: 1;
`;

export default SideBar;
