import type { Meta, StoryObj } from '@storybook/react';
import ServerLogsTab from './component';

const meta: Meta<typeof ServerLogsTab> = {
    title: 'Agent Detail/Tabs/ServerLogsTab',
    component: ServerLogsTab,
    parameters: {
        layout: 'fullscreen',
    },
    tags: ['autodocs'],
    argTypes: {
        agentId: {
            control: 'text',
            description: 'Agent ID to filter logs for'
        }
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        agentId: '0a1a303c-8547-45fd-ace5-8ddd6f3deff4'
    },
};

export const WithoutAgentId: Story = {
    args: {
        agentId: undefined
    },
};