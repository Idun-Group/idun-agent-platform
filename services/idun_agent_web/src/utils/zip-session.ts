// zipUtils.ts
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import JSZip from 'jszip';

export type FileEntry = { path: string; isDir: boolean };
// ---- build a proper tree from flat paths ----
export type TreeNode = {
    name: string; // segment (ex: "Images")
    path: string; // chemin complet "Images/Picture1.png"
    isDir: boolean;
    children?: TreeNode[];
};

function normalizePath(p: string) {
    return p.endsWith('/') ? p.slice(0, -1) : p;
}

function lastSegment(p: string) {
    const clean = normalizePath(p);
    const idx = clean.lastIndexOf('/');
    return idx === -1 ? clean : clean.slice(idx + 1);
}

export function buildTree(
    entries: { path: string; isDir: boolean }[]
): TreeNode[] {
    // index par chemin pour retrouver les parents
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    // créer d'abord tous les noeuds (fichiers + dossiers)
    for (const e of entries) {
        const path = normalizePath(e.path);
        nodeMap.set(path, {
            name: lastSegment(path),
            path: path,
            isDir: e.isDir,
            children: e.isDir ? [] : undefined,
        });
    }

    // lier parent/enfant
    for (const node of nodeMap.values()) {
        const idx = node.path.lastIndexOf('/');
        const parentPath = idx === -1 ? '' : node.path.slice(0, idx);
        if (parentPath && nodeMap.has(parentPath)) {
            const parent = nodeMap.get(parentPath)!;
            (parent.children ??= []).push(node);
        } else {
            roots.push(node);
        }
    }

    // tri dossiers avant fichiers à chaque niveau
    const sortNodes = (list?: TreeNode[]) => {
        if (!list) return;
        list.sort((a, b) =>
            a.isDir === b.isDir
                ? a.name.localeCompare(b.name)
                : a.isDir
                ? -1
                : 1
        );
        list.forEach((n) => sortNodes(n.children));
    };
    sortNodes(roots);

    return roots;
}
export function loadZip(u8: Uint8Array) {
    const files = new Map<string, Uint8Array>();
    const dirs = new Set<string>();
    const entries = unzipSync(u8);

    Object.entries(entries).forEach(([name, data]) => {
        if (name.endsWith('/')) dirs.add(name);
        else {
            files.set(name, data);
            const parts = name.split('/');
            for (let i = 0; i < parts.length - 1; i++) {
                dirs.add(parts.slice(0, i + 1).join('/') + '/');
            }
        }
    });

    const tree: FileEntry[] = [
        ...[...dirs].map((p) => ({ path: p, isDir: true })),
        ...[...files.keys()].map((p) => ({ path: p, isDir: false })),
    ].sort((a, b) =>
        a.isDir === b.isDir ? a.path.localeCompare(b.path) : a.isDir ? -1 : 1
    );

    return { files, dirs, tree };
}

export const readText = (files: Map<string, Uint8Array>, path: string) =>
    strFromU8(files.get(path)!);

export const writeText = (
    files: Map<string, Uint8Array>,
    path: string,
    content: string
) => {
    files.set(path, strToU8(content));
};

export function makeZipBlob(files: Map<string, Uint8Array>, dirs: Set<string>) {
    const obj: Record<string, Uint8Array> = {};
    dirs.forEach((d) => (obj[d] = new Uint8Array()));
    files.forEach((v, k) => (obj[k] = v));
    const zipped = zipSync(obj, { level: 6 });

    // évite ArrayBuffer | SharedArrayBuffer
    const copy = new Uint8Array(zipped.byteLength);
    copy.set(zipped);
    return new Blob([copy.buffer], { type: 'application/zip' });
}
export async function getAllFilePathFromZip(
    file: File | Blob | ArrayBuffer,
    extensions: string = ''
): Promise<string[]> {
    const zip = new JSZip();
    // Convertir en ArrayBuffer si nécessaire
    const buffer =
        file instanceof File || file instanceof Blob
            ? await file.arrayBuffer()
            : file;
    const contents = await zip.loadAsync(buffer);
    return Object.keys(contents.files)
        .filter(
            (path) => {
                if (contents.files[path].dir) return false;
                if (!extensions) return true;
                const lower = path.toLowerCase();
                // Support both .yaml and .yml for YAML files
                if (extensions === 'yaml') {
                    return lower.endsWith('.yaml') || lower.endsWith('.yml');
                }
                return lower.endsWith(`.${extensions}`);
            }
        )
        .map((p) => `./${p}`.replace(/\\/g, '/'));
}

export async function readFileFromZip(
    file: File | Blob | ArrayBuffer,
    filePath: string
): Promise<string> {
    const zip = new JSZip();
    // Convertir en ArrayBuffer si nécessaire
    const buffer =
        file instanceof File || file instanceof Blob
            ? await file.arrayBuffer()
            : file;
    const contents = await zip.loadAsync(buffer);
    
    // Remove leading ./ if present
    const normalizedPath = filePath.startsWith('./') ? filePath.slice(2) : filePath;
    
    const fileEntry = contents.files[normalizedPath];
    if (!fileEntry || fileEntry.dir) {
        throw new Error(`File not found in ZIP: ${filePath}`);
    }
    
    return await fileEntry.async('text');
}
