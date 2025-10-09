import type { Meta, StoryObj } from '@storybook/react';
import LogsTab from './component';

const meta: Meta<typeof LogsTab> = {
    component: LogsTab,
    title: 'Components/Agent Detail/Tabs/Logs',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof LogsTab>;

export const Primary: Story = {
    args: {},
};
