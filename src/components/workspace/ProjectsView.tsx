'use client';

import { useEffect, useState } from 'react';
import { Project, ProjectsViewMode } from '@/types/project';
import styles from './Workspace.module.css';

interface ProjectsViewProps {
  viewMode: ProjectsViewMode;
  search: string;
  projects: Project[];
  onSearchChange: (value: string) => void;
  onViewChange: (value: ProjectsViewMode) => void;
  onCreateToggle: () => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onEditProject: (projectId: string) => void;
}

export function ProjectsView({
  viewMode,
  search,
  projects,
  onSearchChange,
  onViewChange,
  onCreateToggle,
  onOpenProject,
  onDeleteProject,
  onEditProject
}: ProjectsViewProps) {
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      const target = event.target as Element | null;
      if (target?.closest(`.${styles.projectMenuWrap}`)) {
        return;
      }
      setMenuProjectId(null);
    }

    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  return (
    <section>
      <header className={styles.contentHeader}>
        <h1>Projects</h1>
      </header>

      <section className={styles.toolbar}>
        <input
          className={styles.searchInput}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search projects..."
        />

        <div className={styles.toolbarRight}>
          <button
            className={`${styles.createButton} ${styles.projectCreateButton}`}
            type="button"
            onClick={onCreateToggle}
          >
            + Project
          </button>

          <div className={styles.viewSwitch}>
            <button
              type="button"
              className={`${styles.viewButton} ${viewMode === 'cards' ? styles.viewButtonActive : ''}`}
              onClick={() => onViewChange('cards')}
            >
              ▦
            </button>
            <button
              type="button"
              className={`${styles.viewButton} ${viewMode === 'table' ? styles.viewButtonActive : ''}`}
              onClick={() => onViewChange('table')}
            >
              ☰
            </button>
          </div>
        </div>
      </section>

      {viewMode === 'cards' ? (
        projects.length === 0 ? (
          <section className={styles.emptyStateCard}>
            <p className={styles.emptyStateTitle}>You don't have any projects yet</p>
            <p className={styles.emptyStateHint}>Click "+ Project" to add your first project card.</p>
          </section>
        ) : (
          <section className={styles.projectsGrid}>
            {projects.map((project) => (
              <article
                key={project.id}
                className={styles.projectCard}
                onClick={() => onOpenProject(project.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onOpenProject(project.id);
                }}
              >
                <div className={styles.folderIcon}>📁</div>
                <div className={styles.projectBody}>
                  <div className={styles.projectCardHeader}>
                    <h3>{project.name}</h3>
                    <div className={styles.projectMenuWrap} onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className={styles.projectMenuToggle}
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuProjectId((prev) => (prev === project.id ? null : project.id));
                        }}
                        aria-label="Project menu"
                      >
                        <span />
                        <span />
                        <span />
                      </button>
                      {menuProjectId === project.id ? (
                        <div className={styles.projectMenuPanel}>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuProjectId(null);
                              onEditProject(project.id);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={styles.menuDanger}
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuProjectId(null);
                              onDeleteProject(project.id);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <p className={styles.projectPath}>{project.path}</p>
                </div>
              </article>
            ))}
          </section>
        )
      ) : (
        <section className={styles.projectsTableWrap}>
          <table className={styles.projectsTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Path</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                return (
                  <tr key={project.id} onClick={() => onOpenProject(project.id)} className={styles.projectsTableRow}>
                    <td>
                      <div className={styles.tableNameCell}>
                        <span className={styles.tableFolderIcon} aria-hidden="true">
                          📁
                        </span>
                        <span>{project.name}</span>
                      </div>
                    </td>
                    <td className={styles.projectPath}>{project.path}</td>
                    <td>
                      <button
                        type="button"
                        className={`${styles.runButton} ${styles.tableOpenButton}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenProject(project.id);
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {projects.length === 0 && viewMode === 'table' ? <p className={styles.emptyState}>Nothing found.</p> : null}
    </section>
  );
}
