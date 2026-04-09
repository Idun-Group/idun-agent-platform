import type { Meta, StoryObj } from '@storybook/react';
import { TextInput, FormTextArea, FormSelect, Form } from './component';

const meta: Meta<typeof TextInput> = {
    component: TextInput,
    title: 'Components/Bases/Form',
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
    },
};

export default meta;
type Story = StoryObj<typeof TextInput>;

export const TextInputExample: Story = {
    args: {
        label: "Nom de l'agent",
        placeholder: 'Mon premier agent',
        required: true,
    },
};

export const TextInputOptional: Story = {
    args: {
        label: 'Description optionnelle',
        placeholder: 'Une description...',
        required: false,
    },
};

export const EmailInput: Story = {
    args: {
        label: 'Email',
        type: 'email',
        placeholder: 'exemple@email.com',
        required: true,
    },
};

export const TextAreaExample: Story = {
    render: () => (
        <FormTextArea
            label="Description"
            placeholder="Une brève description de ce que fait votre agent"
            rows={4}
            required
        />
    ),
};

export const SelectExample: Story = {
    render: () => (
        <FormSelect label="Type de Framework">
            <option value="">Sélectionner un framework</option>
            <option value="default">Framework par défaut</option>
            <option value="custom">Framework personnalisé</option>
        </FormSelect>
    ),
};

export const CompleteForm: Story = {
    render: () => (
        <Form>
            <h2>Créer un nouvel agent</h2>
            <p>Configurez les paramètres et le comportement de votre agent</p>

            <TextInput
                label="Nom de l'agent"
                placeholder="Mon premier agent"
                required
            />

            <FormTextArea
                label="Description"
                placeholder="Une brève description de ce que fait votre agent"
                rows={4}
                required
            />

            <FormSelect label="Type de Framework">
                <option value="">Sélectionner un framework</option>
                <option value="default">Framework par défaut</option>
                <option value="custom">Framework personnalisé</option>
            </FormSelect>

            <TextInput
                label="URL du dépôt"
                type="url"
                placeholder="https://github.com/username/repo"
            />
        </Form>
    ),
};
