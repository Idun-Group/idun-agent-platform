import type { Meta, StoryObj } from '@storybook/react';
import ActivityTab from './component';

const meta: Meta<typeof ActivityTab> = {
    component: ActivityTab,
    title: 'Components/Agent Detail/Tabs/Activity',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ActivityTab>;

export const Primary: Story = {
    args: {},
};
