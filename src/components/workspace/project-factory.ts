import { Instance, Project, ProjectCategory } from '@/types/project';

function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function inferCategory(tags: string[]): ProjectCategory {
  const hay = tags.join(' ').toLowerCase();
  if (hay.includes('backend')) return 'backend';
  if (hay.includes('infra') || hay.includes('devops')) return 'infra';
  return 'frontend';
}

export function createProject(name: string, path: string, rawTags: string): Project {
  const tags = rawTags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  const category = inferCategory(tags);

  return {
    id: id('prj'),
    name,
    path,
    tags,
    category,
    instances: []
  };
}

export function createInstance(name: string, path: string, tag: string): Instance {
  return {
    id: id('inst'),
    name,
    path,
    localUrl: '',
    tag: tag.trim() || 'latest',
    imageId: Math.random().toString(16).slice(2, 14),
    createdLabel: 'just now',
    sizeLabel: '120 MB',
    command: 'npm run dev',
    running: false
  };
}
