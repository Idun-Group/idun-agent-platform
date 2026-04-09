import type { Meta, StoryObj } from '@storybook/react';
import { UserDashboardLine } from './component';

const meta: Meta<typeof UserDashboardLine> = {
    component: UserDashboardLine,
    title: 'Components/Dashboard/User/User Line',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof UserDashboardLine>;

export const Primary: Story = {
    args: {
        user: {
            id: 'user-1',
            firstName: 'Jane',
            lastName: 'Doe',
            username: 'jdoe',
            email: 'jane.doe@example.com',
            phone: '+1234567890',
            role: 'admin',
        },
    },
};
