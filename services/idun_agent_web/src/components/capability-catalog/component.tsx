import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
    Wrapper, HeaderRow, Label, SearchWrap, SearchInput,
    GroupBlock, GroupHeader, Grid, Card, CardTopRow, IconBox,
    CardTitle, CardDescription, SoonPill,
} from './styled';

export interface CapabilityItem {
    id: string;
    label: string;
    description: string;
    icon: ReactNode;
    group?: string;
    comingSoon?: boolean;
}

export interface CapabilityCatalogProps {
    items: ReadonlyArray<CapabilityItem>;
    label?: string;
    search?: boolean;
    searchPlaceholder?: string;
    onSelect: (id: string) => void;
    groupOrder?: ReadonlyArray<string>;
}

export const CapabilityCatalog = ({
    items,
    label = 'AVAILABLE',
    search,
    searchPlaceholder = 'Search…',
    onSelect,
    groupOrder,
}: CapabilityCatalogProps) => {
    const showSearch = search ?? items.length > 8;
    const [rawQuery, setRawQuery] = useState('');
    const [query, setQuery] = useState('');

    useEffect(() => {
        const id = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 200);
        return () => clearTimeout(id);
    }, [rawQuery]);

    const filtered = useMemo(() => {
        if (!query) return items;
        return items.filter(
            i =>
                i.label.toLowerCase().includes(query) ||
                i.description.toLowerCase().includes(query),
        );
    }, [items, query]);

    const grouped = useMemo(() => {
        const map = new Map<string | undefined, CapabilityItem[]>();
        for (const item of filtered) {
            const key = item.group;
            const list = map.get(key) ?? [];
            list.push(item);
            map.set(key, list);
        }
        const order: Array<string | undefined> = [];
        if (groupOrder) {
            for (const g of groupOrder) {
                if (map.has(g)) order.push(g);
            }
        } else {
            for (const k of map.keys()) order.push(k);
        }
        for (const k of map.keys()) {
            if (!order.includes(k)) order.push(k);
        }
        return order.map(k => ({ key: k, list: map.get(k) ?? [] }));
    }, [filtered, groupOrder]);

    const handleClick = (item: CapabilityItem) => {
        if (item.comingSoon) return;
        onSelect(item.id);
    };

    const handleKey = (e: React.KeyboardEvent, item: CapabilityItem) => {
        if (item.comingSoon) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(item.id);
        }
    };

    return (
        <Wrapper>
            <HeaderRow>
                <Label>{label}</Label>
                {showSearch && (
                    <SearchWrap>
                        <Search size={14} aria-hidden="true" />
                        <SearchInput
                            role="searchbox"
                            placeholder={searchPlaceholder}
                            value={rawQuery}
                            onChange={e => setRawQuery(e.target.value)}
                        />
                    </SearchWrap>
                )}
            </HeaderRow>

            {grouped.map(({ key, list }) => {
                const allDimmed = list.length > 0 && list.every(i => i.comingSoon);
                return (
                    <GroupBlock key={key ?? '__ungrouped__'}>
                        {key && <GroupHeader $allDimmed={allDimmed}>{key}</GroupHeader>}
                        <Grid>
                            {list.map(item => (
                                <Card
                                    key={item.id}
                                    role="button"
                                    aria-label={item.label}
                                    aria-disabled={item.comingSoon ? 'true' : undefined}
                                    tabIndex={0}
                                    $disabled={item.comingSoon}
                                    onClick={() => handleClick(item)}
                                    onKeyDown={e => handleKey(e, item)}
                                >
                                    {item.comingSoon && <SoonPill>Soon</SoonPill>}
                                    <CardTopRow>
                                        <IconBox>{item.icon}</IconBox>
                                        <CardTitle>{item.label}</CardTitle>
                                    </CardTopRow>
                                    <CardDescription>{item.description}</CardDescription>
                                </Card>
                            ))}
                        </Grid>
                    </GroupBlock>
                );
            })}
        </Wrapper>
    );
};
