import type { Meta, StoryObj } from '@storybook/react';
import Loader from './component';

const meta: Meta<typeof Loader> = {
    component: Loader,
    title: 'Components/Bases/Loader',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Loader>;

export const Primary: Story = {
    args: {},
};
