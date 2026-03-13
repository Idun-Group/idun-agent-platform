import { getJson } from '../utils/api';

export type SearchResultItem = {
    id: string;
    name: string;
    resource_type: string;
    meta: string;
    project_id: string;
};

export type SearchResultGroup = {
    resource_type: string;
    label: string;
    total: number;
    items: SearchResultItem[];
};

export type SearchResponse = {
    groups: SearchResultGroup[];
};

export async function searchAll(q: string, limit?: number): Promise<SearchResponse> {
    const params = new URLSearchParams({ q });
    if (limit) params.set('limit', String(limit));
    return getJson<SearchResponse>(`/api/v1/search/?${params}`);
}
