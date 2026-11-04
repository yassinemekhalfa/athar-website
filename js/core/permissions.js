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
export const CAPABILITY_LABELS = Object.freeze({view:'View workspace',create:'Create folders and work',editOwn:'Edit own work',manageAll:'Manage all work',invite:'Manage members',share:'Share with clients',upload:'Upload files',comment:'Comment and review',download:'Download files',billing:'Manage billing',workspaceSettings:'Workspace settings'});
export const ALL_CAPABILITIES = Object.freeze(Object.keys(CAPABILITY_LABELS));
export const SECTION_LABELS = Object.freeze({showHome:'Home',showInbox:'Inbox and conversations',showTasks:'Tasks and boards',showLibrary:'Library, folders and files',showClients:'Clients',showInvoices:'Invoices',showProposals:'Proposals and contracts',showSettings:'Settings'});
export const ALL_SECTIONS = Object.freeze(Object.keys(SECTION_LABELS));
const CAPABILITIES = Object.freeze({
  owner:new Set(ALL_CAPABILITIES),admin:new Set(ALL_CAPABILITIES.filter(value=>value!=='workspaceSettings')),
  manager:new Set(['view','create','editOwn','manageAll','invite','share','upload','comment','download']),
  creator:new Set(['view','create','editOwn','upload','comment','download']),
  uploader:new Set(['view','upload']),commenter:new Set(['view','comment']),
  downloader:new Set(['view','download']),viewer:new Set(['view']),client:new Set(['view','comment'])
});
export const roleLabel = role => ROLE_DEFINITIONS[normalizeRole(role)]?.label || 'Viewer';
export const roleDescription = role => ROLE_DEFINITIONS[normalizeRole(role)]?.description || '';
export const hasCapability = (role, capability, overrides={}) => normalizeRole(role)==='owner' ? true : typeof overrides?.[capability]==='boolean' ? overrides[capability] : CAPABILITIES[normalizeRole(role)]?.has(capability) || false;
export const roleCapabilities = role => ALL_CAPABILITIES.filter(capability=>hasCapability(role,capability));
export const isSectionVisible = (role, section, overrides={}) => normalizeRole(role)==='owner' || overrides?.[section]!==false;
export const isStaffRole = role => normalizeRole(role) !== 'client' && ROLES.includes(normalizeRole(role));
export const isOwnerRole = role => normalizeRole(role) === 'owner';
export const isClientRole = role => normalizeRole(role) === 'client';
// Member administration is enforced by the database for leaders only.
export const canManageRole = role => hasCapability(role,'invite');
export const canAdministerMembers = role => ['owner','admin'].includes(normalizeRole(role));
export const canCreate = (role,overrides) => hasCapability(role,'create',overrides);
export const canShare = (role,overrides) => hasCapability(role,'share',overrides);
export const canUpload = (role,overrides) => hasCapability(role,'upload',overrides);
export const canComment = (role,overrides) => hasCapability(role,'comment',overrides);
export const canDownload = (role,overrides) => hasCapability(role,'download',overrides);
export function roleBadge(role){const normalized=normalizeRole(role),badge=document.createElement('span');badge.className=`ap-role-badge ap-role-badge--${normalized}`;badge.textContent=roleLabel(normalized);badge.title=roleDescription(normalized);return badge;}

