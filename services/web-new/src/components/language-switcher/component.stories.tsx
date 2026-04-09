import type { Meta, StoryObj } from '@storybook/react';
import LanguageSwitcher from './component';

const meta: Meta<typeof LanguageSwitcher> = {
    component: LanguageSwitcher,
    title: 'components/LanguageSwitcher',
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
    },
};

export default meta;
type Story = StoryObj<typeof LanguageSwitcher>;

export const Default: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story: 'Composant de sélection de langue avec support français/anglais.',
            },
        },
    },
};

export const InDarkTheme: Story = {
    args: {},
    parameters: {
        backgrounds: {
            default: 'dark',
            values: [{ name: 'dark', value: '#030210' }],
        },
        docs: {
            description: {
                story: 'Affichage du sélecteur de langue sur fond sombre.',
            },
        },
    },
};
