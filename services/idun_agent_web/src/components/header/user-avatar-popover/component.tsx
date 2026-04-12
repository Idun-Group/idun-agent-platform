import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled, { keyframes } from 'styled-components';
import { Settings, LogOut } from 'lucide-react';
import { useAuth } from '../../../hooks/use-auth';

type UserAvatarPopoverProps = {
    onClose: () => void;
};

const UserAvatarPopover = ({ onClose }: UserAvatarPopoverProps) => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { logout, session } = useAuth();
    const ref = useRef<HTMLDivElement>(null);

    const email = session?.principal?.email ?? '';
    const name =
        (session as any)?.principal?.name ||
        (session as any)?.user?.name ||
        email.split('@')[0] || 'User';
    const avatarUrl =
        (session as any)?.principal?.avatarUrl ||
        (session as any)?.principal?.picture ||
        (session as any)?.user?.avatarUrl ||
        (session as any)?.user?.picture ||
        '';

    const initials = name
        .split(' ')
        .map((w: string) => w.charAt(0))
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'U';

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    return (
        <PopoverContainer ref={ref}>
            {/* User identity section */}
            <UserSection>
                {avatarUrl ? (
                    <Avatar
                        src={avatarUrl}
                        alt=""
                        onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = 'flex';
                        }}
                    />
                ) : null}
                <AvatarFallback style={avatarUrl ? { display: 'none' } : undefined}>
                    {initials}
                </AvatarFallback>
                <UserDetails>
                    <UserName>{name}</UserName>
                    {email && <UserEmail>{email}</UserEmail>}
                </UserDetails>
            </UserSection>

            <Divider />

            {/* Menu items */}
            <MenuSection>
                <PopoverMenuItem
                    onClick={() => {
                        onClose();
                        navigate('/preferences');
                    }}
                >
                    <Settings size={16} />
                    <span>{t('userPopover.accountSettings', 'Account Settings')}</span>
                </PopoverMenuItem>
            </MenuSection>

            <Divider />

            <MenuSection>
                <PopoverMenuItem
                    $destructive
                    onClick={() => {
                        onClose();
                        void logout().then(() => navigate('/login'));
                    }}
                >
                    <LogOut size={16} />
                    <span>{t('userPopover.signOut', 'Sign out')}</span>
                </PopoverMenuItem>
            </MenuSection>
        </PopoverContainer>
    );
};

export default UserAvatarPopover;

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const popoverIn = keyframes`
    from {
        opacity: 0;
        transform: translateY(-6px) scale(0.97);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
`;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const PopoverContainer = styled.div`
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 240px;
    z-index: 50;
    background: hsl(var(--popover));
    border: 1px solid var(--border-light);
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: ${popoverIn} 150ms ease;
    overflow: hidden;
`;

const UserSection = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
`;

const Avatar = styled.img`
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
`;

const AvatarFallback = styled.div`
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: hsla(var(--primary) / 0.15);
    color: hsl(var(--primary));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 600;
    flex-shrink: 0;
    letter-spacing: 0.02em;
`;

const UserDetails = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
`;

const UserName = styled.span`
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const UserEmail = styled.span`
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Divider = styled.div`
    height: 1px;
    background: var(--border-subtle);
    margin: 0;
`;

const MenuSection = styled.div`
    padding: 4px;
`;

const PopoverMenuItem = styled.button<{ $destructive?: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: ${({ $destructive }) =>
        $destructive ? 'hsl(var(--destructive-foreground))' : 'hsl(var(--foreground))'};
    font-size: 14px;
    font-weight: 400;
    font-family: inherit;
    cursor: pointer;
    transition: background 150ms ease;

    &:hover {
        background: ${({ $destructive }) =>
            $destructive ? 'hsla(var(--destructive) / 0.15)' : 'var(--overlay-light)'};
    }

    svg {
        flex-shrink: 0;
        color: ${({ $destructive }) =>
            $destructive ? 'hsl(var(--destructive-foreground))' : 'hsl(var(--muted-foreground))'};
    }

    &:hover svg {
        color: ${({ $destructive }) =>
            $destructive ? 'hsl(var(--destructive-foreground))' : 'hsl(var(--foreground))'};
    }
`;
