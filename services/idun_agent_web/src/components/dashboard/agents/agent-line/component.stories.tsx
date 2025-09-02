import type { Meta, StoryObj } from '@storybook/react';
import AgentLine from './component';
import { MemoryRouter } from 'react-router-dom';

const meta: Meta<typeof AgentLine> = {
    component: AgentLine,
    title: 'Components/Dashboard/Agent/Agent Line',
    tags: ['autodocs'],
    decorators: [(Story) => <MemoryRouter>{<Story />}</MemoryRouter>],
};

export default meta;
type Story = StoryObj<typeof AgentLine>;

export const Primary: Story = {
    args: {
        agent: {
            id: 'agent-1',
            status: 'deployed',
            name: 'Test Agent',
            description: 'A test agent for stories',
            framework_type: 'LANGGRAPH',
            source: { type: 'Git', path: '/repo' },
            config: {
                a2a: false,
                streaming: false,
                input: { schema: 'text' },
                output: { schema: 'text' },
                param1: '',
                param2: '',
            },
            langgraph_config: null,
            obervability: { type: 'LANGFUSE', param1: '', param2: '' },
            tools: ['Logger'],
        },
        columns: [
            {
                id: 'controls',
                label: 'Controls',
                width: 120,
                sortable: false,
                alignment: 'center',
            },
            {
                id: 'status',
                label: 'Status',
                width: 80,
                sortable: false,
                alignment: 'left',
            },
            {
                id: 'name',
                label: 'Name',
                width: 200,
                sortable: true,
                alignment: 'left',
            },
            {
                id: 'run',
                label: 'Runs',
                width: 120,
                sortable: true,
                alignment: 'left',
            },
            {
                id: 'avgTime',
                label: 'Avg Time',
                width: 120,
                sortable: true,
                alignment: 'left',
            },
            {
                id: 'errorRate',
                label: 'Error Rate',
                width: 120,
                sortable: true,
                alignment: 'left',
            },
            {
                id: 'framework',
                label: 'Framework',
                width: 120,
                sortable: true,
                alignment: 'left',
            },
            {
                id: 'actions',
                label: 'Actions',
                width: 160,
                sortable: false,
                alignment: 'center',
            },
        ],
    },
};
