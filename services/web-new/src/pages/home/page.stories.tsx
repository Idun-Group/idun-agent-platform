import type { Meta, StoryObj } from '@storybook/react';
import Home from './page';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';

const meta: Meta<typeof Home> = {
    component: Home,
    title: 'Pages/Home',
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <I18nextProvider i18n={i18n}>
                <MemoryRouter>
                    <Story />
                </MemoryRouter>
            </I18nextProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof Home>;

export const Primary: Story = {
    args: {},
};
