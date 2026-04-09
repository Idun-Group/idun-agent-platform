import type { Meta, StoryObj } from '@storybook/react';
import OverviewTab from './component';

const meta: Meta<typeof OverviewTab> = {
    component: OverviewTab,
    title: 'Components/Agent Detail/Tabs/Overview',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof OverviewTab>;

export const Primary: Story = {
    args: {},
};
