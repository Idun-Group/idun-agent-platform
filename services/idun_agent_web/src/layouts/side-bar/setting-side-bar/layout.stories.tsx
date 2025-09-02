import type { Meta, StoryObj } from '@storybook/react';
import SettingSideBar from './layout';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../i18n';
import { SettingPageProvider } from '../../../hooks/use-settings-page';

const meta: Meta<typeof SettingSideBar> = {
    component: SettingSideBar,
    title: 'layouts/SettingSideBar',
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <I18nextProvider i18n={i18n}>
                <MemoryRouter>
                    <SettingPageProvider>
                        <Story />
                    </SettingPageProvider>
                </MemoryRouter>
            </I18nextProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof SettingSideBar>;

export const Primary: Story = {
    args: {},
};
