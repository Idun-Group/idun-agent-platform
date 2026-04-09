import type { Meta, StoryObj } from '@storybook/react';
import CodeTab from './component';

const meta: Meta<typeof CodeTab> = {
    component: CodeTab,
    title: 'Components/Agent Detail/Tabs/Code',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CodeTab>;

export const Primary: Story = {
    args: {},
    render: () => (
        <div style={{ height: '85vh' }}>
            <CodeTab
                initialZipUrl="/example/project.zip"
                onSaveZip={(blob) => {
                    // pour la démo: on télécharge localement le ZIP reconstitué
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'bundle.zip';
                    a.click();
                    URL.revokeObjectURL(url);
                }}
            />
        </div>
    ),
};
