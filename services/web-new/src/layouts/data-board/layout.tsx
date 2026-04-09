import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { DataBoardProps } from '../../types/agent.types';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon } from 'lucide-react';

interface DataBoardPropsWithChildren<T = any>
    extends Omit<DataBoardProps<T>, 'children'> {
    children: (props: {
        paginatedData: T[];
        startIndex: number;
        endIndex: number;
        columns: DataBoardProps<T>['columns'];
    }) => ReactNode;
    searchPlaceholder?: string;
    searchFields?: (keyof T)[];
    showSearch?: boolean;
}

const DataBoard = <T = any,>({
    columns,
    data,
    itemsPerPage = 10,
    showPagination = true,
    showSearch = true,
    searchPlaceholder = 'Search...',
    searchFields,
    children,
}: DataBoardPropsWithChildren<T>) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPageState, setItemsPerPageState] = useState(itemsPerPage);
    const [searchTerm, setSearchTerm] = useState('');
    const { t } = useTranslation();

    // Filtrage des données selon le terme de recherche
    const filteredData = useMemo(() => {
        if (!searchTerm.trim()) {
            return data;
        }

        const searchLower = searchTerm.toLowerCase();

        return data.filter((item) => {
            if (searchFields && searchFields.length > 0) {
                // Recherche dans les champs spécifiés uniquement
                return searchFields.some((field) => {
                    const value = item[field];
                    return (
                        value &&
                        String(value).toLowerCase().includes(searchLower)
                    );
                });
            } else {
                // Recherche dans tous les champs (avec vérification de type)
                return Object.entries(item as Record<string, any>).some(
                    ([, value]) =>
                        value &&
                        String(value).toLowerCase().includes(searchLower)
                );
            }
        });
    }, [data, searchTerm, searchFields]);

    // Calcul de la pagination sur les données filtrées
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPageState);

    // Reset de la page courante si la recherche change
    useMemo(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const startIndex = (currentPage - 1) * itemsPerPageState;
    const endIndex = Math.min(startIndex + itemsPerPageState, totalItems);
    const paginatedData = useMemo(
        () => filteredData.slice(startIndex, endIndex),
        [filteredData, startIndex, endIndex]
    );

    const goToPage = (page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    };

    const goToNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
        }
    };

    const goToPreviousPage = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
        }
    };

    const handleItemsPerPageChange = (newItemsPerPage: number) => {
        setItemsPerPageState(newItemsPerPage);
        setCurrentPage(1); // Reset to first page
    };

    return (
        <TableContainer>
            {/* Barre de recherche */}
            {showSearch && (
                <SearchContainer>
                    <SearchInput
                        type="text"
                        placeholder={searchPlaceholder}
                        value={searchTerm}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setSearchTerm(e.target.value)
                        }
                    />
                    <SearchIconWrapper>
                        <SearchIcon size={16} />
                    </SearchIconWrapper>
                </SearchContainer>
            )}

            {/* Info et contrôles */}
            {showPagination && (
                <TableControls>
                    <div className="total-info">
                        {t('pagination.showing', {
                            start: startIndex + 1,
                            end: endIndex,
                            total: totalItems,
                        })}
                    </div>
                    <ItemsPerPageSelector>
                        <label>{t('pagination.items-per-page')}</label>
                        <select
                            value={itemsPerPageState}
                            onChange={(e) =>
                                handleItemsPerPageChange(Number(e.target.value))
                            }
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                        </select>
                    </ItemsPerPageSelector>
                </TableControls>
            )}

            <TableWrapper>
                <TableScrollContainer>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {columns.map((column) => (
                                    <th
                                        key={column.id}
                                        data-column={column.id}
                                        style={{
                                            textAlign:
                                                column.alignment || 'left',
                                            width: column.width,
                                            minWidth: column.width,
                                        }}
                                    >
                                        {column.label}
                                    </th>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <tbody>
                            {children({
                                paginatedData,
                                startIndex,
                                endIndex,
                                columns,
                            })}
                            {paginatedData.length === 0 && (
                                <tr>
                                    <td colSpan={columns.length}>
                                        <EmptyState>
                                            {t('pagination.no-data')}
                                        </EmptyState>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </Table>
                </TableScrollContainer>
            </TableWrapper>

            {/* Contrôles de pagination */}
            {showPagination && totalPages > 1 && (
                <PaginationControls>
                    <PaginationInfo>
                        {t('pagination.showing', {
                            start: startIndex + 1,
                            end: endIndex,
                            total: totalItems,
                        })}
                    </PaginationInfo>
                    <PaginationButtons>
                        <PaginationButton
                            onClick={goToPreviousPage}
                            disabled={currentPage === 1}
                        >
                            ← {t('pagination.previous')}
                        </PaginationButton>

                        {/* Numéros de pages */}
                        {Array.from(
                            { length: Math.min(5, totalPages) },
                            (_, i) => {
                                let pageNumber;
                                if (totalPages <= 5) {
                                    pageNumber = i + 1;
                                } else if (currentPage <= 3) {
                                    pageNumber = i + 1;
                                } else if (currentPage >= totalPages - 2) {
                                    pageNumber = totalPages - 4 + i;
                                } else {
                                    pageNumber = currentPage - 2 + i;
                                }

                                return (
                                    <PageNumber
                                        key={pageNumber}
                                        onClick={() => goToPage(pageNumber)}
                                        $isActive={pageNumber === currentPage}
                                    >
                                        {pageNumber}
                                    </PageNumber>
                                );
                            }
                        )}

                        <PaginationButton
                            onClick={goToNextPage}
                            disabled={currentPage === totalPages}
                        >
                            {t('pagination.next')} →
                        </PaginationButton>
                    </PaginationButtons>
                </PaginationControls>
            )}
        </TableContainer>
    );
};

const TableContainer = styled.div`
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    overflow: hidden;
    background: #0a0e17;
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    font-family: 'IBM Plex Sans', sans-serif;
`;

const TableWrapper = styled.div`
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
`;

const TableScrollContainer = styled.div`
    flex: 1;
    overflow-y: auto;
    min-height: 0;

    &::-webkit-scrollbar {
        width: 8px;
    }

    &::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.03);
    }

    &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb:hover {
        background: #0C5CAB;
    }
`;

const Table = styled.table`
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    background: #0a0e17;
    color: #e1e4e8;

    tbody tr {
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        transition: background-color 0.2s ease;

        &:hover {
            background: rgba(12, 92, 171, 0.1);
        }

        &:last-child {
            border-bottom: none;
        }

        td {
            padding: 15px 25px;
            color: #e1e4e8;
            font-size: 0.875rem;
            vertical-align: middle;
            white-space: nowrap;
            overflow: visible;

            @media (max-width: 1024px) {
                padding: 15px;
            }
        }
    }
`;

const TableHeader = styled.thead`
    background: #0a0e17;
    color: #e1e4e8;
    position: sticky;
    top: 0;
    z-index: 10;

    @media (max-width: 1024px) {
        th[data-column='errorRate'],
        th[data-column='avgTime'] {
            display: none;
        }
    }

    @media (max-width: 768px) {
        th[data-column='framework'],
        th[data-column='a2a'] {
            display: none;
        }
    }
`;

const TableRow = styled.tr`
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);

    &:hover {
        background: rgba(12, 92, 171, 0.1);
    }

    th {
        padding: 14px 24px;
        text-align: left;
        font-weight: 600;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #8899a6;
        height: 44px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        white-space: nowrap;
        overflow: visible;

        @media (max-width: 1024px) {
            padding: 15px;
        }
    }
`;

const EmptyState = styled.div`
    text-align: center;
    padding: 2rem;
    color: #8899a6;
    font-size: 0.875rem;
`;

const TableControls = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    background: #0a0e17;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    color: #8899a6;
    font-size: 0.875rem;
    flex-shrink: 0;

    .total-info {
        font-weight: 500;
    }
`;

const ItemsPerPageSelector = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #8899a6;
    font-size: 0.875rem;

    label {
        font-weight: 500;
    }

    select {
        background: rgba(12, 92, 171, 0.1);
        color: #e1e4e8;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 0.25rem;
        padding: 0.25rem 0.5rem;
        font-size: 0.875rem;
        cursor: pointer;
        font-family: 'IBM Plex Sans', sans-serif;

        &:focus {
            outline: none;
            border-color: #0C5CAB;
        }

        option {
            background: #141a26;
            color: #e1e4e8;
        }
    }
`;

const PaginationControls = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    background: #0a0e17;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
`;

const PaginationInfo = styled.div`
    color: #8899a6;
    font-size: 0.875rem;
    font-weight: 500;
`;

const PaginationButtons = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
`;

const PaginationButton = styled.button<{ disabled?: boolean }>`
    background: ${(props) =>
        props.disabled ? 'rgba(255, 255, 255, 0.04)' : 'rgba(12, 92, 171, 0.1)'};
    color: ${(props) =>
        props.disabled
            ? '#8899a6'
            : '#e1e4e8'};
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.25rem;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
    transition: all 0.2s ease;
    font-family: 'IBM Plex Sans', sans-serif;

    &:hover:not(:disabled) {
        background: #0C5CAB;
        border-color: #0C5CAB;
        color: #ffffff;
    }

    &:focus {
        outline: none;
        border-color: #0C5CAB;
    }
`;

const PageNumber = styled.button<{ $isActive?: boolean }>`
    background: ${(props) => (props.$isActive ? '#0C5CAB' : 'rgba(12, 92, 171, 0.1)')};
    color: #e1e4e8;
    border: 1px solid ${(props) => (props.$isActive ? '#0C5CAB' : 'rgba(255, 255, 255, 0.08)')};
    border-radius: 0.25rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 2.5rem;
    font-family: 'IBM Plex Sans', sans-serif;

    &:hover {
        background: #0C5CAB;
        border-color: #0C5CAB;
    }

    &:focus {
        outline: none;
        border-color: #0C5CAB;
    }
`;

const SearchContainer = styled.div`
    padding: 1rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: #0a0e17;
    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
`;

const SearchInput = styled.input`
    width: 100%;
    padding: 0.75rem 1rem 0.75rem 2.5rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    background: #0a0e17;
    color: #e1e4e8;
    font-size: 0.875rem;
    transition: all 0.2s ease;
    font-family: 'IBM Plex Sans', sans-serif;

    &::placeholder {
        color: #8899a6;
    }

    &:focus {
        outline: none;
        border-color: #0C5CAB;
        box-shadow: 0 0 0 2px rgba(12, 92, 171, 0.2);
    }

    &:hover {
        border-color: rgba(12, 92, 171, 0.1);
    }
`;

const SearchIconWrapper = styled.div`
    position: absolute;
    left: 2.5rem;
    color: #8899a6;
    font-size: 1rem;
    pointer-events: none;
    z-index: 1;
`;

export default DataBoard;
