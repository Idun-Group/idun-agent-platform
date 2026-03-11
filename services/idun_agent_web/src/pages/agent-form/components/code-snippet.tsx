import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { Copy, Check } from 'lucide-react';

interface CodeSnippetProps {
    code: string;
    language?: 'python' | 'bash' | string;
}

// Token types for syntax highlighting
type TokenType = 'keyword' | 'string' | 'comment' | 'builtin' | 'number' | 'operator' | 'function' | 'variable' | 'flag' | 'plain';

interface Token {
    type: TokenType;
    text: string;
}

const PYTHON_KEYWORDS = new Set([
    'from', 'import', 'def', 'return', 'class', 'if', 'else', 'elif', 'for',
    'while', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'with',
    'as', 'try', 'except', 'finally', 'raise', 'pass', 'break', 'continue', 'yield',
    'lambda', 'global', 'nonlocal', 'del', 'assert',
]);

const PYTHON_BUILTINS = new Set([
    'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set',
    'tuple', 'type', 'isinstance', 'super', 'self',
]);

function tokenizePython(line: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < line.length) {
        // Comments
        if (line[i] === '#') {
            tokens.push({ type: 'comment', text: line.slice(i) });
            break;
        }

        // Strings (double or single quoted)
        if (line[i] === '"' || line[i] === "'") {
            const quote = line[i];
            let end = i + 1;
            while (end < line.length && line[end] !== quote) {
                if (line[end] === '\\') end++;
                end++;
            }
            tokens.push({ type: 'string', text: line.slice(i, end + 1) });
            i = end + 1;
            continue;
        }

        // Numbers
        if (/\d/.test(line[i]) && (i === 0 || /[\s=,([]/.test(line[i - 1]))) {
            let end = i;
            while (end < line.length && /[\d.]/.test(line[end])) end++;
            tokens.push({ type: 'number', text: line.slice(i, end) });
            i = end;
            continue;
        }

        // Words (keywords, builtins, identifiers)
        if (/[a-zA-Z_]/.test(line[i])) {
            let end = i;
            while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) end++;
            const word = line.slice(i, end);

            // Check if followed by ( → function call
            const nextNonSpace = line.slice(end).match(/^(\s*)\(/);

            if (PYTHON_KEYWORDS.has(word)) {
                tokens.push({ type: 'keyword', text: word });
            } else if (PYTHON_BUILTINS.has(word)) {
                tokens.push({ type: 'builtin', text: word });
            } else if (nextNonSpace) {
                tokens.push({ type: 'function', text: word });
            } else {
                tokens.push({ type: 'plain', text: word });
            }
            i = end;
            continue;
        }

        // Operators
        if ('=()[]{}:,.+-*/<>!@'.includes(line[i])) {
            tokens.push({ type: 'operator', text: line[i] });
            i++;
            continue;
        }

        // Whitespace and other
        let end = i;
        while (end < line.length && !/[a-zA-Z0-9_"'#=()[\]{}:,.+\-*/<>!@]/.test(line[end])) end++;
        tokens.push({ type: 'plain', text: line.slice(i, end || i + 1) });
        i = end || i + 1;
    }

    return tokens;
}

function tokenizeBash(line: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < line.length) {
        // Comments
        if (line[i] === '#') {
            tokens.push({ type: 'comment', text: line.slice(i) });
            break;
        }

        // Strings
        if (line[i] === '"' || line[i] === "'") {
            const quote = line[i];
            let end = i + 1;
            while (end < line.length && line[end] !== quote) {
                if (line[end] === '\\') end++;
                end++;
            }
            tokens.push({ type: 'string', text: line.slice(i, end + 1) });
            i = end + 1;
            continue;
        }

        // Flags (--something or -x)
        if (line[i] === '-' && i > 0 && line[i - 1] === ' ') {
            let end = i;
            while (end < line.length && line[end] !== ' ' && line[end] !== '=') end++;
            // Include =value if present
            if (end < line.length && line[end] === '=') {
                tokens.push({ type: 'flag', text: line.slice(i, end + 1) });
                i = end + 1;
            } else {
                tokens.push({ type: 'flag', text: line.slice(i, end) });
                i = end;
            }
            continue;
        }

        // Words
        if (/[a-zA-Z_]/.test(line[i])) {
            let end = i;
            while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) end++;
            const word = line.slice(i, end);

            const bashKeywords = new Set(['export', 'pip', 'install', 'idun', 'agent', 'serve', 'cd', 'echo', 'source', 'sudo', 'apt', 'brew', 'npm', 'npx']);
            if (bashKeywords.has(word) && (i === 0 || /[\s;|&]/.test(line[i - 1]))) {
                tokens.push({ type: 'keyword', text: word });
            } else {
                tokens.push({ type: 'plain', text: word });
            }
            i = end;
            continue;
        }

        // Variable assignment (SOME_VAR=)
        if (line[i] === '=' && i > 0 && /[A-Z_]/.test(line[i - 1])) {
            tokens.push({ type: 'operator', text: '=' });
            i++;
            continue;
        }

        // Other chars
        tokens.push({ type: 'plain', text: line[i] });
        i++;
    }

    return tokens;
}

function highlightLine(line: string, language?: string): Token[] {
    if (!language) return [{ type: 'plain', text: line }];
    if (language === 'python') return tokenizePython(line);
    if (language === 'bash') return tokenizeBash(line);
    return [{ type: 'plain', text: line }];
}

const TOKEN_COLORS: Record<TokenType, string> = {
    keyword: '#c084fc',     // purple
    string: '#86efac',      // green
    comment: '#6b7280',     // gray
    builtin: '#67e8f9',     // cyan
    number: '#fbbf24',      // amber
    operator: '#9ca3af',    // light gray
    function: '#60a5fa',    // blue
    variable: '#e2e8f0',    // white
    flag: '#f9a8d4',        // pink
    plain: '#e2e8f0',       // white
};

export default function CodeSnippet({ code, language }: CodeSnippetProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const highlighted = useMemo(() => {
        return code.split('\n').map(line => highlightLine(line, language));
    }, [code, language]);

    return (
        <Container>
            {language && <LangTag>{language}</LangTag>}
            <CopyButton onClick={handleCopy} title="Copy to clipboard" type="button">
                {copied ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                {copied && <CopyLabel>Copied!</CopyLabel>}
            </CopyButton>
            <Pre>
                {highlighted.map((lineTokens, lineIdx) => (
                    <span key={lineIdx}>
                        {lineTokens.map((token, tokenIdx) => (
                            <span key={tokenIdx} style={{ color: TOKEN_COLORS[token.type] }}>
                                {token.text}
                            </span>
                        ))}
                        {lineIdx < highlighted.length - 1 && '\n'}
                    </span>
                ))}
            </Pre>
        </Container>
    );
}

const Container = styled.div`
    position: relative;
    background-color: hsl(var(--accent));
    border: 1px solid var(--border-light);
    border-radius: 8px;
    overflow: hidden;
`;

const LangTag = styled.span`
    position: absolute;
    top: 8px;
    left: 12px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: hsl(var(--muted-foreground));
    letter-spacing: 0.05em;
`;

const CopyButton = styled.button`
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 6px 8px;
    background-color: var(--overlay-light);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.2s;

    &:hover {
        color: hsl(var(--foreground));
        background-color: var(--overlay-medium);
    }
`;

const CopyLabel = styled.span`
    font-size: 11px;
    font-weight: 500;
    color: #34d399;
`;

const Pre = styled.pre`
    margin: 0;
    padding: 32px 16px 16px;
    font-size: 13px;
    line-height: 1.7;
    color: #e2e8f0;
    font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace;
    overflow-x: auto;
    white-space: pre;

    &::-webkit-scrollbar {
        height: 6px;
    }
    &::-webkit-scrollbar-track {
        background: transparent;
    }
    &::-webkit-scrollbar-thumb {
        background: var(--border-light);
        border-radius: 3px;
    }
`;
