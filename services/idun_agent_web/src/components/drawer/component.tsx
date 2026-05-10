import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Overlay, Panel, Header, Title, CloseButton, Body } from './styled';

export interface DrawerProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    closeLabel?: string;
}

export const Drawer = ({ open, onClose, title, children, closeLabel = 'Close' }: DrawerProps) => {
    const triggerRef = useRef<HTMLElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        triggerRef.current = document.activeElement as HTMLElement | null;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // Move focus into the panel
        panelRef.current?.focus();

        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = previousOverflow;
            triggerRef.current?.focus();
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <Overlay
            data-testid="drawer-overlay"
            onClick={onClose}
        >
            <Panel
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
            >
                <Header>
                    <Title>{title}</Title>
                    <CloseButton aria-label={closeLabel} onClick={onClose}>
                        <X size={18} />
                    </CloseButton>
                </Header>
                <Body>{children}</Body>
            </Panel>
        </Overlay>
    );
};
