import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './component';

const meta: Meta<typeof Button> = {
    component: Button,
    title: 'Components/Bases/Button',
    tags: ['autodocs'],
    argTypes: {
        $variants: {
            control: { type: 'select' },
            options: ['base', 'transparent', 'colored'],
        },
        $color: { control: 'color' },
        disabled: { control: 'boolean' },
        children: { control: 'text' },
    },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
    args: {
        children: 'Primary',
        $variants: 'base',
    },
};

export const Transparent: Story = {
    args: {
        children: 'Transparent',
        $variants: 'transparent',
    },
};

export const Colored: Story = {
    args: {
        children: 'Colored',
        $variants: 'colored',
        $color: '#ef4444',
    },
};

export const Disabled: Story = {
    args: {
        children: 'Disabled',
        $variants: 'base',
        disabled: true,
    },
};

export const CustomColor: Story = {
    args: {
        children: 'Custom',
        $variants: 'colored',
        $color: '#06b6d4',
    },
};
