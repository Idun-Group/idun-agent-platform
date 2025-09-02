import styled from 'styled-components';
import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Save, Download } from 'lucide-react';
import {
    loadZip,
    readText,
    writeText,
    makeZipBlob,
    buildTree,
} from '../../../../utils/zip-session';
import type { TreeNode } from '../../../../utils/zip-session';
import TreeRow from './tree-row/component';

type Props = {
    initialZipBlob?: Blob | Uint8Array; // <- ZIP déjà chargé côté parent
    initialZipUrl?: string; // <- ou bien URL (S3 presignée GET)
    onSaveZip?: (zipBlob: Blob) => void; // <- callback (PUT S3 côté parent)
};

function langFrom(path?: string) {
    const ext = (path ?? '').split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'ts':
        case 'tsx':
            return 'typescript';
        case 'js':
        case 'jsx':
            return 'javascript';
        case 'py':
            return 'python';
        case 'json':
            return 'json';
        case 'html':
            return 'html';
        case 'css':
            return 'css';
        case 'md':
            return 'markdown';
        case 'yml':
        case 'yaml':
            return 'yaml';
        default:
            return 'plaintext';
    }
}

export default function CodeZipEditor({
    initialZipBlob,
    initialZipUrl,
    onSaveZip,
}: Props) {
    const [files, setFiles] = useState<Map<string, Uint8Array> | null>(null);
    const [dirs, setDirs] = useState<Set<string>>(new Set());
    const [active, setActive] = useState<string | null>(null);
    const [value, setValue] = useState('');
    const [dirty, setDirty] = useState(false);

    const [treeRoots, setTreeRoots] = useState<TreeNode[]>([]);
    const [expanded, setExpanded] = useState<Set<string>>(new Set()); // chemins de dossiers ouverts

    const toggleExpand = (path: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    // largeur du panneau Explorer (px), persistée
    const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
        const v = localStorage.getItem('codezip.sidebarWidth');
        return v ? Math.max(200, Math.min(700, parseInt(v, 10))) : 280;
    });
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        localStorage.setItem('codezip.sidebarWidth', String(sidebarWidth));
    }, [sidebarWidth]);

    // Drag souris
    const onDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragging(true);
        const startX = e.clientX;
        const startW = sidebarWidth;

        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX;
            const next = Math.max(200, Math.min(700, startW + dx));
            setSidebarWidth(next);
        };
        const onUp = () => {
            setDragging(false);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    // Drag tactile
    const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        setDragging(true);
        const startX = e.touches[0].clientX;
        const startW = sidebarWidth;

        const onMove = (ev: TouchEvent) => {
            const dx = ev.touches[0].clientX - startX;
            const next = Math.max(200, Math.min(700, startW + dx));
            setSidebarWidth(next);
        };
        const onUp = () => {
            setDragging(false);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onUp);
            window.removeEventListener('touchcancel', onUp);
        };
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onUp);
        window.addEventListener('touchcancel', onUp);
    };

    // Détecte si un fichier est textuel selon son extension
    function isTextFile(path: string) {
        return /\.(js|ts|tsx|py|json|md|txt|html|css|yml|yaml)$/i.test(path);
    }

    // charge le ZIP fourni
    useEffect(() => {
        (async () => {
            let buf: Uint8Array | null = null;

            if (initialZipBlob instanceof Uint8Array) buf = initialZipBlob;
            else if (initialZipBlob instanceof Blob)
                buf = new Uint8Array(await initialZipBlob.arrayBuffer());
            else if (initialZipUrl) {
                const r = await fetch(initialZipUrl);
                const ab = await r.arrayBuffer();
                buf = new Uint8Array(ab);
            }

            if (!buf) return;
            const { files, dirs, tree } = loadZip(buf);
            setFiles(files);
            setDirs(dirs);

            const built = buildTree(tree); // tree vient déjà de loadZip (paths + isDir)
            setTreeRoots(built);
            setExpanded(
                new Set(built.filter((n) => n.isDir).map((n) => n.path))
            );

            const first = tree.find((n) => !n.isDir)?.path ?? null;
            setActive(first);
            setValue(
                first
                    ? isTextFile(first)
                        ? readText(files, first)
                        : 'Fichier binaire non affichable'
                    : ''
            );
            setDirty(false);
        })();
    }, [initialZipBlob, initialZipUrl]);

    const openPath = (p: string) => {
        if (!files) return;
        setActive(p);
        setValue(
            isTextFile(p)
                ? readText(files, p)
                : 'Fichier binaire non affichable'
        );
        setDirty(false);
    };

    const saveCurrent = () => {
        if (!files || !active) return;
        const next = new Map(files);
        writeText(next, active, value);
        setFiles(next);
        setDirty(false);
    };

    const downloadFile = () => {
        if (!active) return;
        const blob = new Blob([value], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = active.split('/').pop() || 'code.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportZip = () => {
        if (!files) return;
        const blob = makeZipBlob(files, dirs);
        if (onSaveZip) onSaveZip(blob); // parent fera PUT S3
        else {
            // fallback: download local
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'bundle.zip';
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    return (
        <Wrap>
            <Header>
                <Title>💾 Code de l’agent</Title>
                <Actions>
                    <Btn onClick={downloadFile} disabled={!active}>
                        <Download size={16} /> Télécharger fichier
                    </Btn>
                    <Btn $primary onClick={exportZip} disabled={!files}>
                        <Download size={16} /> Exporter ZIP
                    </Btn>
                    <Btn onClick={saveCurrent} disabled={!dirty}>
                        <Save size={16} />{' '}
                        {dirty ? 'Sauvegarder *' : 'Sauvegardé'}
                    </Btn>
                </Actions>
            </Header>

            <Body $dragging={dragging}>
                <Aside style={{ width: sidebarWidth }}>
                    <AsideTitle>Explorer</AsideTitle>
                    <List>
                        {treeRoots.map((n) => (
                            <TreeRow
                                key={n.path}
                                node={n}
                                depth={0}
                                expanded={expanded}
                                onToggle={toggleExpand}
                                onOpenFile={(p) =>
                                    !p.endsWith('/') && openPath(p)
                                }
                                activePath={active ?? ''}
                            />
                        ))}
                    </List>
                </Aside>

                {/* poignée de redimensionnement */}
                <Gutter
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Redimensionner l’explorateur"
                    tabIndex={0}
                    onMouseDown={onDragStart}
                    onTouchStart={onTouchStart}
                    onKeyDown={(e: { key: string }) => {
                        // accessibilité clavier : flèches ← → ajustent la largeur
                        if (e.key === 'ArrowLeft')
                            setSidebarWidth((w) => Math.max(200, w - 10));
                        if (e.key === 'ArrowRight')
                            setSidebarWidth((w) => Math.min(700, w + 10));
                    }}
                />

                <EditorBox>
                    <Editor
                        height="70vh"
                        language={langFrom(active ?? undefined)}
                        value={value}
                        onChange={(v) => {
                            setValue(v ?? '');
                            setDirty(true);
                        }}
                        theme="vs-dark"
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            lineNumbers: 'on',
                            automaticLayout: true,
                            wordWrap: 'on',
                            folding: true,
                            formatOnPaste: true,
                            formatOnType: true,
                        }}
                    />
                </EditorBox>
            </Body>
        </Wrap>
    );
}

// ----- styles (reprend ton style) -----
const Wrap = styled.div`
    flex: 1;
    padding: 40px;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
`;
const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--color-border-primary, #2a3f5f);
`;
const Title = styled.h2`
    font-size: 20px;
    font-weight: 600;
    margin: 0;
    color: var(--color-text-primary, #fff);
    display: flex;
    align-items: center;
    gap: 8px;
`;
const Actions = styled.div`
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
`;
const Btn = styled.button<{ $primary?: boolean }>`
    padding: 8px 16px;
    background: ${(p) =>
        p.$primary
            ? 'var(--color-primary,#8c52ff)'
            : 'var(--color-background-secondary,#1a1a2e)'};
    border: 1px solid
        ${(p) =>
            p.$primary
                ? 'var(--color-primary,#8c52ff)'
                : 'var(--color-border-primary,#2a3f5f)'};
    border-radius: 6px;
    color: ${(p) =>
        p.$primary ? '#fff' : 'var(--color-text-secondary,#8892b0)'};
    font-size: 14px;
    cursor: pointer;
    transition: 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
    &:hover:not(:disabled) {
        background: ${(p) =>
            p.$primary
                ? 'var(--color-primary-hover,#7c4aef)'
                : 'var(--color-background-tertiary,#2a3f5f)'};
        color: #fff;
        border-color: var(--color-primary, #8c52ff);
    }
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;
const AsideTitle = styled.div`
    padding: 10px 12px;
    font-weight: 600;
    border-bottom: 1px solid var(--color-border-primary, #2a3f5f);
    color: #fff;
`;
const List = styled.div`
    overflow: auto;
    padding: 8px;
`;

const Body = styled.div<{ $dragging?: boolean }>`
    display: flex;
    min-height: 0;
    height: 100%;
    gap: 0; /* le gutter a sa propre width */
    /* évite la sélection de texte pendant le drag */
    user-select: ${(p) => (p.$dragging ? 'none' : 'auto')};
`;

const Aside = styled.aside`
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 8px;
    overflow: hidden;
    background: #101423;
    display: flex;
    flex-direction: column;
    min-width: 200px;
    max-width: 700px;
`;

const Gutter = styled.div`
    width: 6px;
    cursor: col-resize;
    margin: 0 6px;
    align-self: stretch;
    position: relative;

    /* petite poignée visuelle */
    &::after {
        content: '';
        position: absolute;
        left: 2px;
        top: 50%;
        transform: translateY(-50%);
        width: 2px;
        height: 32px;
        border-radius: 2px;
        background: #3a3f5a;
    }

    &:hover::after,
    &:focus::after {
        background: #6b6f8a;
    }
`;

const EditorBox = styled.div`
    flex: 1;
    min-width: 0;
    background: #1e1e1e;
    border: 1px solid var(--color-border-primary, #2a3f5f);
    border-radius: 8px;
    overflow: hidden;

    .monaco-editor,
    .monaco-editor .margin,
    .monaco-editor-background {
        background: #1e1e1e !important;
    }
`;
