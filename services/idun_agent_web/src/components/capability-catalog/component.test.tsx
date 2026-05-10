import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { Globe, Lock } from 'lucide-react';
import { CapabilityCatalog, CapabilityItem } from './component';

const items: CapabilityItem[] = [
    { id: 'a', label: 'Alpha', description: 'First item', icon: <Globe size={20} /> },
    { id: 'b', label: 'Beta', description: 'Second item', icon: <Globe size={20} />, comingSoon: true },
    { id: 'c', label: 'Gamma', description: 'Third item', icon: <Lock size={20} />, group: 'Group X' },
    { id: 'd', label: 'Delta', description: 'Fourth item', icon: <Lock size={20} />, group: 'Group Y' },
];

describe('<CapabilityCatalog>', () => {
    it('renders all items with their labels and descriptions', () => {
        render(<CapabilityCatalog items={items} onSelect={() => {}} />);
        for (const item of items) {
            expect(screen.getByText(item.label)).toBeInTheDocument();
            expect(screen.getByText(item.description)).toBeInTheDocument();
        }
    });

    it('calls onSelect with the item id when a live card is clicked', () => {
        const onSelect = vi.fn();
        render(<CapabilityCatalog items={items} onSelect={onSelect} />);
        fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
        expect(onSelect).toHaveBeenCalledWith('a');
    });

    it('does not call onSelect for coming-soon cards', () => {
        const onSelect = vi.fn();
        render(<CapabilityCatalog items={items} onSelect={onSelect} />);
        const beta = screen.getByText('Beta').closest('[role="button"]');
        expect(beta).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(beta!);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('renders group headers when items have group set', () => {
        render(<CapabilityCatalog items={items} onSelect={() => {}} />);
        expect(screen.getByText('Group X')).toBeInTheDocument();
        expect(screen.getByText('Group Y')).toBeInTheDocument();
    });

    it('renders search input when items.length > 8', () => {
        const many = Array.from({ length: 9 }, (_, i) => ({
            id: String(i),
            label: `Item ${i}`,
            description: `Desc ${i}`,
            icon: <Globe size={20} />,
        }));
        render(<CapabilityCatalog items={many} onSelect={() => {}} />);
        expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    it('does not render search input when items.length <= 8', () => {
        render(<CapabilityCatalog items={items} onSelect={() => {}} />);
        expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it('respects explicit search prop override', () => {
        render(<CapabilityCatalog items={items} search={true} onSelect={() => {}} />);
        expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    it('filters items by name and description when searching', async () => {
        const many = [
            ...items,
            { id: 'e', label: 'Epsilon', description: 'Fifth item', icon: <Globe size={20} /> },
            { id: 'f', label: 'Zeta', description: 'Sixth item', icon: <Globe size={20} /> },
            { id: 'g', label: 'Eta', description: 'Seventh item', icon: <Globe size={20} /> },
            { id: 'h', label: 'Theta', description: 'Eighth item', icon: <Globe size={20} /> },
            { id: 'i', label: 'Iota', description: 'Ninth item', icon: <Globe size={20} /> },
        ];
        vi.useFakeTimers();
        render(<CapabilityCatalog items={many} onSelect={() => {}} />);
        fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'epsilon' } });
        act(() => {
            vi.advanceTimersByTime(250);
        });
        expect(screen.queryByText('Alpha')).toBeNull();
        expect(screen.getByText('Epsilon')).toBeInTheDocument();
        vi.useRealTimers();
    });
});
