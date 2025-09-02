import type { Meta, StoryObj } from '@storybook/react';
import AppMarketplacePage from './page';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import { LoaderProvider } from '../../hooks/use-loader';

const meta: Meta<typeof AppMarketplacePage> = {
    component: AppMarketplacePage,
    title: 'Pages/App Marketplace',
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <I18nextProvider i18n={i18n}>
                <MemoryRouter>
                    <LoaderProvider>
                        <Story />
                    </LoaderProvider>
                </MemoryRouter>
            </I18nextProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof AppMarketplacePage>;

export const Primary: Story = {
    args: {},
};
