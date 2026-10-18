import { AppCore } from '../core/appCore.js';
import { getState } from '../core/state.js';
import { selectFolder, ensureUnfiledFolder } from '../workspace/folders.js';
import { openCreateFolder } from '../workspace/folderTree.js';
import { selectModule } from '../core/moduleRegistry.js';
import { workspaceIcon } from './workspaceIcons.js';
import { openFolderCoverSettings, openWorkspaceItemActions } from '../workspace/itemActions.js';
import { attachWorkspaceDropTarget, startWorkspaceDrag } from '../workspace/dragDrop.js';
import { canCreate } from '../core/permissions.js';

function el(tag, cls = '', text = null) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== null) node.textContent = text;
  return node;
}

function lineIcon(name) {
  const span = el('span', `ap-line-icon ap-line-icon--${name}`);
  span.setAttribute('aria-hidden', 'true');
  return span;
}

function getFirstName(context) {
  const fullName = context.profile?.full_name?.trim();
  if (fullName) return fullName.split(/\s+/)[0];

  const email = context.user?.email?.trim();
  if (email) return email.split('@')[0];

  return 'there';
}

function countFolderItems(folder, allFolders) {
  const count = allFolders.filter(
    item => item.parent_id === folder.id && !item.archived_at && !item.trashed_at
  ).length;

  const safeCount = count || 1;
  return `${safeCount} item${safeCount === 1 ? '' : 's'}`;
}

function buildFolderCard(folder, allFolders, context, onDone) {
  const wrap = el('div', 'k-home-folder-card-wrap');
  const card = el('button', 'ap-folder-card k-home-folder-card');
  card.type = 'button';
  card.style.setProperty('--folder-color', folder.color || '#f0bd2f');

  const tile = el('span', 'ap-folder-card__tile');
  tile.append(folder.icon_emoji ? el('span', 'k-home-folder-icon-emoji', folder.icon_emoji) : workspaceIcon('folder', 'k-home-folder-icon'));

  const name = el('strong', 'ap-folder-card__name', folder.name);
  const meta = el('small', 'ap-folder-card__meta', countFolderItems(folder, allFolders));

  card.append(tile, name, meta);
  card.addEventListener('click', () => selectFolder(folder.id));

  wrap.append(card);
  if (context.canCreate) {
    const menu = el('button', 'k-home-item-menu');
    menu.type = 'button';
    menu.setAttribute('aria-label', `Actions for ${folder.name}`);
    menu.append(workspaceIcon('more'));
    menu.addEventListener('click', event => {
      event.stopPropagation();
      openWorkspaceItemActions(menu, { ...folder, title: folder.name, type: 'folder' }, context, onDone);
    });
    wrap.append(menu);
    wrap.draggable = true;
    wrap.addEventListener('dragstart', event => startWorkspaceDrag(event, { type: 'folder', id: folder.id }));
    wrap.addEventListener('dragend', () => wrap.classList.remove('is-dragging'));
  }
  if (context.canCreate) attachWorkspaceDropTarget(wrap, folder.id, { onDrop: onDone });
  return wrap;
}

function typeLabel(type) {
  return {
    boards: 'Board',
    conversation: 'Conversation',
    docs: 'Document',
    embeds: 'Embed',
    invoices: 'Invoice'
  }[type] || 'Item';
}

function typeIcon(type) {
  return {
    boards: 'board',
    conversation: 'chat',
    docs: 'doc',
    embeds: 'link',
    invoices: 'invoice'
  }[type] || 'file';
}

function visibilityText(item) {
  return item.privacy === 'private' ? 'Private' : item.client_visible || item.privacy === 'shared' ? 'Shared with clients' : 'Internal';
}

function buildRecentItemsSection(context, onDone) {
  const section = el('section', 'k-home-recent-items-section');

  const table = el('div', 'k-home-recent-table');

  const head = el('div', 'k-home-recent-row k-home-recent-row--head');
  head.append(
    el('span', '', 'Recent Items'),
    el('span', '', 'Kind'),
    el('span', '', 'Visibility'),
    el('span', '', 'Created'),
    el('span', '', '')
  );
  table.append(head);

  const resources = [...(getState().resources || [])]
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at || 0) -
        new Date(a.updated_at || a.created_at || 0)
    )
    .slice(0, 4);

  if (!resources.length) {
    const empty = el('div', 'k-home-recent-row k-home-recent-row--empty');
    empty.append(
      el('span', '', 'No recent items'),
      el('span', '', '—'),
      el('span', '', '—'),
      el('span', '', '—'),
      el('span', '', '')
    );
    table.append(empty);
  }

  for (const item of resources) {
    const row = el('div', 'k-home-recent-row k-home-recent-row--item');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');

    const nameCell = el('span', 'k-home-recent-name');

    const iconWrap = el('span', 'k-home-recent-icon');
    iconWrap.append(workspaceIcon(typeIcon(item.module)));

    const textWrap = el('span', 'k-home-recent-name__copy');
    textWrap.append(el('strong', '', item.title || 'Untitled'));

    let subtitle = '';
    if (item.module === 'boards') subtitle = 'Board';
    else if (item.module === 'conversation') subtitle = 'Conversation';
    else if (item.module === 'docs') subtitle = 'Document';
    else if (item.module === 'embeds') subtitle = 'Embed';
    else if (item.module === 'invoices') subtitle = 'Invoice';

    textWrap.append(el('small', '', subtitle));

    nameCell.append(iconWrap, textWrap);

    row.append(
      nameCell,
      el('span', '', typeLabel(item.module)),
      el('span', 'k-home-muted', visibilityText(item)),
      el(
        'span',
        'ap-library-muted',
        item.created_at
          ? AppCore.utils.formatDate(item.created_at, 'short')
          : '—'
      )
    );

    const open = async () => {
      await selectFolder(item.folder_id || null, { skipOverview: true, refreshModule: false });
      await selectModule(item.module, item.id);
    };
    row.addEventListener('click', event => { if (!event.target.closest('button')) open(); });
    row.addEventListener('keydown', event => { if (event.target === row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); } });
    const actionCell = el('span', 'k-home-recent-actions');
    const itemType = { boards: 'board', conversation: 'conversation', docs: 'doc', embeds: 'embed', files: 'file' }[item.module];
    if (context.canCreate && itemType) {
      const menu = el('button', 'k-home-item-menu');
      menu.type = 'button';
      menu.setAttribute('aria-label', `Actions for ${item.title || 'item'}`);
      menu.append(workspaceIcon('more'));
      menu.addEventListener('click', event => {
        event.stopPropagation();
        openWorkspaceItemActions(menu, { ...item, type: itemType, raw: item }, context, onDone);
      });
      actionCell.append(menu);
      row.draggable = true;
      row.addEventListener('dragstart', event => startWorkspaceDrag(event, { type: itemType, id: item.id }));
    }
    row.append(actionCell);
    table.append(row);
  }

  section.append(table);
  return section;
}

function createCard(iconName, title, subtitle, onClick) {
  const card = el('button', 'k-home-create-card');
  card.type = 'button';

  const iconWrap = el('span', 'k-home-create-card__icon');
  iconWrap.append(workspaceIcon(iconName));
  const copy = el('span', 'k-home-create-card__copy');
  const strong = el('strong', '', title);
  const small = el('small', '', subtitle);

  copy.append(strong, small);
  card.append(iconWrap, copy);

  if (onClick) card.addEventListener('click', onClick);

  return card;
}

async function createResource(_title, moduleName) {
  try {
    const folder = await ensureUnfiledFolder();
    const context = { ...AppCore.getModuleContext(), folderId: folder.id, folder, resourceId: null };
    const openCreatedResource = async resource => {
      await selectFolder(resource.folder_id || folder.id, { skipOverview: true, refreshModule: false });
      await selectModule(moduleName, resource.id);
    };
    if (moduleName === 'boards') (await import('../modules/boards.js?v=task-complete-1')).openBoardForm(null, { context, onDone: openCreatedResource });
    else if (moduleName === 'conversation') (await import('../modules/conversation.js?v=client-conversation-1')).openCreateConversation({ context, onDone: openCreatedResource });
    else if (moduleName === 'embeds') (await import('../modules/embeds.js?v=home-create-1')).openEmbedCreation(context, openCreatedResource);
    else if (moduleName === 'docs') await (await import('../modules/docs.js')).createDocument();
  } catch (error) { AppCore.ui.toast(AppCore.ui.describeError(error), 'error'); }
}

function buildCreateSection() {
  const section = el('section', 'k-home-create-section');
  section.append(el('h2', 'k-home-section-title', 'Create'));

  const grid = el('div', 'ap-create-grid k-home-create-grid');

  grid.append(
    createCard('folder', 'New Folder', 'Organize everything', () => openCreateFolder()),
    createCard('board', 'Board', 'Track projects', () => createResource('Create Board', 'boards')),
    createCard('conversation', 'Conversation', 'Discuss anything', () => createResource('Create Conversation', 'conversation')),
    createCard('embed', 'Embed', 'Add third-party apps', () => createResource('Create Embed', 'embeds'))
  );

  section.append(grid);
  return section;
}

export function folderCover(root, folder, actions) {
  const color = folder?.color || 'var(--video-accent)';
  root.style.setProperty('--folder-color', color);

  const crumb = el('nav', 'v-folder-crumb');
  crumb.setAttribute('aria-label', 'Folder path');

  const home = el('a', '', '⌂ Home');
  home.href = '#/home';
  home.addEventListener('click', (e) => {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('workspace:home'));
  });

  crumb.append(home);

  if (folder) {
    for (const part of AppCore.getFolderPath(folder.id)) {
      const b = el('button', 'v-breadcrumb', part.name);
      b.type = 'button';
      b.addEventListener('click', () => selectFolder(part.id));
      crumb.append(' › ', b);
    }
  }

  const banner = el('div', 'v-folder-banner');
  const coverColor = /^#[\da-f]{6}$/i.test(folder?.color || '') ? folder.color : '#f3f3f3';
  banner.style.backgroundColor = coverColor;
  if (folder?.cover_image) {
    try {
      const coverUrl = new URL(folder.cover_image, location.origin);
      if (coverUrl.protocol === 'https:' || coverUrl.origin === location.origin) {
        const image = el('img', 'v-folder-banner__image');
        image.src = coverUrl.href;
        image.alt = '';
        banner.append(image);
      }
    } catch {
      // Ignore invalid legacy cover URLs and keep the saved color visible.
    }
  }
  if (folder && canCreate(getState().role)) {
    const editCover = el('button', 'v-folder-banner__edit', 'Edit cover');
    editCover.type = 'button';
    editCover.addEventListener('click', () => openFolderCoverSettings(folder));
    banner.append(editCover);
  }
  const heading = el('div', 'v-folder-title');

  let badge;
  if(folder?.avatar_url){badge=el('span','v-folder-badge v-client-folder-badge');const image=el('img');image.src=folder.avatar_url;image.alt='';badge.append(image);}
  else if(folder?.client_id||folder?.icon_emoji){badge=el('span','v-folder-badge v-client-folder-badge',folder.icon_emoji||'👤');}
  else badge=workspaceIcon(folder ? 'shared' : 'home', 'v-folder-badge');
  heading.append(badge,el('h1', '', folder?.name || 'Home'));

  if (actions) {
    actions.classList.add('v-folder-actions');
    heading.append(actions);
  }

  if (folder) root.append(crumb, banner, heading);
  else { heading.classList.add('v-home-title'); heading.querySelector('.v-folder-badge')?.remove(); root.append(crumb, heading); }
}

export async function renderWorkspaceHome(container, context) {
  container.replaceChildren();
  container.className = 'ap-module-content';

  const embedded = !!container.closest('.k-inbox-right');

  const shell = el('section', embedded ? 'k-home-embedded' : 'k-reference-home');
  const root = el('div', 'ap-hub-view ap-home-view');

  const hero = el('section', 'ap-home-hero');
  const welcome = el('h1', 'k-reference-home__welcome');

  const wave = el('span', 'k-home-wave', '👋');
  welcome.append(
    wave,
    document.createTextNode(` Welcome, ${getFirstName(context)}!`)
  );

  hero.append(welcome);
  root.append(hero);

  const folders = AppCore.getFolders().filter(
    f => !f.system_key && !f.archived_at && !f.trashed_at
  );

  const ids = new Set(folders.map(f => f.id));
  const topFolders = folders.filter(
    f => !f.parent_id || !ids.has(f.parent_id)
  );

  const recent = el('section', 'k-home-folder-section');
  recent.append(el('h2', 'k-home-section-title', 'Recent Folders'));

  const folderGrid = el('div', 'k-home-folder-grid');

  for (const folder of topFolders.slice(0, 2)) {
    folderGrid.append(buildFolderCard(folder, folders, context, () => renderWorkspaceHome(container, context)));
  }

  if (!topFolders.length) {
    folderGrid.append(
      el('p', 'ap-soft-empty', context.canCreate
        ? 'Create your first folder to start organizing client work.'
        : 'Folders shared with you will appear here.')
    );
  }

  recent.append(folderGrid);
  root.append(recent);

  root.append(buildRecentItemsSection(context, () => renderWorkspaceHome(container, context)));

  if (context.canCreate) {
    root.append(buildCreateSection());
  }

  shell.append(root);
  container.append(shell);
}
