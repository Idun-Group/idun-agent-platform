import type { Meta, StoryObj } from '@storybook/react';
import Header from './layout';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import { WorkspaceProvider } from '../../hooks/use-workspace';

const meta: Meta<typeof Header> = {
    component: Header,
    title: 'layouts/Header',
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <I18nextProvider i18n={i18n}>
                <MemoryRouter>
                    <WorkspaceProvider>
                        <Story />
                    </WorkspaceProvider>
                </MemoryRouter>
            </I18nextProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof Header>;

export const Primary: Story = {
    args: {},
};
