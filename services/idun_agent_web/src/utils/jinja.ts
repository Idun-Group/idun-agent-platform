/**
 * Extract Jinja2 variable names from a template string.
 * Matches `{{ variable_name }}` patterns.
 */
export function extractVariables(template: string): string[] {
    const regex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
    const vars = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(template)) !== null) {
        vars.add(match[1]);
    }
    return Array.from(vars);
}
