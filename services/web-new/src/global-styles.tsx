import { createGlobalStyle } from 'styled-components';

import { styleVariables } from './utils/style-variables';


const GlobalStyles = createGlobalStyle`
  @layer components {
    .all-\\[unset\\] {
      all: unset;
    }
  }

  @layer base {
    :root {
      /* Dark mode by default */
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

      /* App custom */
      --app-bg: ${styleVariables.colors.dark.appBg};
      --app-sidebar: ${styleVariables.colors.dark.appSidebar};
      --app-border: ${styleVariables.colors.dark.appBorder};
      --app-text: ${styleVariables.colors.dark.appText};
      --app-text-muted: ${styleVariables.colors.dark.appTextMuted};
      --app-purple: ${styleVariables.colors.dark.appPurple};

      /* Header */
      --header-bg: ${styleVariables.colors.dark.headerBg};
      --header-border: ${styleVariables.colors.dark.headerBorder};
      --header-text: ${styleVariables.colors.dark.headerText};
      --header-muted: ${styleVariables.colors.dark.headerMuted};

      /* Sidebar */
      --sidebar-background: ${styleVariables.colors.dark.sidebarBackground};
      --sidebar-foreground: ${styleVariables.colors.dark.sidebarForeground};
      --sidebar-primary: ${styleVariables.colors.dark.sidebarPrimary};
      --sidebar-primary-foreground: ${styleVariables.colors.dark.sidebarPrimaryForeground};
      --sidebar-accent: ${styleVariables.colors.dark.sidebarAccent};
      --sidebar-accent-foreground: ${styleVariables.colors.dark.sidebarAccentForeground};
      --sidebar-border: ${styleVariables.colors.dark.sidebarBorder};
      --sidebar-ring: ${styleVariables.colors.dark.sidebarRing};

      /* Sidebar layout tokens */
      --sidebar-item-font-size: 14px;
      --sidebar-item-font-weight: 500;
      --sidebar-item-font-weight-active: 600;
      --sidebar-item-padding-y: 10px;
      --sidebar-item-padding-x: 16px;
      --sidebar-gap: 8px;
      --sidebar-icon-size: 20px;

      /* Surfaces */
      --surface-elevated: ${styleVariables.colors.dark.surfaceElevated};
      --surface-overlay: ${styleVariables.colors.dark.surfaceOverlay};

      /* Text */
      --text-secondary: ${styleVariables.colors.dark.textSecondary};
      --text-tertiary: ${styleVariables.colors.dark.textTertiary};

      /* Sidebar items */
      --sidebar-item-bg: ${styleVariables.colors.dark.sidebarItemBg};
      --sidebar-item-hover: ${styleVariables.colors.dark.sidebarItemHover};
      --sidebar-item-active: ${styleVariables.colors.dark.sidebarItemActive};
      --sidebar-icon-inactive: ${styleVariables.colors.dark.sidebarIconInactive};

      /* Semantic */
      --warning: ${styleVariables.colors.dark.warning};
      --success: ${styleVariables.colors.dark.success};

      /* Overlays */
      --overlay-subtle: ${styleVariables.overlays.dark.subtle};
      --overlay-light: ${styleVariables.overlays.dark.light};
      --overlay-medium: ${styleVariables.overlays.dark.medium};
      --overlay-strong: ${styleVariables.overlays.dark.strong};
      --overlay-backdrop: ${styleVariables.overlays.dark.backdrop};
      --border-subtle: ${styleVariables.overlays.dark.borderSubtle};
      --border-light: ${styleVariables.overlays.dark.borderLight};
      --border-medium: ${styleVariables.overlays.dark.borderMedium};

      /* Background alias */
      --color-background-primary: hsl(var(--background));

      /* Scrollbar */
      --scrollbar-track: ${styleVariables.scrollbar.dark.trackColor};
      --scrollbar-thumb: ${styleVariables.scrollbar.dark.thumbColor};
      --scrollbar-thumb-border: ${styleVariables.scrollbar.dark.thumbBorder};
      --scrollbar-thumb-hover: ${styleVariables.scrollbar.dark.thumbHover};
      --scrollbar-thumb-active: ${styleVariables.scrollbar.dark.thumbActive};
      --scrollbar-corner: ${styleVariables.scrollbar.dark.cornerColor};
      --scrollbar-sidebar-track: ${styleVariables.scrollbar.dark.sidebarTrack};
      --scrollbar-content-track: ${styleVariables.scrollbar.dark.contentTrack};
      --scrollbar-table-thumb: ${styleVariables.scrollbar.dark.tableThumb};
    }

    .light {
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

      /* App custom */
      --app-bg: ${styleVariables.colors.light.appBg};
      --app-sidebar: ${styleVariables.colors.light.appSidebar};
      --app-border: ${styleVariables.colors.light.appBorder};
      --app-text: ${styleVariables.colors.light.appText};
      --app-text-muted: ${styleVariables.colors.light.appTextMuted};
      --app-purple: ${styleVariables.colors.light.appPurple};

      /* Header */
      --header-bg: ${styleVariables.colors.light.headerBg};
      --header-border: ${styleVariables.colors.light.headerBorder};
      --header-text: ${styleVariables.colors.light.headerText};
      --header-muted: ${styleVariables.colors.light.headerMuted};

      /* Sidebar */
      --sidebar-background: ${styleVariables.colors.light.sidebarBackground};
      --sidebar-foreground: ${styleVariables.colors.light.sidebarForeground};
      --sidebar-primary: ${styleVariables.colors.light.sidebarPrimary};
      --sidebar-primary-foreground: ${styleVariables.colors.light.sidebarPrimaryForeground};
      --sidebar-accent: ${styleVariables.colors.light.sidebarAccent};
      --sidebar-accent-foreground: ${styleVariables.colors.light.sidebarAccentForeground};
      --sidebar-border: ${styleVariables.colors.light.sidebarBorder};
      --sidebar-ring: ${styleVariables.colors.light.sidebarRing};

      /* Surfaces */
      --surface-elevated: ${styleVariables.colors.light.surfaceElevated};
      --surface-overlay: ${styleVariables.colors.light.surfaceOverlay};

      /* Text */
      --text-secondary: ${styleVariables.colors.light.textSecondary};
      --text-tertiary: ${styleVariables.colors.light.textTertiary};

      /* Sidebar items */
      --sidebar-item-bg: ${styleVariables.colors.light.sidebarItemBg};
      --sidebar-item-hover: ${styleVariables.colors.light.sidebarItemHover};
      --sidebar-item-active: ${styleVariables.colors.light.sidebarItemActive};
      --sidebar-icon-inactive: ${styleVariables.colors.light.sidebarIconInactive};

      /* Semantic */
      --warning: ${styleVariables.colors.light.warning};
      --success: ${styleVariables.colors.light.success};

      /* Overlays */
      --overlay-subtle: ${styleVariables.overlays.light.subtle};
      --overlay-light: ${styleVariables.overlays.light.light};
      --overlay-medium: ${styleVariables.overlays.light.medium};
      --overlay-strong: ${styleVariables.overlays.light.strong};
      --overlay-backdrop: ${styleVariables.overlays.light.backdrop};
      --border-subtle: ${styleVariables.overlays.light.borderSubtle};
      --border-light: ${styleVariables.overlays.light.borderLight};
      --border-medium: ${styleVariables.overlays.light.borderMedium};

      /* Background alias */
      --color-background-primary: hsl(var(--background));

      /* Scrollbar */
      --scrollbar-track: ${styleVariables.scrollbar.light.trackColor};
      --scrollbar-thumb: ${styleVariables.scrollbar.light.thumbColor};
      --scrollbar-thumb-border: ${styleVariables.scrollbar.light.thumbBorder};
      --scrollbar-thumb-hover: ${styleVariables.scrollbar.light.thumbHover};
      --scrollbar-thumb-active: ${styleVariables.scrollbar.light.thumbActive};
      --scrollbar-corner: ${styleVariables.scrollbar.light.cornerColor};
      --scrollbar-sidebar-track: ${styleVariables.scrollbar.light.sidebarTrack};
      --scrollbar-content-track: ${styleVariables.scrollbar.light.contentTrack};
      --scrollbar-table-thumb: ${styleVariables.scrollbar.light.tableThumb};
    }

    .dark {
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

      /* App custom */
      --app-bg: ${styleVariables.colors.dark.appBg};
      --app-sidebar: ${styleVariables.colors.dark.appSidebar};
      --app-border: ${styleVariables.colors.dark.appBorder};
      --app-text: ${styleVariables.colors.dark.appText};
      --app-text-muted: ${styleVariables.colors.dark.appTextMuted};
      --app-purple: ${styleVariables.colors.dark.appPurple};

      /* Header */
      --header-bg: ${styleVariables.colors.dark.headerBg};
      --header-border: ${styleVariables.colors.dark.headerBorder};
      --header-text: ${styleVariables.colors.dark.headerText};
      --header-muted: ${styleVariables.colors.dark.headerMuted};

      /* Sidebar */
      --sidebar-background: ${styleVariables.colors.dark.sidebarBackground};
      --sidebar-foreground: ${styleVariables.colors.dark.sidebarForeground};
      --sidebar-primary: ${styleVariables.colors.dark.sidebarPrimary};
      --sidebar-primary-foreground: ${styleVariables.colors.dark.sidebarPrimaryForeground};
      --sidebar-accent: ${styleVariables.colors.dark.sidebarAccent};
      --sidebar-accent-foreground: ${styleVariables.colors.dark.sidebarAccentForeground};
      --sidebar-border: ${styleVariables.colors.dark.sidebarBorder};
      --sidebar-ring: ${styleVariables.colors.dark.sidebarRing};

      /* Surfaces */
      --surface-elevated: ${styleVariables.colors.dark.surfaceElevated};
      --surface-overlay: ${styleVariables.colors.dark.surfaceOverlay};

      /* Text */
      --text-secondary: ${styleVariables.colors.dark.textSecondary};
      --text-tertiary: ${styleVariables.colors.dark.textTertiary};

      /* Sidebar items */
      --sidebar-item-bg: ${styleVariables.colors.dark.sidebarItemBg};
      --sidebar-item-hover: ${styleVariables.colors.dark.sidebarItemHover};
      --sidebar-item-active: ${styleVariables.colors.dark.sidebarItemActive};
      --sidebar-icon-inactive: ${styleVariables.colors.dark.sidebarIconInactive};

      /* Semantic */
      --warning: ${styleVariables.colors.dark.warning};
      --success: ${styleVariables.colors.dark.success};

      /* Overlays */
      --overlay-subtle: ${styleVariables.overlays.dark.subtle};
      --overlay-light: ${styleVariables.overlays.dark.light};
      --overlay-medium: ${styleVariables.overlays.dark.medium};
      --overlay-strong: ${styleVariables.overlays.dark.strong};
      --overlay-backdrop: ${styleVariables.overlays.dark.backdrop};
      --border-subtle: ${styleVariables.overlays.dark.borderSubtle};
      --border-light: ${styleVariables.overlays.dark.borderLight};
      --border-medium: ${styleVariables.overlays.dark.borderMedium};

      /* Background alias */
      --color-background-primary: hsl(var(--background));

      /* Scrollbar */
      --scrollbar-track: ${styleVariables.scrollbar.dark.trackColor};
      --scrollbar-thumb: ${styleVariables.scrollbar.dark.thumbColor};
      --scrollbar-thumb-border: ${styleVariables.scrollbar.dark.thumbBorder};
      --scrollbar-thumb-hover: ${styleVariables.scrollbar.dark.thumbHover};
      --scrollbar-thumb-active: ${styleVariables.scrollbar.dark.thumbActive};
      --scrollbar-corner: ${styleVariables.scrollbar.dark.cornerColor};
      --scrollbar-sidebar-track: ${styleVariables.scrollbar.dark.sidebarTrack};
      --scrollbar-content-track: ${styleVariables.scrollbar.dark.contentTrack};
      --scrollbar-table-thumb: ${styleVariables.scrollbar.dark.tableThumb};
    }

    /* Smooth theme transitions */
    * {
      transition: ${styleVariables.transitions.theme};
      box-sizing: border-box;
      border-color: hsl(var(--border));
    }

    body {
      margin: 0;
      font-family: 'IBM Plex Sans', -apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
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

    /* Custom Scrollbar Styles */
    * {
      scrollbar-width: thin;
      scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
    }

    *::-webkit-scrollbar {
      width: ${styleVariables.scrollbar.width};
      height: ${styleVariables.scrollbar.height};
    }

    *::-webkit-scrollbar-track {
      background: var(--scrollbar-track);
      border-radius: 4px;
    }

    *::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb);
      border-radius: 4px;
      border: 1px solid var(--scrollbar-thumb-border);
    }

    *::-webkit-scrollbar-thumb:hover {
      background: var(--scrollbar-thumb-hover);
    }

    *::-webkit-scrollbar-thumb:active {
      background: var(--scrollbar-thumb-active);
    }

    *::-webkit-scrollbar-corner {
      background: var(--scrollbar-corner);
    }

    .sidebar-scroll::-webkit-scrollbar-track {
      background: var(--scrollbar-sidebar-track);
    }

    .content-scroll::-webkit-scrollbar-track {
      background: var(--scrollbar-content-track);
    }

    .table-scroll::-webkit-scrollbar {
      width: ${styleVariables.scrollbar.tableWidth};
      height: ${styleVariables.scrollbar.tableHeight};
    }

    .table-scroll::-webkit-scrollbar-thumb {
      background: var(--scrollbar-table-thumb);
      border-radius: 3px;
    }
  }
`;

export default GlobalStyles;
