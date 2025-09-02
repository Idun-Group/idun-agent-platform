import type { Meta, StoryObj } from '@storybook/react';
import ProfileSettings from './component';

const meta: Meta<typeof ProfileSettings> = {
    component: ProfileSettings,
    title: 'Components/Settings/Profile',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ProfileSettings>;

export const Primary: Story = {
    args: {},
};
