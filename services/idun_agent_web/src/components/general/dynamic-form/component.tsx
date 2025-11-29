import React from 'react';
import styled from 'styled-components';
import Editor from '@monaco-editor/react';
import { 
    FormSelect,
    TextInput
} from '../form/component';

// Helper to resolve $ref in OpenAPI schema
const resolveRef = (ref: string, schema: any) => {
    if (!ref.startsWith('#/')) return null;
    const parts = ref.split('/').slice(1); // remove #
    let current = schema;
    for (const part of parts) {
        current = current[part];
        if (!current) return null;
    }
    return current;
};

interface DynamicFormProps {
    schema: any; // The specific definition for the agent type (e.g. LangGraphAgentConfig)
    rootSchema: any; // The full OpenAPI schema (for resolving refs)
    data: any;
    onChange: (newData: any) => void;
    errors?: Record<string, string | null>;
    excludeFields?: string[]; // Fields to skip rendering
}

const FieldWrapper = styled.div`
    width: 100%;
    margin-bottom: 16px;
`;

const InputLabel = styled.label`
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #9ca3af;
    text-transform: uppercase;
    margin-bottom: 8px;
`;

const RequiredAsterisk = styled.span`
    color: #ef4444;
    margin-left: 4px;
`;

const EditorWrapper = styled.div`
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    overflow: hidden;
    background-color: #0B0A15;
    min-height: 200px;
    height: 300px;
`;

const ErrorMessage = styled.p`
    margin-top: 8px;
    margin-bottom: 0;
    font-size: 14px;
    font-family: inherit;
    font-weight: 400;
    color: #ff4757;
    line-height: 1.5;
`;

const SectionTitle = styled.h3`
    font-size: 14px;
    font-weight: 700;
    color: white;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    margin-bottom: 16px;
    margin-top: 24px;
`;

const SectionIndicator = styled.span<{ $color?: string }>`
    width: 4px;
    height: 16px;
    background-color: ${props => props.$color || '#8c52ff'};
    border-radius: 9999px;
    margin-right: 8px;
`;

export const DynamicForm: React.FC<DynamicFormProps> = ({ schema, rootSchema, data, onChange, errors, excludeFields = [] }) => {
    if (!schema || !schema.properties) return null;

    const handleChange = (key: string, value: any) => {
        onChange({
            ...data,
            [key]: value
        });
    };

    const renderField = (key: string, prop: any) => {
        // Resolve Ref if present
        if (prop.$ref) {
            const resolved = resolveRef(prop.$ref, rootSchema);
            if (resolved) {
                return renderObjectField(key, resolved);
            }
        }

        // Handle anyOf/allOf (simplified)
        if (prop.anyOf) {
            // Often used for nullable fields (type | null)
            const nonNullType = prop.anyOf.find((t: any) => t.type !== 'null');
            if (nonNullType) {
                if (nonNullType.$ref) {
                     const resolved = resolveRef(nonNullType.$ref, rootSchema);
                     if (resolved) return renderObjectField(key, resolved);
                }
                return renderField(key, nonNullType);
            }
        }

        const label = prop.title || key.replace(/_/g, ' ');
        const description = prop.description || '';
        const isRequired = schema.required?.includes(key);

        // Special Handling based on key names or types
        
        // 1. Enums -> Select
        if (prop.enum) {
            return (
                <FieldWrapper key={key}>
                    <InputLabel>{label}{isRequired && <RequiredAsterisk>*</RequiredAsterisk>}</InputLabel>
                    <FormSelect
                        value={data[key] || ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        tooltip={description}
                    >
                        <option value="">Select...</option>
                        {prop.enum.map((val: string) => (
                            <option key={val} value={val}>{val}</option>
                        ))}
                    </FormSelect>
                    {errors?.[key] && <ErrorMessage>{errors[key]}</ErrorMessage>}
                </FieldWrapper>
            );
        }

        // 2. Booleans -> Checkbox (or Select for now to match style)
        if (prop.type === 'boolean') {
             return (
                <FieldWrapper key={key}>
                    <InputLabel>{label}{isRequired && <RequiredAsterisk>*</RequiredAsterisk>}</InputLabel>
                    <FormSelect
                        value={data[key] === undefined ? '' : String(data[key])}
                        onChange={(e) => handleChange(key, e.target.value === 'true')}
                        tooltip={description}
                    >
                        <option value="">Select...</option>
                        <option value="true">True</option>
                        <option value="false">False</option>
                    </FormSelect>
                </FieldWrapper>
            );
        }

        // 3. JSON Objects (Schema Definitions, Stores) -> Monaco Editor
        // But NOT graph_definition or component_definition which are simple strings
        if ((prop.type === 'object' || key.includes('schema_definition') || key === 'store') && key !== 'graph_definition' && key !== 'component_definition') {
             // Determine if it's a specific object type we know how to render, or just a blob
             // For input/output schema and store, we want JSON editor
             const value = typeof data[key] === 'object' ? JSON.stringify(data[key], null, 2) : (data[key] || '');
             
             return (
                <FieldWrapper key={key}>
                    <InputLabel>{label} (JSON){isRequired && <RequiredAsterisk>*</RequiredAsterisk>}</InputLabel>
                    <EditorWrapper>
                        <Editor
                            height="100%"
                            language="json"
                            theme="vs-dark"
                            value={value}
                            onChange={(val) => {
                                // If the schema explicitly defines it as a string, keep it as a string
                                // regardless of whether it looks like JSON.
                                if (prop.type === 'string') {
                                    handleChange(key, val);
                                    return;
                                }

                                try {
                                    // Try to parse to store as object if valid
                                    if (!val) {
                                        handleChange(key, null);
                                    } else {
                                        const parsed = JSON.parse(val);
                                        handleChange(key, parsed);
                                    }
                                } catch (e) {
                                    // If parsing fails, store as string?
                                    // But if it's supposed to be an object, this might be invalid state.
                                    // However, for user experience, we might let them type until valid.
                                    // But here we are assuming if it's NOT a string type, it IS an object type (or anyOf object).
                                    // So we probably shouldn't set invalid string to object field unless we handle it.
                                    // For now, let's keep previous behavior for non-string types: 
                                    // if it fails parse, it might not update or update as string (which will fail validation later).
                                    console.warn('Invalid JSON entered for object field');
                                }
                            }}
                            options={{
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                formatOnPaste: true,
                                formatOnType: true,
                                automaticLayout: true,
                                wordWrap: 'on',
                                lineNumbers: 'off',
                            }}
                        />
                    </EditorWrapper>
                    <p style={{fontSize: '10px', color: '#6b7280', marginTop: '4px'}}>{description}</p>
                    {errors?.[key] && <ErrorMessage>{errors[key]}</ErrorMessage>}
                </FieldWrapper>
             );
        }

        // 4. Strings -> Text Input
        if (prop.type === 'string') {
            return (
                <FieldWrapper key={key}>
                    <TextInput
                        label={label}
                        required={isRequired}
                        value={data[key] || ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        tooltip={description}
                        placeholder={prop.example || `Enter ${label}`}
                    />
                    {errors?.[key] && <ErrorMessage>{errors[key]}</ErrorMessage>}
                </FieldWrapper>
            );
        }

        // 5. Numbers -> Text Input (type=number)
        if (prop.type === 'integer' || prop.type === 'number') {
            return (
                <FieldWrapper key={key}>
                    <TextInput
                        label={label}
                        required={isRequired}
                        type="number"
                        value={data[key] || ''}
                        onChange={(e) => handleChange(key, Number(e.target.value))}
                        tooltip={description}
                    />
                    {errors?.[key] && <ErrorMessage>{errors[key]}</ErrorMessage>}
                </FieldWrapper>
            );
        }

        return null;
    };

    const renderObjectField = (key: string, schemaDef: any) => {
        // If it's a nested object like Checkpointer or Observability
        // We render a subsection
        
        if (excludeFields.includes(key)) return null;

        if (key === 'observability') {
            // Observability might need special handling to match the existing UI
            // or we can render it dynamically if the schema allows
            return null; // Skip observability here, handled separately or via specific logic if desired
        }

        const title = schemaDef.title || key;
        
        return (
            <div key={key} style={{ width: '100%' }}>
                <SectionTitle>
                    <SectionIndicator $color="emerald" /> {title}
                </SectionTitle>
                <div style={{ paddingLeft: '12px', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                    <DynamicForm 
                        schema={schemaDef} 
                        rootSchema={rootSchema} 
                        data={data[key] || {}} 
                        onChange={(subData) => handleChange(key, subData)}
                        errors={errors} // Would need nested error handling
                        excludeFields={excludeFields}
                    />
                </div>
            </div>
        );
    };

    // Prioritize required fields first, then name, then the rest
    const keys = Object.keys(schema.properties);
    const requiredFields = schema.required || [];
    
    const orderedKeys = keys.sort((a, b) => {
        const aRequired = requiredFields.includes(a);
        const bRequired = requiredFields.includes(b);
        
        // Both required or both optional - sort by name priority then alphabetically
        if (aRequired === bRequired) {
            if (a === 'name') return -1;
            if (b === 'name') return 1;
            return 0;
        }
        
        // Required fields come first
        return aRequired ? -1 : 1;
    });

    return (
        <>
            {orderedKeys.map(key => {
                if (excludeFields.includes(key)) return null;
                if (key === 'observability') return null; // Handled outside or strictly skipped
                return renderField(key, schema.properties[key]);
            })}
        </>
    );
};
