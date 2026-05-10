import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Drawer } from './component';

describe('<Drawer>', () => {
    it('renders nothing when open is false', () => {
        const { container } = render(
            <Drawer open={false} onClose={() => {}} title="Test">
                <p>body</p>
            </Drawer>,
        );
        expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it('renders content and title when open', () => {
        render(
            <Drawer open={true} onClose={() => {}} title="My Drawer">
                <p>drawer body</p>
            </Drawer>,
        );
        expect(screen.getByRole('dialog', { name: /my drawer/i })).toBeInTheDocument();
        expect(screen.getByText('drawer body')).toBeInTheDocument();
    });

    it('calls onClose when the overlay is clicked', () => {
        const onClose = vi.fn();
        render(
            <Drawer open={true} onClose={onClose} title="Test">
                <p>body</p>
            </Drawer>,
        );
        fireEvent.click(screen.getByTestId('drawer-overlay'));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when Escape is pressed', () => {
        const onClose = vi.fn();
        render(
            <Drawer open={true} onClose={onClose} title="Test">
                <p>body</p>
            </Drawer>,
        );
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not call onClose when clicks land inside the panel', () => {
        const onClose = vi.fn();
        render(
            <Drawer open={true} onClose={onClose} title="Test">
                <p>body</p>
            </Drawer>,
        );
        fireEvent.click(screen.getByText('body'));
        expect(onClose).not.toHaveBeenCalled();
    });
});
