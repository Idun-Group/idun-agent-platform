import type { Meta, StoryObj } from '@storybook/react';
import SourcePopup from './component';

const meta: Meta<typeof SourcePopup> = {
    component: SourcePopup,
    title: 'Components/Create Agent/Source Popup',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SourcePopup>;

export const Primary: Story = {
    args: {},
};
