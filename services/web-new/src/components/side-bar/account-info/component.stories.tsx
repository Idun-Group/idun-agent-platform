import type { Meta, StoryObj } from '@storybook/react';
import AccountInfo from './component';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../i18n';

const meta: Meta<typeof AccountInfo> = {
    component: AccountInfo,
    title: 'Components/Side Bar/Account Info',
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <I18nextProvider i18n={i18n}>
                <MemoryRouter>{<Story />}</MemoryRouter>
            </I18nextProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof AccountInfo>;

export const Primary: Story = {
    args: {},
};
