import styled from 'styled-components';

export const SectionTitle = styled.h3`
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 600;
    color: hsl(var(--foreground));
    text-align: center;
`;

export const SectionSubtitle = styled.p`
    margin: 0 0 32px 0;
    font-size: 14px;
    color: hsl(var(--muted-foreground));
    text-align: center;
    line-height: 1.5;
`;

export const UploadArea = styled.label`
    position: relative;
    display: block;
    border: 2px dashed hsl(var(--border));
    border-radius: 8px;
    padding: 48px 32px;
    text-align: center;
    margin-bottom: 16px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        border-color: hsl(var(--primary));
        background: rgba(140, 82, 255, 0.05);
    }

    svg {
        color: hsl(var(--muted-foreground));
        margin-bottom: 16px;
    }
`;

export const UploadText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;

    strong {
        font-size: 16px;
        color: hsl(var(--foreground));
    }

    span {
        font-size: 14px;
        color: hsl(var(--muted-foreground));
    }
`;

export const FileInfo = styled.div`
    text-align: center;
    margin-bottom: 24px;

    span {
        font-size: 12px;
        color: hsl(var(--muted-foreground));
    }
`;

export const RecommendedStructure = styled.div`
    background: rgba(140, 82, 255, 0.1);
    border: 1px solid hsl(var(--primary));
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 32px;
    display: flex;
    align-items: center;
    gap: 12px;

    span {
        font-size: 14px;
        color: hsl(var(--foreground));
    }
`;

export const WarningIcon = styled.div`
    font-size: 18px;
`;

export const FormGroup = styled.div`
    margin-bottom: 20px;
`;

export const Label = styled.label`
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--foreground));
    margin-bottom: 8px;
`;

export const Input = styled.input`
    width: 100%;
    padding: 12px 16px;
    background: hsl(var(--accent));
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    color: hsl(var(--foreground));
    font-size: 14px;
    box-sizing: border-box;

    &:focus {
        outline: none;
        border-color: hsl(var(--primary));
        box-shadow: 0 0 0 3px rgba(140, 82, 255, 0.1);
    }

    &::placeholder {
        color: hsl(var(--muted-foreground));
    }
`;

export const TemplateGrid = styled.div`
    display: grid;
    gap: 16px;
    margin-bottom: 32px;
`;

export const ButtonGroup = styled.div`
    display: flex;
    gap: 16px;
    justify-content: flex-end;
`;

export const SecondaryButton = styled.button`
    padding: 12px 24px;
    background: transparent;
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    color: hsl(var(--muted-foreground));
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        background: hsl(var(--accent));
        color: hsl(var(--foreground));
    }
`;

export const PrimaryButton = styled.button`
    padding: 12px 24px;
    background: hsl(var(--primary));
    border: none;
    border-radius: 6px;
    color: hsl(var(--foreground));
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        background: hsl(var(--primary) / 0.85);
    }
`;

// Place RemoveFileButton here so it's in scope for JSX
export const RemoveFileButton = styled.button`
    margin-top: 16px;
    background: #ff4d4f;
    color: hsl(var(--foreground));
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.2s;
    &:hover {
        background: #d9363e;
    }
`;
