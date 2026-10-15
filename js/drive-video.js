// Turn a shareable Google Drive file URL into the supported embed URL.
function googleDriveFileId(value){
  if(typeof value!=='string'||!value.trim())return null;
  let url;
  try{url=new URL(value.trim());}catch{return null;}
  if(url.protocol!=='https:'||url.hostname!=='drive.google.com'||url.username||url.password)return null;
  const match=/^\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/(?:view|preview))?\/?$/.exec(url.pathname);
  const id=match?.[1]||(['\/open','\/uc','\/thumbnail'].includes(url.pathname)?url.searchParams.get('id'):null);
  if(!id||!/^[A-Za-z0-9_-]{10,200}$/.test(id))return null;
  return id;
}

export function googleDrivePreview(value){
  const id=googleDriveFileId(value);
  return id?`https://drive.google.com/file/d/${id}/preview`:null;
}

export function googleDriveImage(value){
  const id=googleDriveFileId(value);
  return id?`https://drive.google.com/thumbnail?id=${id}&sz=w2000`:null;
}
