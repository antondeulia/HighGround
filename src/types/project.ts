export type ThemeMode = 'white' | 'hybrid' | 'dark';
export type ProjectsViewMode = 'cards' | 'table';
export type ProjectCategory = 'frontend' | 'backend' | 'infra';

export interface Instance {
  id: string;
  name: string;
  path: string;
  tag: string;
  imageId: string;
  createdLabel: string;
  sizeLabel: string;
  command: string;
  running: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  tags: string[];
  category: ProjectCategory;
  instances: Instance[];
}
