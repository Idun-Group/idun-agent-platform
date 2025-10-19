import type { Meta, StoryObj } from '@storybook/react';
import AgentInfo from './component';

const meta: Meta<typeof AgentInfo> = {
    component: AgentInfo,
    title: 'Components/Agent Detail/Agent Info',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof AgentInfo>;

export const Primary: Story = {
    args: {
        framework: 'Langraph',
        source: {
            type: 'github',
            url: 'https://github.com/example/repo',
            name: 'example/repo',
        },
        tools: ['Logger', 'HTTP Client'],
        lastRun: '2025-08-31 10:00',
        observability: ['logs', 'metrics'],
    },
};
