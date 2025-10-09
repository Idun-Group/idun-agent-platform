import type { Meta, StoryObj } from '@storybook/react';
import Downloader from './component';

const meta: Meta<typeof Downloader> = {
  component: Downloader,
  title: 'components/Downloader',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Downloader>;

export const Primary: Story = {
  args: {
  },
};
