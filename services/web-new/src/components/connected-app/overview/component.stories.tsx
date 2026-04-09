import type { Meta, StoryObj } from '@storybook/react';
import Overview from './component';
import { MemoryRouter } from 'react-router-dom';

const meta: Meta<typeof Overview> = {
    component: Overview,
    title: 'Components/Connecte dApp/Overview',
    tags: ['autodocs'],
    decorators: [(Story) => <MemoryRouter>{<Story />}</MemoryRouter>],
};

export default meta;
type Story = StoryObj<typeof Overview>;

export const Primary: Story = {
    args: {},
};
