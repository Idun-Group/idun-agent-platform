import type { Meta, StoryObj } from '@storybook/react';
import SourceSelectorModel from './component';

const meta: Meta<typeof SourceSelectorModel> = {
    component: SourceSelectorModel,
    title: 'Components/Create Agent/Source Popup/Model',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SourceSelectorModel>;

export const Primary: Story = {
    args: {},
};
