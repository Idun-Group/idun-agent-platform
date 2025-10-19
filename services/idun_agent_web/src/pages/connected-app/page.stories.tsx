import type { Meta, StoryObj } from '@storybook/react';
import ConnectedApp from './page';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import { LoaderProvider } from '../../hooks/use-loader';
import { Suspense } from 'react';

const meta: Meta<typeof ConnectedApp> = {
    component: ConnectedApp,
    title: 'Pages/Connected App',
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <I18nextProvider i18n={i18n}>
                <MemoryRouter>
                    <LoaderProvider>
                        <Suspense fallback={<div>Loading...</div>}>
                            <Story />
                        </Suspense>
                    </LoaderProvider>
                </MemoryRouter>
            </I18nextProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof ConnectedApp>;

export const Primary: Story = {
    args: {},
};
