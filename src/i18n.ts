const en = {
  viewTitle: 'Diff',
  openDiff: 'Show rendered diff of current note',
  openDiffMenu: 'Show rendered diff',
  nextChange: 'Go to next change',
  prevChange: 'Go to previous change',
  refresh: 'Refresh diff',
  toggleCollapse: 'Show only changes',
  head: 'HEAD (last commit)',
  index: 'Staged (index)',
  working: 'Current note',
  commits: 'Commits',
  noFile: 'Open a note and run “Show rendered diff”.',
  notMarkdown: 'The rendered diff works on Markdown notes.',
  notRepo: 'This note is not inside a git repository.',
  gitNotFound: 'git was not found. Install git or set its path in the plugin settings.',
  gitFailed: 'git failed: ',
  notInLeft: 'Not in this version',
  notInRight: 'File does not exist',
  noChanges: 'No changes between the two versions.',
  sameSides: 'Both sides are the same version.',
  unchangedBlocks: (n: number) => `${n} unchanged ${n === 1 ? 'block' : 'blocks'} — show`,
  changeCounter: (i: number, n: number) => (n === 0 ? 'No changes' : `${i} / ${n}`),
  statsTitle: 'Added · removed · modified blocks',
  loading: 'Loading…',
  deletedFile: 'The note was deleted.',
  // Settings
  sGitPath: 'Git executable',
  sGitPathDesc: 'Leave empty to find git automatically (PATH, Homebrew, /usr/bin).',
  sOpenIn: 'Open the diff in',
  sOpenInTab: 'A new tab',
  sOpenInSplit: 'A split to the right',
  sDefaultLeft: 'Compare against',
  sWordDiff: 'Highlight changed words',
  sWordDiffDesc: 'Inside edited blocks, mark the exact words that changed.',
  sCollapse: 'Show only changes by default',
  sCollapseDesc: 'Fold long runs of unchanged blocks.',
  sContext: 'Context blocks',
  sContextDesc: 'Unchanged blocks kept visible around each change when folding.',
  sCommits: 'Commits in the list',
};

type Strings = typeof en;

const es: Strings = {
  viewTitle: 'Diff',
  openDiff: 'Mostrar diff renderizado de la nota actual',
  openDiffMenu: 'Mostrar diff renderizado',
  nextChange: 'Ir al siguiente cambio',
  prevChange: 'Ir al cambio anterior',
  refresh: 'Refrescar diff',
  toggleCollapse: 'Mostrar solo los cambios',
  head: 'HEAD (último commit)',
  index: 'Staged (índice)',
  working: 'Nota actual',
  commits: 'Commits',
  noFile: 'Abrí una nota y ejecutá “Mostrar diff renderizado”.',
  notMarkdown: 'El diff renderizado funciona con notas Markdown.',
  notRepo: 'Esta nota no está dentro de un repositorio git.',
  gitNotFound: 'No encontré git. Instalalo o poné su ruta en los ajustes del plugin.',
  gitFailed: 'git falló: ',
  notInLeft: 'No existe en esta versión',
  notInRight: 'El archivo no existe',
  noChanges: 'No hay cambios entre las dos versiones.',
  sameSides: 'Los dos lados son la misma versión.',
  unchangedBlocks: (n: number) => `${n} ${n === 1 ? 'bloque' : 'bloques'} sin cambios — mostrar`,
  changeCounter: (i: number, n: number) => (n === 0 ? 'Sin cambios' : `${i} / ${n}`),
  statsTitle: 'Bloques agregados · quitados · modificados',
  loading: 'Cargando…',
  deletedFile: 'La nota fue borrada.',
  sGitPath: 'Ejecutable de git',
  sGitPathDesc: 'Dejalo vacío para encontrar git solo (PATH, Homebrew, /usr/bin).',
  sOpenIn: 'Abrir el diff en',
  sOpenInTab: 'Una pestaña nueva',
  sOpenInSplit: 'Un panel a la derecha',
  sDefaultLeft: 'Comparar contra',
  sWordDiff: 'Resaltar las palabras cambiadas',
  sWordDiffDesc: 'Dentro de los bloques editados, marca exactamente qué palabras cambiaron.',
  sCollapse: 'Mostrar solo los cambios por defecto',
  sCollapseDesc: 'Pliega las tiradas largas de bloques sin cambios.',
  sContext: 'Bloques de contexto',
  sContextDesc: 'Bloques sin cambios que quedan visibles alrededor de cada cambio al plegar.',
  sCommits: 'Commits en la lista',
};

function language(): string {
  try {
    return (window.localStorage.getItem('language') || 'en').toLowerCase();
  } catch {
    return 'en';
  }
}

export const t: Strings = language().startsWith('es') ? es : en;
