import type { Meta, StoryObj } from '@storybook/react';
import ToggleButton from './component';

const meta: Meta<typeof ToggleButton> = {
    component: ToggleButton,
    title: 'Components/Form/ToggleButton',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ToggleButton>;

export const Primary: Story = {
    args: {},
};
