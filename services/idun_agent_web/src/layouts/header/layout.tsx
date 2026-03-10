import { useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../../hooks/use-project';
import { useAuth } from '../../hooks/use-auth';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ProjectPickerDropdown from '../../components/project-picker/component';

const Header = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { refreshProjects } = useProject();
    const { session, isLoading: isAuthLoading } = useAuth();

    useEffect(() => {
        if (isAuthLoading || !session) return;
        refreshProjects();
    }, [isAuthLoading, session, refreshProjects]);

    return (
        <HeaderContainer>
            {/* Left: Logo */}
            <LeftZone>
                <Title onClick={() => navigate('/agents')} style={{ cursor: 'pointer' }}>
                    <Logo src="/img/logo/favicon.svg" alt="Idun Logo" /> Idun Platform
                </Title>
            </LeftZone>

            {/* Center: Search placeholder */}
            <CenterZone>
                <SearchPlaceholder>
                    <Search size={14} color="hsl(var(--muted-foreground) / 0.6)" />
                    <SearchText>{t('header.search', 'Search...')}</SearchText>
                    <KbdHint>⌘K</KbdHint>
                </SearchPlaceholder>
            </CenterZone>

            {/* Right: Project picker */}
            <RightZone>
                {session && <ProjectPickerDropdown />}
            </RightZone>
        </HeaderContainer>
    );
};

export default Header;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const HeaderContainer = styled.header`
    background-color: hsl(var(--header-bg) / 0.9);
    padding: 0 24px;
    height: 56px;
    border-bottom: 1px solid hsl(var(--header-border));
    transition: background-color 0.3s ease, border-color 0.3s ease;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    width: 100%;
    position: sticky;
    top: 0;
    z-index: 50;
    backdrop-filter: saturate(180%) blur(8px);
`;

const LeftZone = styled.div`
    display: flex;
    align-items: center;
    min-width: 160px;
`;

const CenterZone = styled.div`
    flex: 0 1 420px;
    margin: 0 32px;
`;

const RightZone = styled.div`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 160px;
`;

const Logo = styled.img`
    height: 28px;
    margin-right: 0.5rem;
`;

const Title = styled.h1`
    font-size: 1.1rem;
    color: hsl(var(--header-text));
    display: flex;
    align-items: center;
    margin: 0;
    font-weight: 600;
    letter-spacing: -0.01em;
`;

const SearchPlaceholder = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 9px;
    cursor: default;
`;

const SearchText = styled.span`
    color: hsl(var(--muted-foreground) / 0.5);
    font-size: 13px;
`;

const KbdHint = styled.span`
    margin-left: auto;
    color: hsl(var(--muted-foreground) / 0.3);
    font-size: 11px;
    border: 1px solid var(--border-light);
    padding: 2px 7px;
    border-radius: 4px;
    font-family: monospace;
`;
