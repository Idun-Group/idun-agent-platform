import type { Meta, StoryObj } from '@storybook/react';
import NotificationSettings from './component';

const meta: Meta<typeof NotificationSettings> = {
    component: NotificationSettings,
    title: 'Components/Settings/Notification',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof NotificationSettings>;

export const Primary: Story = {
    args: {},
};
