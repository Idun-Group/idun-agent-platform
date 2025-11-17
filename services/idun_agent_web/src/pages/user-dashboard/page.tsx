import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import DataBoard from '../../layouts/data-board/layout';
import { Button } from '../../components/general/button/component';
import type { User } from '../../types/user.types';
import { UserDashboardLine } from '../../components/dashboard/users/user-dashboard-line/component';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/use-auth';
import { listUsers } from '../../utils/auth';
type UserDashboardProps = {
    // config your component props here
};

const UserDashboardPage = ({}: UserDashboardProps) => {
    const { t } = useTranslation();
    const { session, isLoading: isAuthLoading } = useAuth();

    const [users, setUsers] = useState<User[]>([]);
    const navigate = useNavigate();

    const fetchUsers = async () => {
        try {
            const data = await listUsers();
            setUsers(data);
        } catch (e) {
            console.error('Error fetching users:', e);
        }
    };

    useEffect(() => {
        void fetchUsers();
    }, []);

    const handleCreateUser = () => {
        navigate('/users/create');
    };
    const columns = [
        {
            id: 'name',
            label: t('users.column.name', 'Name'),
            width: 200,
            sortable: true,
        },
        // {
        //     id: 'lastName',
        //     label: t('users.column.lastName'),
        //     width: 200,
        //     sortable: true,
        // },
        {
            id: 'email',
            label: t('users.column.email', 'Email'),
            width: 250,
            sortable: true,
        },
        // {
        //     id: 'phone',
        //     label: t('users.column.phone'),
        //     width: 200,
        //     sortable: true,
        // },
        {
            id: 'roles',
            label: t('users.column.role', 'Role'),
            width: 150,
            sortable: true,
        },
        {
            id: 'actions',
            label: t('users.column.actions', 'Actions'),
            width: 150,
            sortable: false,
            alignment: 'center' as const,
        },
    ];

    // Admin check removed: all users can access this page for now

    return (
        <UserDashboardContainer>
            <DashboardHeader>
                <HeaderContent>
                    <Title>{t('users.title')}</Title>
                    <Description>{t('users.description')}</Description>
                </HeaderContent>
                <HeaderActions>
                    <Button
                        onClick={handleCreateUser}
                        $variants="colored"
                        $color="#47A13F4D"
                    >
                        {t('users.cta')}
                    </Button>
                </HeaderActions>
            </DashboardHeader>

            <DataBoardWrapper>
                <DataBoard
                    columns={columns}
                    data={users}
                    searchPlaceholder={t('users.search.placeholder')}
                    searchFields={[
                        'name',
                        // 'lastName',
                        'email',
                        // 'phone',
                        'roles',
                    ]}
                    showSearch={true}
                >
                    {({ paginatedData }) => (
                        <>
                            {paginatedData.map((user, id) => (
                                <UserDashboardLine key={id} user={user} />
                            ))}
                        </>
                    )}
                </DataBoard>
            </DataBoardWrapper>
        </UserDashboardContainer>
    );
};

// Styled Components
const UserDashboardContainer = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    background: hsl(var(--background));
    flex: 1;
`;

const DashboardHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 2rem 1.5rem 1rem 1.5rem;
    background: hsl(var(--background));
    border-bottom: 1px solid hsl(var(--border));
    flex-shrink: 0;
`;

const HeaderContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const Title = styled.h1`
    font-size: 2rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
`;

const Description = styled.p`
    font-size: 1rem;
    color: hsl(var(--muted-foreground));
    margin: 0;
`;

const HeaderActions = styled.div`
    display: flex;
    gap: 1rem;
    align-items: center;
`;

const DataBoardWrapper = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
`;

export default UserDashboardPage;
