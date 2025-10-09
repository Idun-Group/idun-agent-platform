export const styleVariables = {
    colors: {
        // Mode clair (défaut)
        light: {
            background: '0 0% 100%',
            foreground: '222.2 47.4% 11.2%',
            muted: '210 40% 96.1%',
            mutedForeground: '215.4 16.3% 46.9%',
            popover: '0 0% 100%',
            popoverForeground: '222.2 47.4% 11.2%',
            border: '214.3 31.8% 91.4%',
            input: '214.3 31.8% 91.4%',
            card: '0 0% 100%',
            cardForeground: '222.2 47.4% 11.2%',
            primary: '262.1 83.3% 57.8%',
            primaryForeground: '210 40% 98%',
            secondary: '210 40% 96.1%',
            secondaryForeground: '222.2 47.4% 11.2%',
            accent: '210 40% 96.1%',
            accentForeground: '222.2 47.4% 11.2%',
            destructive: '0 84.2% 60.2%',
            destructiveForeground: '210 40% 98%',
            ring: '262.1 83.3% 57.8%',
            // Header variables (light)
            headerBg: '0 0% 100%',
            headerBorder: '214.3 31.8% 91.4%',
            headerText: '222.2 47.4% 11.2%',
            headerMuted: '215.4 16.3% 46.9%',
            // Variables de thème personnalisées
            appBg: '0 0% 100%',
            appSidebar: '210 40% 96.1%',
            appBorder: '214.3 31.8% 91.4%',
            appText: '222.2 47.4% 11.2%',
            appTextMuted: '215.4 16.3% 46.9%',
            appPurple: '262.1 83.3% 57.8%',
            // Variables de la sidebar
            sidebarBackground: '0 0% 98%',
            sidebarForeground: '240 5.3% 26.1%',
            sidebarPrimary: '240 5.9% 10%',
            sidebarPrimaryForeground: '0 0% 98%',
            sidebarAccent: '240 4.8% 95.9%',
            sidebarAccentForeground: '240 5.9% 10%',
            sidebarBorder: '220 13% 91%',
            sidebarRing: '217.2 91.2% 59.8%',
        },
        // Mode sombre
        dark: {
            background: '224 71% 4%',
            foreground: '213 31% 91%',
            muted: '223 47% 11%',
            mutedForeground: '215.4 16.3% 56.9%',
            accent: '216 34% 17%',
            accentForeground: '210 40% 98%',
            popover: '224 71% 4%',
            popoverForeground: '215 20.2% 65.1%',
            border: '216 34% 17%',
            input: '216 34% 17%',
            card: '224 71% 4%',
            cardForeground: '213 31% 91%',
            primary: '262.1 83.3% 57.8%',
            primaryForeground: '210 40% 98%',
            secondary: '222.2 47.4% 11.2%',
            secondaryForeground: '210 40% 98%',
            destructive: '0 63% 31%',
            destructiveForeground: '210 40% 98%',
            ring: '262.1 83.3% 57.8%',
            // Header variables (dark)
            headerBg: '224 71% 4%',
            headerBorder: '216 34% 17%',
            headerText: '213 31% 91%',
            headerMuted: '215.4 16.3% 56.9%',
            // Variables de thème personnalisées - Dark
            appBg: '224 71% 4%',
            appSidebar: '223 47% 11%',
            appBorder: '216 34% 17%',
            appText: '213 31% 91%',
            appTextMuted: '215.4 16.3% 56.9%',
            appPurple: '262.1 83.3% 57.8%',
            // Variables de la sidebar - Dark
            sidebarBackground: '240 5.9% 10%',
            sidebarForeground: '240 4.8% 95.9%',
            sidebarPrimary: '224 71.4% 4.1%',
            sidebarPrimaryForeground: '210 20% 98%',
            sidebarAccent: '240 3.7% 15.9%',
            sidebarAccentForeground: '240 4.8% 95.9%',
            sidebarBorder: '240 3.7% 15.9%',
            sidebarRing: '217.2 91.2% 59.8%',
        },
    },
    spacing: {
        radius: '0.5rem',
    },
    scrollbar: {
        width: '8px',
        height: '8px',
        trackColor: '#121122',
        thumbColor: '#404040',
        thumbBorder: '#252a45',
        thumbHover: '#555555',
        thumbActive: '#8c52ff',
        cornerColor: '#121122',
        // Sidebar specific
        sidebarTrack: '#0a0a1a',
        contentTrack: '#030210',
        // Table specific
        tableWidth: '6px',
        tableHeight: '6px',
        tableThumb: '#8c52ff',
    },
    transitions: {
        theme: 'background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease',
    },
};

export const lighten = (col: string, amt: number) => {
    let usePound = false;
    let color = col;
    if (color[0] === '#') {
        color = color.slice(1);
        usePound = true;
    }
    let num = parseInt(color, 16);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 0x00ff) + amt;
    let b = (num & 0x0000ff) + amt;
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    return (
        (usePound ? '#' : '') +
        ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
    );
};
