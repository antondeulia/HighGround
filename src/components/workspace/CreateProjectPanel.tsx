'use client';

import { useMemo } from 'react';
import styles from './Workspace.module.css';

interface CreateProjectPanelProps {
  isOpen: boolean;
  name: string;
  path: string;
  tags: string;
  statusText: string;
  statusError: boolean;
  onNameChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
}

export function CreateProjectPanel({
  isOpen,
  name,
  path,
  tags,
  statusText,
  statusError,
  onNameChange,
  onTagsChange,
  onClose,
  onSubmit
}: CreateProjectPanelProps) {
  const statusClass = useMemo(
    () => `${styles.createStatus} ${statusError ? styles.createStatusError : ''}`,
    [statusError]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="presentation">
      <form
        className={styles.createPanel}
        onClick={(event) => event.stopPropagation()}
        onSubmit={async (event) => {
          event.preventDefault();
          await onSubmit();
        }}
      >
        <div className={styles.createHeader}>
          <h3>Новый проект</h3>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <label className={styles.fieldLabel}>
          <span>Название</span>
          <input
            value={name}
            placeholder="api-server"
            onChange={(event) => onNameChange(event.target.value)}
            required
          />
        </label>

        <label className={styles.fieldLabel}>
          <span>Выбранная папка</span>
          <input value={path} readOnly />
        </label>

        <label className={styles.fieldLabel}>
          <span>Теги (опционально)</span>
          <input
            value={tags}
            placeholder="frontend, internal"
            onChange={(event) => onTagsChange(event.target.value)}
          />
        </label>

        <button type="submit" className={styles.createSubmit}>
          Создать проект
        </button>

        <p className={statusClass}>{statusText}</p>
      </form>
    </div>
  );
}
