import type { Meta, StoryObj } from '@storybook/react';
import UsageChart from './component';

const meta: Meta<typeof UsageChart> = {
    component: UsageChart,
    title: 'Components/Agent Detail/Usage Chart',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof UsageChart>;

export const Primary: Story = {
    args: {
        title: 'Weekly usage',
        data: [
            { date: 'Mon', success: 120, errors: 5, total: 125 },
            { date: 'Tue', success: 200, errors: 10, total: 210 },
            { date: 'Wed', success: 150, errors: 8, total: 158 },
            { date: 'Thu', success: 180, errors: 12, total: 192 },
            { date: 'Fri', success: 220, errors: 4, total: 224 },
        ],
    },
};
