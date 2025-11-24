import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Button } from '../../../components/general/button/component';
import { toast } from 'react-toastify';
import { useSettingsPage } from '../../../hooks/use-settings-page';
import { useState } from 'react';
import {
    BellIcon,
    GlobeIcon,
    PaletteIcon,
    ShieldIcon,
    UserIcon,
} from 'lucide-react';
import AccountInfo from '../../../components/side-bar/account-info/component';

const SettingSideBar = () => {
    const { t } = useTranslation();
    const { settingPage, setSettingPage } = useSettingsPage();
    // collapsed by default, hover expands
    const [isCollapsed] = useState(true);
    const [isHovered, setIsHovered] = useState(false);
    const collapsed = isCollapsed && !isHovered;
    const settingsSections = [
        { key: 'profile', label: t('settings.profile.title'), icon: UserIcon },
        {
            key: 'appearance',
            label: t('settings.appearance.title'),
            icon: PaletteIcon,
        },
        {
            key: 'language',
            label: t('settings.language.title'),
            icon: GlobeIcon,
        },
        {
            key: 'notifications',
            label: t('settings.notifications.title'),
            icon: BellIcon,
        },
        {
            key: 'security',
            label: t('settings.security.title'),
            icon: ShieldIcon,
        },
    ];

    return (
        <SideBarContainer
            $collapsed={collapsed}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Your component implementation here */}
            <UserInfo $collapsed={collapsed}>
                <VisibilityWrap $visible={!collapsed}>
                    <AccountInfo />
                    <ButtonSwitchAccount
                        $variants="transparent"
                        onClick={() => toast.warning('Switch account clicked')}
                    >
                        {t('settings.switch-account')}
                    </ButtonSwitchAccount>
                </VisibilityWrap>
            </UserInfo>
            <nav>
                <NavList>
                    {settingsSections.map((section) => (
                        <NavPoint
                            key={section.key}
                            $selected={settingPage === section.key}
                        >
                            <NavButton
                                onClick={() => setSettingPage(section.key)}
                                title={collapsed ? section.label : undefined}
                                aria-label={section.label}
                            >
                                <section.icon size={20} />
                                {!collapsed && section.label}
                            </NavButton>
                        </NavPoint>
                    ))}
                </NavList>
            </nav>
        </SideBarContainer>
    );
};
export default SettingSideBar;

const SideBarContainer = styled.div<{ $collapsed?: boolean }>`
    width: ${({ $collapsed }) => ($collapsed ? '72px' : '250px')};
    border-right: 1px solid #25325a;
    background: #030711;
    color: #ffffff;
    transition: width 300ms ease, padding 300ms ease, background-color 300ms ease, color 300ms ease;
    position: relative;
    padding-bottom: ${({ $collapsed }) => ($collapsed ? '47px' : '120px')}; /* reserve space for fixed user info */
`;

const NavButton = styled.button`
    background: none;
    border: none;
    text-align: left;
    width: 100%;
    cursor: pointer;
    color: #ffffff;
    font-size: 15px;
    font-weight: 400;
    font-family: inherit;
`;

const NavList = styled.ul`
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
`;

const NavPoint = styled.li<{ $selected: boolean }>`
    border-radius: 0;
    height: 47px;
    padding: 0 16px 0 30px;
    background: #040210;
    &:hover {
        background: #000000; /* maximum contrast vs default */
    }

    ${({ $selected: selected }) => {
        return selected
            ? `
            background: #000000; /* maximum contrast */
            font-weight: 400;
            border-right: none;
        `
            : '';
    }}

    /* Separator only for the top 4 items with 15% side margins */
    position: relative;
    &:nth-child(-n + 4)::after {
        content: '';
        position: absolute;
        left: 15%;
        right: 15%;
        bottom: 0;
        height: 1px;
        background: rgb(130, 111, 149);
    }
`;

const UserInfo = styled.div<{ $collapsed?: boolean }>`
    border-top: 1px solid hsl(var(--sidebar-border));
    height: ${({ $collapsed }) => ($collapsed ? '47px' : '120px')}; /* reserve space so it doesn't jump */
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const ButtonSwitchAccount = styled(Button)`
    margin-top: 16px;
    color: #8c52ff;

    &:hover {
        background-color: #8c52ff;
        color: white;
    }
    padding: 8px 0;
`;

const VisibilityWrap = styled.div<{ $visible: boolean }>`
    width: 100%;
    opacity: ${(p) => (p.$visible ? 1 : 0)};
    pointer-events: ${(p) => (p.$visible ? 'auto' : 'none')};
    transition: opacity 200ms ease;
    display: flex;
    flex-direction: column;
    align-items: center;
`;
