import type { Meta, StoryObj } from '@storybook/react';
import MetricCard from './component';
import { Activity } from 'lucide-react';

const meta: Meta<typeof MetricCard> = {
    component: MetricCard,
    title: 'Components/Agent Detail/Metric Card',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MetricCard>;

export const Primary: Story = {
    args: {
        title: 'Total runs',
        value: '1,234',
        trend: '+12%',
        trendColor: 'green',
        icon: Activity,
    },
};
