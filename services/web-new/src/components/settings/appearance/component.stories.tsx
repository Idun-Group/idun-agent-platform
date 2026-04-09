import type { Meta, StoryObj } from '@storybook/react';
import AppearanceSettings from './component';

const meta: Meta<typeof AppearanceSettings> = {
    component: AppearanceSettings,
    title: 'Components/Settings/Appearance',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof AppearanceSettings>;

export const Primary: Story = {
    args: {},
};
