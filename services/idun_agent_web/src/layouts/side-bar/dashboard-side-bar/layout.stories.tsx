import type { Meta, StoryObj } from '@storybook/react';
import { BrowserRouter } from 'react-router-dom';
import SideBar from './layout';

const meta: Meta<typeof SideBar> = {
    title: 'Layouts/SideBar',
    component: SideBar,
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Navigation sidebar with menu items for the Idun Engine dashboard. Features active state management and routing integration.',
            },
        },
    },
    decorators: [
        (Story) => (
            <BrowserRouter>
                <div style={{ height: '100vh' }}>
                    <Story />
                </div>
            </BrowserRouter>
        ),
    ],
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SideBar>;

export const Default: Story = {
    args: {},
    parameters: {
        docs: {
            description: {
                story: 'Default sidebar with all navigation items. Shows current active state based on route.',
            },
        },
    },
};
