import type { Meta, StoryObj } from '@storybook/react';
import AgentDashboard from './page';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import { useEffect } from 'react';

const FetchMockWrapper = ({ children }: { children: any }) => {
    useEffect(() => {
        const originalFetch = window.fetch;
        // simple mock that returns an empty array for agents
        // shape matches the page expecting an array of agents
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).fetch = () =>
            Promise.resolve({ ok: true, json: async () => [] } as any);
        return () => {
            window.fetch = originalFetch;
        };
    }, []);

    return children;
};

const meta: Meta<typeof AgentDashboard> = {
    component: AgentDashboard,
    title: 'pages/Agent Dashboard',
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <I18nextProvider i18n={i18n}>
                <MemoryRouter>
                    <FetchMockWrapper>
                        <Story />
                    </FetchMockWrapper>
                </MemoryRouter>
            </I18nextProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof AgentDashboard>;

export const Primary: Story = {
    args: {},
};
