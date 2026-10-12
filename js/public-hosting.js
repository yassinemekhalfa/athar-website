// Empty on the Render/local app; the static-site build supplies a public config.
const config=window.ATHAR_PUBLIC_SITE||{};
export const portalOrigin=config.portalOrigin||location.origin;
export const conceptMode=config.portfolioMode==='concepts';
export function publicMedia(src){return typeof src==='string'&&src.startsWith('/api/website/media/')?new URL(src,portalOrigin).href:src;}
export function publishedProject(project){return {...project,cover:publicMedia(project.cover),images:(project.images||[]).map(publicMedia),...(project.video?{video:{...project.video,src:publicMedia(project.video.src),poster:publicMedia(project.video.poster)}}:{})};}
