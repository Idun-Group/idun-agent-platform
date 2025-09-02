import { forwardRef } from 'react';
import styled from 'styled-components';
import ToggleButton from '../toggle-button/component';

// Types
interface TextInputProps {
    label?: string;
    placeholder?: string;
    required?: boolean;
    type?: 'text' | 'email' | 'password' | 'url' | 'tel' | 'search';
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    id?: string;
    name?: string;
    error?: string;
    style?: React.CSSProperties;
    disabled?: boolean;
    autocomplete?: string;
}

interface TextAreaProps {
    label: string;
    placeholder?: string;
    required?: boolean;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    rows?: number;
    id?: string;
    name?: string;
}

interface SelectProps {
    label: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    children: React.ReactNode;
    id?: string;
    name?: string;
}

// Styled Components
const FormGroup = styled.div`
    margin-bottom: 24px;
    width: 100%;
`;

const Label = styled.label`
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary, #ffffff);
    margin-bottom: 8px;
`;

const Required = styled.span`
    color: #ff4757;
    font-weight: 500;
    margin-left: 4px;
`;

const Input = styled.input`
    width: 100%;
    padding: 16px 20px;
    background: var(--color-background-primary, #0f1016);
    border: 1px solid var(--color-border-primary, #1a1a2e);
    border-radius: 8px;
    color: var(--color-text-primary, #ffffff);
    font-size: 16px;
    transition: all 0.2s ease;
    box-sizing: border-box;

    &:focus {
        outline: none;
        border-color: var(--color-primary, #8c52ff);
        box-shadow: 0 0 0 3px rgba(140, 82, 255, 0.1);
    }

    &::placeholder {
        color: var(--color-text-tertiary, #64748b);
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.6;
    }
`;

const TextArea = styled.textarea`
    width: 100%;
    padding: 16px 20px;
    background: var(--color-background-primary, #0f1016);
    border: 1px solid var(--color-border-primary, #1a1a2e);
    border-radius: 8px;
    color: var(--color-text-primary, #ffffff);
    font-size: 16px;
    min-height: 120px;
    resize: vertical;
    font-family: inherit;
    transition: all 0.2s ease;
    box-sizing: border-box;

    &:focus {
        outline: none;
        border-color: var(--color-primary, #8c52ff);
        box-shadow: 0 0 0 3px rgba(140, 82, 255, 0.1);
    }

    &::placeholder {
        color: var(--color-text-tertiary, #64748b);
    }
`;

const Select = styled.select`
    width: 100%;
    padding: 16px 20px;
    background: var(--color-background-primary, #0f1016);
    border: 1px solid var(--color-border-primary, #1a1a2e);
    border-radius: 8px;
    color: var(--color-text-primary, #ffffff);
    font-size: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-sizing: border-box;

    &:focus {
        outline: none;
        border-color: var(--color-primary, #8c52ff);
        box-shadow: 0 0 0 3px rgba(140, 82, 255, 0.1);
    }

    option {
        background: var(--color-background-primary, #0f1016);
        color: var(--color-text-primary, #ffffff);
    }
`;

const ErrorText = styled.p`
    color: #ff4757;
    font-size: 12px;
    margin-top: 4px;
`;

// Components
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
    (
        {
            label,
            placeholder,
            required,
            type = 'text',
            value,
            onChange,
            id,
            name,
            error,
            disabled = false,
            autocomplete,
            style,
        },
        ref
    ) => {
        return (
            <FormGroup style={style}>
                <Label htmlFor={id}>
                    <span>
                        {label}
                        {required && <Required>*</Required>}
                    </span>
                    <Input
                        ref={ref}
                        id={id}
                        name={name}
                        type={type}
                        placeholder={placeholder}
                        required={required}
                        value={value}
                        disabled={disabled}
                        onChange={onChange}
                        autoComplete={autocomplete}
                    />
                </Label>

                {error && <ErrorText>{error}</ErrorText>}
            </FormGroup>
        );
    }
);

TextInput.displayName = 'TextInput';

export const FormTextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
    (
        { label, placeholder, required, value, onChange, rows = 4, id, name },
        ref
    ) => {
        return (
            <FormGroup>
                <Label htmlFor={id}>
                    {label}
                    {required && <Required>*</Required>}
                    <TextArea
                        ref={ref}
                        id={id}
                        name={name}
                        placeholder={placeholder}
                        required={required}
                        value={value}
                        onChange={onChange}
                        rows={rows}
                    />
                </Label>
            </FormGroup>
        );
    }
);

FormTextArea.displayName = 'FormTextArea';

export const FormSelect = forwardRef<HTMLSelectElement, SelectProps>(
    ({ label, value, onChange, children, id, name }, ref) => {
        return (
            <FormGroup>
                <Label htmlFor={id}>
                    {label}
                    <Select
                        ref={ref}
                        id={id}
                        name={name}
                        value={value}
                        onChange={onChange}
                    >
                        {children}
                    </Select>
                </Label>
            </FormGroup>
        );
    }
);

FormSelect.displayName = 'FormSelect';

// Form Container
export const Form = styled.form`
    max-width: 800px;
    margin: 0 auto;
    padding: 32px;
    background: var(--color-background-secondary, #1a1a2e);
    border-radius: 12px;
    border: 1px solid var(--color-border-primary, #2a3f5f);
    max-height: 65vh;
    overflow-y: auto;

    h1,
    h2,
    h3 {
        color: var(--color-text-primary, #ffffff);
        margin-bottom: 8px;
    }

    h1 {
        font-size: 28px;
        font-weight: 700;
    }

    h2 {
        font-size: 20px;
        font-weight: 600;
        margin-top: 32px;
        margin-bottom: 24px;
    }

    p {
        color: var(--color-text-secondary, #8892b0);
        margin-bottom: 32px;
        line-height: 1.5;
    }

    /* Style de la scrollbar pour navigateurs webkit */
    &::-webkit-scrollbar {
        width: 8px;
    }

    &::-webkit-scrollbar-track {
        background: var(--color-background-primary, #0f1016);
        border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb {
        background: var(--color-border-primary, #2a3f5f);
        border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb:hover {
        background: var(--color-primary, #8c52ff);
    }
`;

export const LabeledToggleButton = ({
    label,
    subLabel,
    isOn,
    onToggle,
}: {
    label: string;
    subLabel: string;
    isOn: boolean;
    onToggle: () => void;
}) => {
    return (
        <ToggleContainer>
            <div>
                <h3>{label}</h3>
                <p>{subLabel}</p>
            </div>
            <ToggleButton isOn={isOn} onToggle={onToggle} />
        </ToggleContainer>
    );
};

const ToggleContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;

    &:last-child {
        border-bottom: none;
    }
`;
