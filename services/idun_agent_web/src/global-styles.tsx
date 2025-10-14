import { createGlobalStyle } from 'styled-components';
// @ts-ignore

import { styleVariables } from './utils/style-variables';


const GlobalStyles = createGlobalStyle`
  /* Tailwind CSS Layers */

  @layer components {
    .all-\\[unset\\] {
      all: unset;
    }
  }

  @layer base {
    :root {
      /* Mode sombre par défaut - Dashboard theme */
      --background: ${styleVariables.colors.dark.background};
      --foreground: ${styleVariables.colors.dark.foreground};
      --muted: ${styleVariables.colors.dark.muted};
      --muted-foreground: ${styleVariables.colors.dark.mutedForeground};
      --popover: ${styleVariables.colors.dark.popover};
      --popover-foreground: ${styleVariables.colors.dark.popoverForeground};
      --border: ${styleVariables.colors.dark.border};
      --input: ${styleVariables.colors.dark.input};
      --card: ${styleVariables.colors.dark.card};
      --card-foreground: ${styleVariables.colors.dark.cardForeground};
      --primary: ${styleVariables.colors.dark.primary};
      --primary-foreground: ${styleVariables.colors.dark.primaryForeground};
      --secondary: ${styleVariables.colors.dark.secondary};
      --secondary-foreground: ${styleVariables.colors.dark.secondaryForeground};
      --accent: ${styleVariables.colors.dark.accent};
      --accent-foreground: ${styleVariables.colors.dark.accentForeground};
      --destructive: ${styleVariables.colors.dark.destructive};
      --destructive-foreground: ${styleVariables.colors.dark.destructiveForeground};
      --ring: ${styleVariables.colors.dark.ring};
      --radius: ${styleVariables.spacing.radius};

      /* Variables de thème personnalisées - Dashboard */
      --app-bg: ${styleVariables.colors.dark.appBg};
      --app-sidebar: ${styleVariables.colors.dark.appSidebar};
      --app-border: ${styleVariables.colors.dark.appBorder};
      --app-text: ${styleVariables.colors.dark.appText};
      --app-text-muted: ${styleVariables.colors.dark.appTextMuted};
      --app-purple: ${styleVariables.colors.dark.appPurple};

      /* Variables Header */
      --header-bg: ${styleVariables.colors.dark.headerBg};
      --header-border: ${styleVariables.colors.dark.headerBorder};
      --header-text: ${styleVariables.colors.dark.headerText};
      --header-muted: ${styleVariables.colors.dark.headerMuted};

      /* Variables de la sidebar - Dashboard */
      --sidebar-background: ${styleVariables.colors.dark.sidebarBackground};
      --sidebar-foreground: ${styleVariables.colors.dark.sidebarForeground};
      --sidebar-primary: ${styleVariables.colors.dark.sidebarPrimary};
      --sidebar-primary-foreground: ${styleVariables.colors.dark.sidebarPrimaryForeground};
      --sidebar-accent: ${styleVariables.colors.dark.sidebarAccent};
      --sidebar-accent-foreground: ${styleVariables.colors.dark.sidebarAccentForeground};
      --sidebar-border: ${styleVariables.colors.dark.sidebarBorder};
      --sidebar-ring: ${styleVariables.colors.dark.sidebarRing};

      /* Sidebar layout tokens (sizes/spacing/weights) */
      --sidebar-item-font-size: 14px;
      --sidebar-item-font-weight: 500;
      --sidebar-item-font-weight-active: 600;
      --sidebar-item-padding-y: 10px;
      --sidebar-item-padding-x: 16px;
      --sidebar-gap: 8px;
      --sidebar-icon-size: 20px;
    }

    .light {
      /* Mode clair explicite - même valeurs que :root */
      --background: ${styleVariables.colors.light.background};
      --foreground: ${styleVariables.colors.light.foreground};
      --muted: ${styleVariables.colors.light.muted};
      --muted-foreground: ${styleVariables.colors.light.mutedForeground};
      --popover: ${styleVariables.colors.light.popover};
      --popover-foreground: ${styleVariables.colors.light.popoverForeground};
      --border: ${styleVariables.colors.light.border};
      --input: ${styleVariables.colors.light.input};
      --card: ${styleVariables.colors.light.card};
      --card-foreground: ${styleVariables.colors.light.cardForeground};
      --primary: ${styleVariables.colors.light.primary};
      --primary-foreground: ${styleVariables.colors.light.primaryForeground};
      --secondary: ${styleVariables.colors.light.secondary};
      --secondary-foreground: ${styleVariables.colors.light.secondaryForeground};
      --accent: ${styleVariables.colors.light.accent};
      --accent-foreground: ${styleVariables.colors.light.accentForeground};
      --destructive: ${styleVariables.colors.light.destructive};
      --destructive-foreground: ${styleVariables.colors.light.destructiveForeground};
      --ring: ${styleVariables.colors.light.ring};

      /* Variables de thème personnalisées - Light */
      --app-bg: ${styleVariables.colors.light.appBg};
      --app-sidebar: ${styleVariables.colors.light.appSidebar};
      --app-border: ${styleVariables.colors.light.appBorder};
      --app-text: ${styleVariables.colors.light.appText};
      --app-text-muted: ${styleVariables.colors.light.appTextMuted};
      --app-purple: ${styleVariables.colors.light.appPurple};

      /* Variables de la sidebar - Light */
      --sidebar-background: ${styleVariables.colors.light.sidebarBackground};
      --sidebar-foreground: ${styleVariables.colors.light.sidebarForeground};
      --sidebar-primary: ${styleVariables.colors.light.sidebarPrimary};
      --sidebar-primary-foreground: ${styleVariables.colors.light.sidebarPrimaryForeground};
      --sidebar-accent: ${styleVariables.colors.light.sidebarAccent};
      --sidebar-accent-foreground: ${styleVariables.colors.light.sidebarAccentForeground};
      --sidebar-border: ${styleVariables.colors.light.sidebarBorder};
      --sidebar-ring: ${styleVariables.colors.light.sidebarRing};
    }

    .dark {
      /* Mode sombre */
      --background: ${styleVariables.colors.dark.background};
      --foreground: ${styleVariables.colors.dark.foreground};
      --muted: ${styleVariables.colors.dark.muted};
      --muted-foreground: ${styleVariables.colors.dark.mutedForeground};
      --accent: ${styleVariables.colors.dark.accent};
      --accent-foreground: ${styleVariables.colors.dark.accentForeground};
      --popover: ${styleVariables.colors.dark.popover};
      --popover-foreground: ${styleVariables.colors.dark.popoverForeground};
      --border: ${styleVariables.colors.dark.border};
      --input: ${styleVariables.colors.dark.input};
      --card: ${styleVariables.colors.dark.card};
      --card-foreground: ${styleVariables.colors.dark.cardForeground};
      --primary: ${styleVariables.colors.dark.primary};
      --primary-foreground: ${styleVariables.colors.dark.primaryForeground};
      --secondary: ${styleVariables.colors.dark.secondary};
      --secondary-foreground: ${styleVariables.colors.dark.secondaryForeground};
      --destructive: ${styleVariables.colors.dark.destructive};
      --destructive-foreground: ${styleVariables.colors.dark.destructiveForeground};
      --ring: ${styleVariables.colors.dark.ring};

      /* Variables de thème personnalisées - Dark */
      --app-bg: ${styleVariables.colors.dark.appBg};
      --app-sidebar: ${styleVariables.colors.dark.appSidebar};
      --app-border: ${styleVariables.colors.dark.appBorder};
      --app-text: ${styleVariables.colors.dark.appText};
      --app-text-muted: ${styleVariables.colors.dark.appTextMuted};
      --app-purple: ${styleVariables.colors.dark.appPurple};

      /* Variables de la sidebar - Dark */
      --sidebar-background: ${styleVariables.colors.dark.sidebarBackground};
      --sidebar-foreground: ${styleVariables.colors.dark.sidebarForeground};
      --sidebar-primary: ${styleVariables.colors.dark.sidebarPrimary};
      --sidebar-primary-foreground: ${styleVariables.colors.dark.sidebarPrimaryForeground};
      --sidebar-accent: ${styleVariables.colors.dark.sidebarAccent};
      --sidebar-accent-foreground: ${styleVariables.colors.dark.sidebarAccentForeground};
      --sidebar-border: ${styleVariables.colors.dark.sidebarBorder};
      --sidebar-ring: ${styleVariables.colors.dark.sidebarRing};
    }

    /* Transitions fluides pour les changements de thème */
    * {
      transition: ${styleVariables.transitions.theme};
      box-sizing: border-box;
      border-color: hsl(var(--border));
    }

    body {
      margin: 0;
      font-family: 'Inter', 'SF Pro Display', -apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
      background-color: hsl(var(--background));
      color: hsl(var(--foreground));
      font-feature-settings: 'rlig' 1, 'calt' 1;
    }

    a {
      text-decoration: none;
      color: inherit;
    }

    h1, h2, h3, h4, h5, h6 {
      margin: 0;
      font-weight: normal;
    }

    /* Global button hover text color fix */
    button:hover,
    .button:hover,
    [role='button']:hover {
      color: white !important;
    }

    /* Custom Scrollbar Styles */
    * {
      scrollbar-width: thin;
      scrollbar-color: ${styleVariables.scrollbar.thumbColor} ${styleVariables.scrollbar.trackColor};
    }

    /* Webkit Scrollbar Styles */
    *::-webkit-scrollbar {
      width: ${styleVariables.scrollbar.width};
      height: ${styleVariables.scrollbar.height};
    }

    *::-webkit-scrollbar-track {
      background: ${styleVariables.scrollbar.trackColor};
      border-radius: 4px;
    }

    *::-webkit-scrollbar-thumb {
      background: ${styleVariables.scrollbar.thumbColor};
      border-radius: 4px;
      border: 1px solid ${styleVariables.scrollbar.thumbBorder};
    }

    *::-webkit-scrollbar-thumb:hover {
      background: ${styleVariables.scrollbar.thumbHover};
    }

    *::-webkit-scrollbar-thumb:active {
      background: ${styleVariables.scrollbar.thumbActive};
    }

    *::-webkit-scrollbar-corner {
      background: ${styleVariables.scrollbar.cornerColor};
    }

    /* Specific scrollbar styles for different areas */
    .sidebar-scroll::-webkit-scrollbar-track {
      background: ${styleVariables.scrollbar.sidebarTrack};
    }

    .content-scroll::-webkit-scrollbar-track {
      background: ${styleVariables.scrollbar.contentTrack};
    }

    .table-scroll::-webkit-scrollbar {
      width: ${styleVariables.scrollbar.tableWidth};
      height: ${styleVariables.scrollbar.tableHeight};
    }

    .table-scroll::-webkit-scrollbar-thumb {
      background: ${styleVariables.scrollbar.tableThumb};
      border-radius: 3px;
    }
  }
`;

export default GlobalStyles;
