'use client';

import { ThemeMode } from '@/types/project';
import styles from './Workspace.module.css';

interface SidebarProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

export function Sidebar({ theme, onThemeChange }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <nav className={styles.menu}>
        <button className={`${styles.menuItem} ${styles.menuItemActive}`} type="button">
          Projects
        </button>
        <button className={styles.menuItem} type="button">
          Utils
        </button>
        <button className={styles.menuItem} type="button">
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
