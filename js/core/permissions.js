export const ROLES = Object.freeze([
  'owner','admin','manager','creator','uploader','commenter','downloader','viewer','client'
]);

export const LEGACY_ROLE_MAP = Object.freeze({team:'creator',member:'creator',freelancer:'viewer'});
export const normalizeRole = role => LEGACY_ROLE_MAP[role] || role;
export const ROLE_DEFINITIONS = Object.freeze({
  owner:{label:'Owner',description:'Workspace ownership and full access'},
  admin:{label:'Admin',description:'Full operational access'},
  manager:{label:'Manager',description:'Invite users and manage access'},
  creator:{label:'Creator',description:'Create and manage own folders'},
  uploader:{label:'Uploader',description:'Upload and manage own files'},
  commenter:{label:'Commenter',description:'Comment on shared work'},
  downloader:{label:'Downloader',description:'View and download shared work'},
  viewer:{label:'Viewer',description:'Read-only access'},
  client:{label:'Client',description:'External client access'}
});
const ALL = ['view','create','editOwn','manageAll','invite','share','upload','comment','download','billing','workspaceSettings'];
const CAPABILITIES = Object.freeze({
  owner:new Set(ALL),admin:new Set(ALL.filter(value=>value!=='workspaceSettings')),
  manager:new Set(['view','create','editOwn','manageAll','invite','share','upload','comment','download']),
  creator:new Set(['view','create','editOwn','upload','comment','download']),
  uploader:new Set(['view','upload']),commenter:new Set(['view','comment']),
  downloader:new Set(['view','download']),viewer:new Set(['view']),client:new Set(['view','comment'])
});
export const roleLabel = role => ROLE_DEFINITIONS[normalizeRole(role)]?.label || 'Viewer';
export const roleDescription = role => ROLE_DEFINITIONS[normalizeRole(role)]?.description || '';
export const hasCapability = (role, capability) => CAPABILITIES[normalizeRole(role)]?.has(capability) || false;
export const isStaffRole = role => normalizeRole(role) !== 'client' && ROLES.includes(normalizeRole(role));
export const isOwnerRole = role => normalizeRole(role) === 'owner';
export const isClientRole = role => normalizeRole(role) === 'client';
export const canManageRole = role => hasCapability(role,'invite');
export const canCreate = role => hasCapability(role,'create');
export const canShare = role => hasCapability(role,'share');
export const canUpload = role => hasCapability(role,'upload');
export const canComment = role => hasCapability(role,'comment');
export const canDownload = role => hasCapability(role,'download');
export function roleBadge(role){const normalized=normalizeRole(role),badge=document.createElement('span');badge.className=`ap-role-badge ap-role-badge--${normalized}`;badge.textContent=roleLabel(normalized);badge.title=roleDescription(normalized);return badge;}
