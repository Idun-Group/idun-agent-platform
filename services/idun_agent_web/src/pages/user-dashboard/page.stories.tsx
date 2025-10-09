import type { Meta, StoryObj } from '@storybook/react';
import UserDashboard from './page';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import { LoaderProvider } from '../../hooks/use-loader';
import { useEffect } from 'react';

const FetchUsersWrapper = ({ children }: { children: any }) => {
    useEffect(() => {
        const originalFetch = window.fetch;
        (window as any).fetch = (input: RequestInfo, init?: RequestInit) => {
            if (typeof input === 'string' && input.includes('/api/v1/users')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => [
                        {
                            id: '1',
                            firstName: 'Alice',
                            lastName: 'Smith',
                            username: 'alice',
                            email: 'alice@example.com',
                            phone: '+1234567890',
                            role: 'admin',
                        },
                        {
                            id: '2',
                            firstName: 'Bob',
                            lastName: 'Jones',
                            username: 'bobby',
                            email: 'bob@example.com',
                            phone: '+0987654321',
                            role: 'user',
                        },
                    ],
                } as any);
            }
            return originalFetch(input, init);
        };
        return () => {
            window.fetch = originalFetch;
        };
    }, []);
    return children;
};

const meta: Meta<typeof UserDashboard> = {
    component: UserDashboard,
    title: 'pages/UserDashboard',
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <I18nextProvider i18n={i18n}>
                <MemoryRouter>
                    <LoaderProvider>
                        <FetchUsersWrapper>
                            <Story />
                        </FetchUsersWrapper>
                    </LoaderProvider>
                </MemoryRouter>
            </I18nextProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof UserDashboard>;

export const Primary: Story = {
    args: {},
};
