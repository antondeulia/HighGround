"use client";

import { ThemeMode } from "@/types/project";
import styles from "./Workspace.module.css";

interface SidebarProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  activeSection: "projects" | "plugins" | "settings";
  onSectionChange: (section: "projects" | "plugins" | "settings") => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}

function ProjectsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.2c.8 0 1.55.35 2.06.95l.8.95h5.94A2.5 2.5 0 0 1 21 8.4v9.1A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PluginsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M8.5 7.5V5a2.5 2.5 0 1 1 5 0v2.5M6 9h12v8.5A2.5 2.5 0 0 1 15.5 20h-7A2.5 2.5 0 0 1 6 17.5V9Zm6 0v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm8 3.5-.9-.4a7.9 7.9 0 0 0-.42-1.03l.37-.92a1 1 0 0 0-.22-1.1l-1.56-1.56a1 1 0 0 0-1.1-.22l-.92.37c-.33-.16-.67-.3-1.03-.42L14 4a1 1 0 0 0-.98-.75h-2.04A1 1 0 0 0 10 4l-.4.9c-.36.12-.7.26-1.03.42l-.92-.37a1 1 0 0 0-1.1.22L5 6.73a1 1 0 0 0-.22 1.1l.37.92c-.16.33-.3.67-.42 1.03L4 10a1 1 0 0 0-.75.98v2.04A1 1 0 0 0 4 14l.9.4c.12.36.26.7.42 1.03l-.37.92a1 1 0 0 0 .22 1.1l1.56 1.56a1 1 0 0 0 1.1.22l.92-.37c.33.16.67.3 1.03.42l.4.9a1 1 0 0 0 .98.75h2.04a1 1 0 0 0 .98-.75l.4-.9c.36-.12.7-.26 1.03-.42l.92.37a1 1 0 0 0 1.1-.22l1.56-1.56a1 1 0 0 0 .22-1.1l-.37-.92c.16-.33.3-.67.42-1.03l.9-.4a1 1 0 0 0 .75-.98v-2.04A1 1 0 0 0 20 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Sidebar({
  theme,
  onThemeChange,
  activeSection,
  onSectionChange,
  isCollapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const sidebarClass = `${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ""}`;

  return (
    <aside className={sidebarClass}>
      <nav className={styles.menu}>
        <button
          className={`${styles.menuItem} ${activeSection === "projects" ? styles.menuItemActive : ""}`}
          type="button"
          onClick={() => onSectionChange("projects")}
          aria-label="Projects"
        >
          <span className={styles.menuItemIcon}>
            <ProjectsIcon />
          </span>
          <span className={styles.menuItemText}>Projects</span>
        </button>
        <button
          className={`${styles.menuItem} ${activeSection === "plugins" ? styles.menuItemActive : ""}`}
          type="button"
          onClick={() => onSectionChange("plugins")}
          aria-label="Plugins"
        >
          <span className={styles.menuItemIcon}>
            <PluginsIcon />
          </span>
          <span className={styles.menuItemText}>Plugins</span>
        </button>
        <button
          className={`${styles.menuItem} ${activeSection === "settings" ? styles.menuItemActive : ""}`}
          type="button"
          onClick={() => onSectionChange("settings")}
          aria-label="Settings"
        >
          <span className={styles.menuItemIcon}>
            <SettingsIcon />
          </span>
          <span className={styles.menuItemText}>Settings</span>
        </button>
      </nav>

      <div className={styles.sidebarFooter}>
        <div className={styles.sidebarSupport}>
          <a
            className={styles.sidebarSupportLink}
            href="https://buymeacoffee.com/antondeulia"
            target="_blank"
            rel="noreferrer noopener"
          >
            Buy me a coffee ☕
          </a>
        </div>
        <div className={styles.sidebarFooterControls}>
          <select
            id="theme-select"
            className={styles.themeSelect}
            value={theme}
            onChange={(event) => onThemeChange(event.target.value as ThemeMode)}
            aria-label="Theme"
          >
            <option value="white">White</option>
            <option value="hybrid">Hybrid</option>
            <option value="dark">Dark</option>
          </select>
          <button
            className={styles.sidebarToggle}
            type="button"
            onClick={onToggleCollapsed}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? "В»" : "В«"}
          </button>
        </div>
      </div>
    </aside>
  );
}


