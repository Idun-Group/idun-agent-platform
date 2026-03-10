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

const PLACEHOLDER_CONTENT = `You are a helpful {{ role }} assistant.

Answer questions about {{ domain }} clearly and concisely.

## Guidelines
- Always cite your sources
- Stay on topic
- Be polite and professional`;

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
            setContent(initialContent ?? PLACEHOLDER_CONTENT);
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

    const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
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
        <Overlay
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            onKeyDown={handleOverlayKeyDown}
            role="dialog"
            aria-modal="true"
            aria-label={lockPromptId ? 'Update prompt' : 'Create prompt'}
        >
            <Modal>
                {isLoading && <Blocker><BigSpinner /></Blocker>}

                <Header>
                    <Title>{lockPromptId ? 'Update Prompt' : 'New Prompt'}</Title>
                    <CloseBtn type="button" onClick={onClose} aria-label="Close">×</CloseBtn>
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
                            <ContentHint>Create your prompt template. Use <code>{'{{variable}}'}</code> to insert variables into your prompt.</ContentHint>
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
                                            <TagX onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>×</TagX>
                                        </Tag>
                                    ))}
                                </TagList>
                            )}
                        </Field>
                    </FormBody>

                    <Footer>
                        <CancelBtn type="button" onClick={onClose}>Cancel</CancelBtn>
                        <SubmitBtn type="submit" disabled={isLoading} aria-label={lockPromptId ? 'Update prompt' : 'Create prompt'}>
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

const fadeIn = keyframes`
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
`;

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 1001;
    background: var(--overlay-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
`;

const Modal = styled.div`
    background: hsl(var(--card));
    border-radius: 16px;
    width: 640px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid var(--border-light);
    position: relative;
    animation: ${fadeIn} 0.15s ease;
`;

const Header = styled.div`
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const Title = styled.h2`
    font-size: 16px;
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0;
`;

const CloseBtn = styled.button`
    background: var(--overlay-light);
    border: none;
    border-radius: 8px;
    width: 30px;
    height: 30px;
    color: hsl(var(--text-secondary));
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    &:hover { background: var(--overlay-medium); color: hsl(var(--foreground)); }
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
    color: hsl(var(--text-secondary));
    margin-bottom: 8px;
`;

const Req = styled.span`
    color: hsl(var(--destructive));
`;

const Input = styled.input`
    width: 100%;
    padding: 10px 14px;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    color: hsl(var(--foreground));
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
    &::placeholder { color: hsl(var(--text-tertiary)); }
    &:focus { border-color: hsl(var(--primary) / 0.5); }
`;

const HelpText = styled.p`
    font-size: 12px;
    color: hsl(var(--text-tertiary));
    margin: 6px 0 0;
`;

const EditorWrap = styled.div`
    border: 1px solid var(--border-light);
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
    color: hsl(var(--text-tertiary));
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
    color: hsl(var(--destructive));
    margin: 0 0 16px;
    padding: 10px 14px;
    background: rgba(248, 113, 113, 0.08);
    border-radius: 10px;
    border: 1px solid rgba(248, 113, 113, 0.15);
`;

const Footer = styled.div`
    padding: 16px 24px 20px;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
`;

const CancelBtn = styled.button`
    padding: 9px 18px;
    background: transparent;
    border: 1px solid var(--border-medium);
    border-radius: 8px;
    color: hsl(var(--text-secondary));
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    &:hover { background: var(--overlay-subtle); color: hsl(var(--foreground)); }
`;

const SubmitBtn = styled.button`
    padding: 9px 22px;
    background: hsl(var(--primary));
    border: none;
    border-radius: 8px;
    color: hsl(var(--primary-foreground));
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: opacity 0.15s;
    &:disabled { opacity: 0.5; cursor: not-allowed; }
    &:hover:not(:disabled) { opacity: 0.88; }
`;

const BtnSpinner = styled.div`
    width: 14px;
    height: 14px;
    border: 2px solid hsl(var(--primary-foreground) / 0.3);
    border-top-color: hsl(var(--primary-foreground));
    border-radius: 50%;
    animation: ${spin} 0.7s linear infinite;
`;

const Blocker = styled.div`
    position: absolute;
    inset: 0;
    background: var(--overlay-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    z-index: 10;
`;

const BigSpinner = styled.div`
    width: 36px;
    height: 36px;
    border: 3px solid var(--border-light);
    border-top-color: hsl(var(--primary));
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
    background: var(--overlay-subtle);
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
    color: ${p => p.$active ? '#a78bfa' : 'hsl(var(--text-tertiary))'};
    &:hover { color: ${p => p.$active ? '#a78bfa' : 'hsl(var(--text-secondary))'}; }
`;

const PreviewWrap = styled.div`
    height: 220px;
    overflow-y: auto;
    background: var(--overlay-subtle);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 14px 16px;
    font-size: 14px;
    color: hsl(var(--foreground) / 0.85);
    line-height: 1.7;

    h1, h2, h3, h4 { color: hsl(var(--foreground)); margin: 0.5em 0 0.3em; }
    h1 { font-size: 1.3em; }
    h2 { font-size: 1.15em; }
    h3 { font-size: 1.05em; }
    p { margin: 0.4em 0; }
    code {
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 0.9em;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--overlay-light);
    }
    pre {
        background: var(--overlay-light);
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
        color: hsl(var(--text-secondary));
    }
    a { color: #a78bfa; }
    hr { border: none; border-top: 1px solid var(--border-light); margin: 0.8em 0; }
`;

const ContentHint = styled.p`
    font-size: 12px;
    color: hsl(var(--text-tertiary));
    margin: 2px 0 8px;
    code {
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 11px;
        padding: 1px 5px;
        border-radius: 3px;
        background: var(--overlay-light);
        color: hsl(var(--text-tertiary));
    }
`;

const PreviewPlaceholder = styled.p`
    color: hsl(var(--text-tertiary));
    font-style: italic;
    margin: 0;
`;
