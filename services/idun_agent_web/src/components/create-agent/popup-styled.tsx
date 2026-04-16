import styled from 'styled-components';

export const SectionTitle = styled.h3`
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 600;
    color: #e1e4e8;
    text-align: center;
    font-family: 'IBM Plex Sans', sans-serif;
`;

export const SectionSubtitle = styled.p`
    margin: 0 0 32px 0;
    font-size: 14px;
    color: #8899a6;
    text-align: center;
    line-height: 1.5;
`;

export const UploadArea = styled.label`
    position: relative;
    display: block;
    border: 2px dashed rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 48px 32px;
    text-align: center;
    margin-bottom: 16px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        border-color: #0C5CAB;
        background: rgba(12, 92, 171, 0.05);
    }

    svg {
        color: #8899a6;
        margin-bottom: 16px;
    }
`;

export const UploadText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;

    strong {
        font-size: 16px;
        color: #e1e4e8;
    }

    span {
        font-size: 14px;
        color: #8899a6;
    }
`;

export const FileInfo = styled.div`
    text-align: center;
    margin-bottom: 24px;

    span {
        font-size: 12px;
        color: #8899a6;
    }
`;

export const RecommendedStructure = styled.div`
    background: rgba(12, 92, 171, 0.1);
    border: 1px solid #0C5CAB;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 32px;
    display: flex;
    align-items: center;
    gap: 12px;

    span {
        font-size: 14px;
        color: #e1e4e8;
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
    color: #e1e4e8;
    margin-bottom: 8px;
`;

export const Input = styled.input`
    width: 100%;
    padding: 12px 16px;
    background: rgba(12, 92, 171, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: #e1e4e8;
    font-size: 14px;
    box-sizing: border-box;

    &:focus {
        outline: none;
        border-color: #0C5CAB;
        box-shadow: 0 0 0 3px rgba(12, 92, 171, 0.3);
    }

    &::placeholder {
        color: #8899a6;
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
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: #8899a6;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'IBM Plex Sans', sans-serif;

    &:hover {
        background: rgba(12, 92, 171, 0.1);
        color: #e1e4e8;
    }
`;

export const PrimaryButton = styled.button`
    padding: 12px 24px;
    background: #0C5CAB;
    border: none;
    border-radius: 6px;
    color: #ffffff;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'IBM Plex Sans', sans-serif;

    &:hover {
        background: #0a4e94;
    }
`;

// Place RemoveFileButton here so it's in scope for JSX
export const RemoveFileButton = styled.button`
    margin-top: 16px;
    background: #ff4d4f;
    color: #e1e4e8;
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
