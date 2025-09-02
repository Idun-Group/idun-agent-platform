import type { Meta, StoryObj } from '@storybook/react';
import AppCard from './component';
import { LoaderProvider } from '../../../hooks/use-loader';

const meta: Meta<typeof AppCard> = {
    component: AppCard,
    title: 'Components/App Marketplace/App Card',
    tags: ['autodocs'],
    decorators: [(Story) => <LoaderProvider>{<Story />}</LoaderProvider>],
};

export default meta;
type Story = StoryObj<typeof AppCard>;

export const Primary: Story = {
    args: {
        app: {
            id: 1,
            name: 'Github',
            by: 'Github',
            urlConnector: 'https://github.com',
            description:
                'Import apps and connectors directly from GitHub repositories.',
            imageUrl:
                'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Github-desktop-logo-symbol.svg/2048px-Github-desktop-logo-symbol.svg.png',
            tag: 'Repository',
        },
    },
};
