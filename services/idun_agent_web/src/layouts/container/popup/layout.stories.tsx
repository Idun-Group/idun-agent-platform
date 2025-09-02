import type { Meta, StoryObj } from '@storybook/react';
import Popup from './layout';

const meta: Meta<typeof Popup> = {
    component: Popup,
    title: 'Layouts/Container/Popup',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Popup>;

export const Primary: Story = {
    args: {},
};
