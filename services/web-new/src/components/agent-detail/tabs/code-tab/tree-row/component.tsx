import styled from 'styled-components';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import type { TreeNode } from '../../../../../utils/zip-session';

function TreeRow({
    node,
    depth,
    expanded,
    onToggle,
    onOpenFile,
    activePath,
}: {
    node: TreeNode;
    depth: number;
    expanded: Set<string>;
    onToggle: (p: string) => void;
    onOpenFile: (p: string) => void;
    activePath: string;
}) {
    const isOpen = node.isDir ? expanded.has(node.path) : false;
    const padding = 8 + depth * 14;

    if (node.isDir) {
        return (
            <>
                <Item
                    $dir
                    $active={false}
                    style={{ paddingLeft: padding }}
                    onClick={() => onToggle(node.path)}
                    title={node.path + '/'}
                >
                    {isOpen ? (
                        <ChevronDown size={14} />
                    ) : (
                        <ChevronRight size={14} />
                    )}
                    <Folder size={14} />
                    <span>{node.name}</span>
                </Item>
                {isOpen &&
                    (node.children ?? []).map((child) => (
                        <TreeRow
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            expanded={expanded}
                            onToggle={onToggle}
                            onOpenFile={onOpenFile}
                            activePath={activePath}
                        />
                    ))}
            </>
        );
    }

    return (
        <Item
            $active={activePath === node.path}
            style={{ paddingLeft: padding }}
            onClick={() => onOpenFile(node.path)}
            title={node.path}
        >
            <FileText size={14} />
            <span>{node.name}</span>
        </Item>
    );
}

export default TreeRow;

const Item = styled.div<{ $active?: boolean; $dir?: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    color: ${(p) => (p.$dir ? '#8899a6' : '#e1e4e8')};
    background: ${(p) => (p.$active ? 'rgba(12, 92, 171, 0.1)' : 'transparent')};
    cursor: ${(p) => (p.$dir ? 'default' : 'pointer')};
    white-space: nowrap;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 13px;
    &:hover {
        background: ${(p) => (p.$dir ? 'transparent' : 'rgba(255, 255, 255, 0.04)')};
    }
    span {
        overflow: hidden;
        text-overflow: ellipsis;
    }
`;
