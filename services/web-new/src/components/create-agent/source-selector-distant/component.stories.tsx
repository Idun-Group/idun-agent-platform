import type { Meta, StoryObj } from '@storybook/react';
import SourceSelectorDistant from './component';

const meta: Meta<typeof SourceSelectorDistant> = {
    component: SourceSelectorDistant,
    title: 'Components/Create Agent/Source Popup/Distant',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SourceSelectorDistant>;

export const Primary: Story = {
  args: {
  },
};
