'use client';

import { ThemeMode } from '@/types/project';
import styles from './Workspace.module.css';

interface SidebarProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  activeSection: 'projects' | 'plugins' | 'settings';
  onSectionChange: (section: 'projects' | 'plugins' | 'settings') => void;
}

export function Sidebar({ theme, onThemeChange, activeSection, onSectionChange }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <nav className={styles.menu}>
        <button
          className={`${styles.menuItem} ${activeSection === 'projects' ? styles.menuItemActive : ''}`}
          type="button"
          onClick={() => onSectionChange('projects')}
        >
          Projects
        </button>
        <button
          className={`${styles.menuItem} ${activeSection === 'plugins' ? styles.menuItemActive : ''}`}
          type="button"
          onClick={() => onSectionChange('plugins')}
        >
          Plugins
        </button>
        <button
          className={`${styles.menuItem} ${activeSection === 'settings' ? styles.menuItemActive : ''}`}
          type="button"
          onClick={() => onSectionChange('settings')}
        >
          Settings
        </button>
      </nav>

      <div className={styles.sidebarFooter}>
        <label className={styles.themeLabel} htmlFor="theme-select">
          Theme
        </label>
        <select
          id="theme-select"
          className={styles.themeSelect}
          value={theme}
          onChange={(event) => onThemeChange(event.target.value as ThemeMode)}
        >
          <option value="white">White</option>
          <option value="hybrid">Hybrid</option>
          <option value="dark">Dark</option>
        </select>
      </div>
    </aside>
  );
}
