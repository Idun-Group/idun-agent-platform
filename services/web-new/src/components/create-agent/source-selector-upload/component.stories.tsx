import type { Meta, StoryObj } from '@storybook/react';
import SourceSelectorUpload from './component';

const meta: Meta<typeof SourceSelectorUpload> = {
    component: SourceSelectorUpload,
    title: 'Components/Create Agent/Source Popup/Upload',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SourceSelectorUpload>;

export const Primary: Story = {
    args: {},
};
