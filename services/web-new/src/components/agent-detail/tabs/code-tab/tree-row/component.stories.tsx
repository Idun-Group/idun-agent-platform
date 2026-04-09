import type { Meta, StoryObj } from '@storybook/react';
import TreeRow from './component';

const meta: Meta<typeof TreeRow> = {
    component: TreeRow,
    title: 'Components/Agent Detail/Code/Tree Row',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof TreeRow>;

export const Primary: Story = {
    args: {
        node: { name: 'index.ts', path: 'src/index.ts', isDir: false },
        depth: 0,
        expanded: new Set<string>(),
        onToggle: () => {},
        onOpenFile: () => {},
        activePath: '',
    },
};
