import type { Meta, StoryObj } from '@storybook/react';
import SecuritySettings from './component';

const meta: Meta<typeof SecuritySettings> = {
    component: SecuritySettings,
    title: 'Components/Settings/Security',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SecuritySettings>;

export const Primary: Story = {
    args: {},
};
