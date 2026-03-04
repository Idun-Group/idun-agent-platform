import { useState, useEffect, useMemo, type FC, type KeyboardEvent, type FormEvent } from 'react';
import styled, { keyframes } from 'styled-components';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { createPrompt } from '../../../services/prompts';
import type { ManagedPrompt } from '../../../services/prompts';
import { extractVariables } from '../../../utils/jinja';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCreated: (prompt: ManagedPrompt) => void;
    initialPromptId?: string;
    initialContent?: string;
    lockPromptId?: boolean;
}

const CreatePromptModal: FC<Props> = ({ isOpen, onClose, onCreated, initialPromptId, initialContent, lockPromptId }) => {
    const [promptId, setPromptId] = useState('');
    const [content, setContent] = useState('');
    const [tagInput, setTagInput] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    const variables = useMemo(() => extractVariables(content), [content]);

    useEffect(() => {
        if (isOpen) {
            setPromptId(initialPromptId ?? '');
            setContent(initialContent ?? '');
            setTagInput('');
            setTags([]);
            setErrorMessage(null);
            setShowPreview(false);
        }
    }, [isOpen, initialPromptId, initialContent]);

    if (!isOpen) return null;

    const addTag = () => {
        const t = tagInput.trim();
        if (t && !tags.includes(t)) setTags([...tags, t]);
        setTagInput('');
    };

    const removeTag = (tag: string) => setTags(tags.filter(t => t !== tag));

    const handleTagKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); addTag(); }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!promptId.trim()) { setErrorMessage('Prompt ID is required'); return; }
        if (!content.trim()) { setErrorMessage('Content is required'); return; }

        setIsLoading(true);
        setErrorMessage(null);

        try {
            const created = await createPrompt({ prompt_id: promptId.trim(), content, tags });
            onCreated(created);
            onClose();
        } catch (err: unknown) {
            setErrorMessage(err instanceof Error ? err.message : 'Failed to create prompt');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Overlay onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <Modal>
                {isLoading && <Blocker><BigSpinner /></Blocker>}

                <Header>
                    <Title>{lockPromptId ? 'Update Prompt' : 'New Prompt'}</Title>
                    <CloseBtn type="button" onClick={onClose}>×</CloseBtn>
                </Header>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <FormBody>
                        {errorMessage && <ErrorMsg>{errorMessage}</ErrorMsg>}

                        <Field>
                            <Label htmlFor="prompt-id">
                                Prompt ID <Req>*</Req>
                            </Label>
                            <Input
                                id="prompt-id"
                                type="text"
                                placeholder="system-prompt"
                                value={promptId}
                                onChange={e => setPromptId(e.target.value)}
                                readOnly={lockPromptId}
                                style={lockPromptId ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                            />
                            <HelpText>Logical identifier. New versions auto-increment under this ID.</HelpText>
                        </Field>

                        <Field>
                            <ContentHeader>
                                <Label style={{ marginBottom: 0 }}>Content <Req>*</Req></Label>
                                <ViewToggle>
                                    <ToggleBtn $active={!showPreview} onClick={() => setShowPreview(false)}>Edit</ToggleBtn>
                                    <ToggleBtn $active={showPreview} onClick={() => setShowPreview(true)}>Preview</ToggleBtn>
                                </ViewToggle>
                            </ContentHeader>
                            {showPreview ? (
                                <PreviewWrap>
                                    {content ? <ReactMarkdown>{content}</ReactMarkdown> : <PreviewPlaceholder>Nothing to preview</PreviewPlaceholder>}
                                </PreviewWrap>
                            ) : (
                                <EditorWrap>
                                    <Editor
                                        height="220px"
                                        defaultLanguage="markdown"
                                        theme="vs-dark"
                                        value={content}
                                        onChange={(val) => setContent(val ?? '')}
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: 13,
                                            lineNumbers: 'off',
                                            wordWrap: 'on',
                                            scrollBeyondLastLine: false,
                                            padding: { top: 12 },
                                        }}
                                    />
                                </EditorWrap>
                            )}
                            {variables.length > 0 && (
                                <VarRow>
                                    <VarLabel>Variables:</VarLabel>
                                    {variables.map(v => (
                                        <VarPill key={v}>{'{{ ' + v + ' }}'}</VarPill>
                                    ))}
                                </VarRow>
                            )}
                        </Field>

                        <Field>
                            <Label>Tags</Label>
                            <Input
                                type="text"
                                placeholder="Add tag and press Enter"
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={handleTagKeyDown}
                            />
                            {tags.length > 0 && (
                                <TagList>
                                    {tags.map(tag => (
                                        <Tag key={tag}>
                                            {tag}
                                            <TagX onClick={() => removeTag(tag)}>×</TagX>
                                        </Tag>
                                    ))}
                                </TagList>
                            )}
                        </Field>
                    </FormBody>

                    <Footer>
                        <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
                        <SubmitBtn type="submit" disabled={isLoading}>
                            {isLoading && <BtnSpinner />}
                            {lockPromptId ? 'Update' : 'Create'}
                        </SubmitBtn>
                    </Footer>
                </form>
            </Modal>
        </Overlay>
    );
};

export default CreatePromptModal;

/* ── Styled ──────────────────────────────────────────────────────────────────── */

const spin = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 1001;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
`;

const Modal = styled.div`
    background: var(--color-surface, #1a1a2e);
    border-radius: 16px;
    width: 640px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    position: relative;
`;

const Header = styled.div`
    padding: 22px 24px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const Title = styled.h2`
    font-size: 16px;
    font-weight: 700;
    color: white;
    margin: 0;
`;

const CloseBtn = styled.button`
    background: rgba(255, 255, 255, 0.06);
    border: none;
    border-radius: 8px;
    width: 30px;
    height: 30px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    &:hover { background: rgba(255, 255, 255, 0.12); color: white; }
`;

const FormBody = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 24px;
`;

const Field = styled.div`
    margin-bottom: 20px;
`;

const Label = styled.label`
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    margin-bottom: 8px;
`;

const Req = styled.span`
    color: #f87171;
`;

const Input = styled.input`
    width: 100%;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    color: white;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
    &::placeholder { color: rgba(255, 255, 255, 0.25); }
    &:focus { border-color: hsl(262 83% 58% / 0.5); }
`;

const HelpText = styled.p`
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
    margin: 6px 0 0;
`;

const EditorWrap = styled.div`
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    overflow: hidden;
`;

const VarRow = styled.div`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
`;

const VarLabel = styled.span`
    font-size: 11px;
    color: rgba(255, 255, 255, 0.3);
`;

const VarPill = styled.span`
    font-size: 11px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    padding: 2px 8px;
    border-radius: 5px;
    background: rgba(140, 82, 255, 0.1);
    color: #a78bfa;
    border: 1px solid rgba(140, 82, 255, 0.18);
`;

const TagList = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
`;

const Tag = styled.span`
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 6px;
    background: rgba(140, 82, 255, 0.08);
    color: #a78bfa;
    border: 1px solid rgba(140, 82, 255, 0.15);
`;

const TagX = styled.button`
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0;
    font-size: 14px;
    line-height: 1;
    opacity: 0.5;
    transition: opacity 0.15s;
    &:hover { opacity: 1; }
`;

const ErrorMsg = styled.p`
    font-size: 13px;
    color: #f87171;
    margin: 0 0 16px;
    padding: 10px 14px;
    background: rgba(248, 113, 113, 0.08);
    border-radius: 10px;
    border: 1px solid rgba(248, 113, 113, 0.15);
`;

const Footer = styled.div`
    padding: 16px 24px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
`;

const CancelBtn = styled.button`
    padding: 9px 18px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    &:hover { background: rgba(255, 255, 255, 0.04); color: white; }
`;

const SubmitBtn = styled.button`
    padding: 9px 22px;
    background: #8c52ff;
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background 0.15s;
    &:disabled { opacity: 0.5; cursor: not-allowed; }
    &:hover:not(:disabled) { background: #7a47e6; }
`;

const BtnSpinner = styled.div`
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: ${spin} 0.7s linear infinite;
`;

const Blocker = styled.div`
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    z-index: 10;
`;

const BigSpinner = styled.div`
    width: 36px;
    height: 36px;
    border: 3px solid rgba(255, 255, 255, 0.15);
    border-top-color: #8c52ff;
    border-radius: 50%;
    animation: ${spin} 0.8s linear infinite;
`;

const ContentHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
`;

const ViewToggle = styled.div`
    display: flex;
    gap: 2px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
    padding: 2px;
`;

const ToggleBtn = styled.button.attrs({ type: 'button' })<{ $active: boolean }>`
    padding: 3px 12px;
    font-size: 11px;
    font-weight: 500;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s;
    background: ${p => p.$active ? 'rgba(140, 82, 255, 0.15)' : 'transparent'};
    color: ${p => p.$active ? '#a78bfa' : 'rgba(255, 255, 255, 0.35)'};
    &:hover { color: ${p => p.$active ? '#a78bfa' : 'rgba(255, 255, 255, 0.55)'}; }
`;

const PreviewWrap = styled.div`
    height: 220px;
    overflow-y: auto;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 14px 16px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.7;

    h1, h2, h3, h4 { color: white; margin: 0.5em 0 0.3em; }
    h1 { font-size: 1.3em; }
    h2 { font-size: 1.15em; }
    h3 { font-size: 1.05em; }
    p { margin: 0.4em 0; }
    code {
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 0.9em;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.06);
    }
    pre {
        background: rgba(0, 0, 0, 0.3);
        padding: 12px;
        border-radius: 8px;
        overflow-x: auto;
        code { padding: 0; background: none; }
    }
    ul, ol { padding-left: 1.4em; margin: 0.4em 0; }
    li { margin: 0.2em 0; }
    blockquote {
        border-left: 3px solid rgba(140, 82, 255, 0.3);
        padding-left: 12px;
        margin: 0.5em 0;
        color: rgba(255, 255, 255, 0.6);
    }
    a { color: #a78bfa; }
    hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 0.8em 0; }
`;

const PreviewPlaceholder = styled.p`
    color: rgba(255, 255, 255, 0.25);
    font-style: italic;
    margin: 0;
`;
