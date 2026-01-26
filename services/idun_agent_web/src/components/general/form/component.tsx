import { forwardRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import styled from 'styled-components';
import ToggleButton from '../toggle-button/component';
import { Info, X } from 'lucide-react';

// Types
interface TextInputProps {
    label?: string;
    placeholder?: string;
    required?: boolean;
    nativeRequired?: boolean; // If set, overrides the default required behavior for the HTML input
    type?: 'text' | 'email' | 'password' | 'url' | 'tel' | 'search' | 'number';
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    id?: string;
    name?: string;
    error?: string;
    style?: React.CSSProperties;
    disabled?: boolean;
    autocomplete?: string;
    step?: string;
    min?: string;
    max?: string;
    tooltip?: string;
}

interface TextAreaProps {
    label?: string;
    placeholder?: string;
    required?: boolean;
    nativeRequired?: boolean;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    rows?: number;
    id?: string;
    name?: string;
    disabled?: boolean;
    tooltip?: string;
}

interface SelectProps {
    label?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    children: React.ReactNode;
    id?: string;
    name?: string;
    disabled?: boolean;
    tooltip?: string;
    required?: boolean;
    nativeRequired?: boolean;
}

interface TagInputProps {
    label?: string;
    placeholder?: string;
    required?: boolean;
    value?: string; // Newline separated string to maintain compatibility
    onChange?: (e: { target: { value: string } }) => void; // Mock event to maintain compatibility
    id?: string;
    name?: string;
    disabled?: boolean;
    tooltip?: string;
}

// Styled Components
const FormGroup = styled.div`
    margin-bottom: 24px;
    width: 100%;
`;

export const Label = styled.label`
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary, #ffffff);
    margin-bottom: 8px;
`;

const LabelContent = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
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

// Tooltip Components
const TooltipContainer = styled.div`
    position: relative;
    display: inline-flex;
    align-items: center;
    cursor: help;
`;

const TooltipContent = styled.div`
    visibility: hidden;
    width: max-content;
    max-width: 300px;
    background-color: #2a2a40;
    color: #fff;
    text-align: left;
    border-radius: 6px;
    padding: 8px 12px;
    position: absolute;
    z-index: 100;
    bottom: 125%;
    left: -10px;
    opacity: 0;
    transition: opacity 0.3s;
    font-size: 12px;
    font-weight: 400;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--color-border-primary, #2a3f5f);
    pointer-events: none;
    white-space: normal;

    /* Arrow */
    &::after {
        content: "";
        position: absolute;
        top: 100%;
        left: 17px;
        border-width: 5px;
        border-style: solid;
        border-color: #2a2a40 transparent transparent transparent;
    }

    ${TooltipContainer}:hover & {
        visibility: visible;
        opacity: 1;
    }
`;

const TooltipIcon = ({ text }: { text: string }) => (
    <TooltipContainer>
        <Info size={14} color="#a0a0a0" />
        <TooltipContent>{text}</TooltipContent>
    </TooltipContainer>
);

// Components
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
    (
        {
            label,
            placeholder,
            required,
            nativeRequired,
            type = 'text',
            value,
            onChange,
            id,
            name,
            error,
            disabled = false,
            autocomplete,
            style,
            step,
            min,
            max,
            tooltip,
        },
        ref
    ) => {
        return (
            <FormGroup style={style}>
                <Label htmlFor={id}>
                    <LabelContent>
                        {label}
                        {required && <Required>*</Required>}
                        {tooltip && <TooltipIcon text={tooltip} />}
                    </LabelContent>
                    <Input
                        ref={ref}
                        id={id}
                        name={name}
                        type={type}
                        placeholder={placeholder}
                        // Default native validation to disabled unless explicitly requested
                        required={nativeRequired === true}
                        value={value}
                        disabled={disabled}
                        onChange={onChange}
                        autoComplete={autocomplete}
                        step={step}
                        min={min}
                        max={max}
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
        { label, placeholder, required, nativeRequired, value, onChange, rows = 4, id, name, disabled, tooltip },
        ref
    ) => {
        return (
            <FormGroup>
                <Label htmlFor={id}>
                    <LabelContent>
                    {label}
                    {required && <Required>*</Required>}
                        {tooltip && <TooltipIcon text={tooltip} />}
                    </LabelContent>
                    <TextArea
                        ref={ref}
                        id={id}
                        name={name}
                        placeholder={placeholder}
                        // Default native validation to disabled unless explicitly requested
                        required={nativeRequired === true}
                        value={value}
                        onChange={onChange}
                        rows={rows}
                        disabled={disabled}
                    />
                </Label>
            </FormGroup>
        );
    }
);

FormTextArea.displayName = 'FormTextArea';

export const FormSelect = forwardRef<HTMLSelectElement, SelectProps>(
    ({ label, value, onChange, children, id, name, disabled, tooltip, required, nativeRequired }, ref) => {
        return (
            <FormGroup>
                <Label htmlFor={id}>
                    <LabelContent>
                    {label}
                        {required && <Required>*</Required>}
                        {tooltip && <TooltipIcon text={tooltip} />}
                    </LabelContent>
                    <Select
                        ref={ref}
                        id={id}
                        name={name}
                        value={value}
                        onChange={onChange}
                        disabled={disabled}
                        required={nativeRequired === true}
                    >
                        {children}
                    </Select>
                </Label>
            </FormGroup>
        );
    }
);

FormSelect.displayName = 'FormSelect';

export { FormTextArea as TextArea, FormSelect as Select };

// Tag/Badge Input Component
const TagContainer = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
    min-height: 48px;
    background: var(--color-background-primary, #0f1016);
    border: 1px solid var(--color-border-primary, #1a1a2e);
    border-radius: 8px;
    width: 100%;
    box-sizing: border-box;
    transition: all 0.2s ease;

    &:focus-within {
        border-color: var(--color-primary, #8c52ff);
        box-shadow: 0 0 0 3px rgba(140, 82, 255, 0.1);
    }
`;

const Tag = styled.div`
    display: inline-flex;
    align-items: center;
    background: rgba(140, 82, 255, 0.15);
    color: var(--color-text-primary, #ffffff);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 14px;
    border: 1px solid rgba(140, 82, 255, 0.3);

    .remove-icon {
        margin-left: 6px;
        cursor: pointer;
        opacity: 0.6;
        transition: opacity 0.2s;
        display: flex;
        align-items: center;

        &:hover {
            opacity: 1;
            color: #ff4757;
        }
    }
`;

const TagInputRaw = styled.input`
    background: transparent;
    border: none;
    color: var(--color-text-primary, #ffffff);
    font-size: 14px;
    flex: 1;
    min-width: 120px;
    padding: 4px 0;

    &:focus {
        outline: none;
    }

    &::placeholder {
        color: var(--color-text-tertiary, #64748b);
    }
`;

export const TagInput = ({
    label,
    placeholder,
    required,
    value,
    onChange,
    id,
    disabled,
    tooltip,
}: TagInputProps) => {
    const [inputValue, setInputValue] = useState('');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const tags = value ? value.split('\n').filter(t => t.trim() !== '') : [];

    // Add tag on Enter
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag(inputValue);
        } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
            // Remove last tag on backspace if input is empty
            removeTag(tags.length - 1);
        }
    };

    const addTag = (val: string) => {
        const trimmed = val.trim();
        if (trimmed && !tags.includes(trimmed)) {
            const newTags = [...tags, trimmed];
            updateParent(newTags);
            setInputValue('');
        } else if (trimmed) {
            setInputValue(''); // Clear duplicate but don't add
        }
    };

    const removeTag = (index: number) => {
        const newTags = tags.filter((_, i) => i !== index);
        updateParent(newTags);
    };

    const updateParent = (newTags: string[]) => {
        if (onChange) {
            // Join with newline to maintain compatibility with existing handlers
            onChange({ target: { value: newTags.join('\n') } });
        }
    };

    const handleEditStart = (index: number) => {
        if (!disabled) {
            setEditingIndex(index);
        }
    };

    const handleEditComplete = (index: number, newValue: string) => {
        const trimmed = newValue.trim();
        if (trimmed) {
            const newTags = [...tags];
            newTags[index] = trimmed;
            // Remove duplicates if editing resulted in one (except self)
            if (newTags.filter((t, i) => t === trimmed && i !== index).length === 0) {
                updateParent(newTags);
            } else {
               // If duplicate, revert or just remove? Let's just remove the edited one if it became duplicate
               removeTag(index);
            }
        } else {
            removeTag(index);
        }
        setEditingIndex(null);
    };

    return (
        <FormGroup>
            <Label htmlFor={id}>
                <LabelContent>
                    {label}
                    {required && <Required>*</Required>}
                    {tooltip && <TooltipIcon text={tooltip} />}
                </LabelContent>
                <TagContainer>
                    {tags.map((tag, index) => (
                        <Tag key={index} onDoubleClick={() => handleEditStart(index)}>
                            {editingIndex === index ? (
                                <TagInputRaw
                                    autoFocus
                                    defaultValue={tag}
                                    onBlur={(e) => handleEditComplete(index, e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleEditComplete(index, e.currentTarget.value);
                                        }
                                    }}
                                />
                            ) : (
                                <>
                                    <span>{tag}</span>
                                    {!disabled && (
                                        <div className="remove-icon" onClick={() => removeTag(index)}>
                                            <X size={12} />
                                        </div>
                                    )}
                                </>
                            )}
                        </Tag>
                    ))}
                    {!disabled && (
                        <TagInputRaw
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={tags.length === 0 ? placeholder : ''}
                            onBlur={() => {
                                if (inputValue.trim()) {
                                    addTag(inputValue);
                                }
                            }}
                        />
                    )}
                </TagContainer>
            </Label>
        </FormGroup>
    );
};

interface CheckboxProps {
    label?: string;
    checked?: boolean;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    id?: string;
    tooltip?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
    ({ label, checked, onChange, disabled, id, tooltip }, ref) => {
        return (
            <CheckboxContainer>
                <input
                    ref={ref}
                    type="checkbox"
                    id={id}
                    checked={checked}
                    onChange={onChange}
                    disabled={disabled}
                />
                {label && <span style={{marginLeft: '8px'}}>{label}</span>}
                {tooltip && <span style={{marginLeft: '6px'}}><TooltipIcon text={tooltip} /></span>}
            </CheckboxContainer>
        );
    }
);

Checkbox.displayName = 'Checkbox';

const CheckboxContainer = styled.label`
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--color-text-primary, #ffffff);
    font-size: 14px;

    input {
        accent-color: var(--color-primary, #8c52ff);
        width: 16px;
        height: 16px;
        cursor: pointer;
    }

    input:disabled {
        cursor: not-allowed;
        opacity: 0.6;
    }
`;

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
