import type { Meta, StoryObj } from '@storybook/react';
import ConfigurationTab from './component';

const meta: Meta<typeof ConfigurationTab> = {
    component: ConfigurationTab,
    title: 'Components/Agent Detail/Tabs/Configuration',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ConfigurationTab>;

export const Primary: Story = {
    args: {},
};
