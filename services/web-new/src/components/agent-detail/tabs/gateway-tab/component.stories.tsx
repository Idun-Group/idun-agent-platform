import type { Meta, StoryObj } from '@storybook/react';
import GatewayTab from './component';

const meta: Meta<typeof GatewayTab> = {
    component: GatewayTab,
    title: 'Components/Agent Detail/Tabs/Gateway Tab',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof GatewayTab>;

export const Primary: Story = {
    args: {},
};
