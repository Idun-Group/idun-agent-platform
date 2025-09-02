import type { Meta, StoryObj } from '@storybook/react';
import AgentFormPage from './page';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import { AgentFileProvider } from '../../hooks/use-agent-file';
import { useEffect } from 'react';

const FetchFrameworksWrapper = ({ children }: { children: any }) => {
    useEffect(() => {
        const originalFetch = window.fetch;
        (window as any).fetch = (input: RequestInfo, init?: RequestInit) => {
            if (
                typeof input === 'string' &&
                input.includes('/api/v1/framework')
            ) {
                return Promise.resolve({
                    ok: true,
                    json: async () => [
                        { id: 'LANGGRAPH', name: 'Langraph' },
                        { id: 'PY', name: 'Python' },
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

const meta: Meta<typeof AgentFormPage> = {
    title: 'Pages/Agent Form',
    component: AgentFormPage,
    parameters: {
        layout: 'fullscreen',
    },
    decorators: [
        (Story) => (
            <I18nextProvider i18n={i18n}>
                <MemoryRouter>
                    <FetchFrameworksWrapper>
                        <AgentFileProvider>
                            <Story />
                        </AgentFileProvider>
                    </FetchFrameworksWrapper>
                </MemoryRouter>
            </I18nextProvider>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof AgentFormPage>;

export const Default: Story = {
    render: () => <AgentFormPage />,
};
