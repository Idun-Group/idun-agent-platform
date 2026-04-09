import type { Meta, StoryObj } from '@storybook/react';
import SourceSelectorGithub from './component';

const meta: Meta<typeof SourceSelectorGithub> = {
    component: SourceSelectorGithub,
    title: 'Components/Create Agent/Source Popup/Github',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SourceSelectorGithub>;

export const Primary: Story = {
    args: {},
};
