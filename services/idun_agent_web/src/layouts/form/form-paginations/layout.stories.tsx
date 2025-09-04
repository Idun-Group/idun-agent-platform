import type { Meta, StoryObj } from '@storybook/react';
import FormPaginations from './layout';

const meta: Meta<typeof FormPaginations> = {
    component: FormPaginations,
    title: 'Layouts/Form/FormPaginations',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FormPaginations>;

export const Primary: Story = {
    args: {},
};
