import type { Meta, StoryObj } from '@storybook/react';
import LanguageSettings from './component';

const meta: Meta<typeof LanguageSettings> = {
    component: LanguageSettings,
    title: 'Components/Settings/Language',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof LanguageSettings>;

export const Primary: Story = {
    args: {},
};
