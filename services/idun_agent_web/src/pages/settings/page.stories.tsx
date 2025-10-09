import type { Meta, StoryObj } from '@storybook/react';
import SettingsPage from './page';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import { SettingPageProvider } from '../../hooks/use-settings-page';
import { LoaderProvider } from '../../hooks/use-loader';
import { Suspense } from 'react';

const meta: Meta<typeof SettingsPage> = {
    component: SettingsPage,
    title: 'Pages/Settings',
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <I18nextProvider i18n={i18n}>
                <MemoryRouter>
                    <LoaderProvider>
                        <SettingPageProvider>
                            <Suspense fallback={<div>Loading...</div>}>
                                <Story />
                            </Suspense>
                        </SettingPageProvider>
                    </LoaderProvider>
                </MemoryRouter>
            </I18nextProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof SettingsPage>;

export const Primary: Story = {
    args: {},
};
