import {db} from './dataClient.js';

const host=document.getElementById('hero-showreel');
const media=document.getElementById('hero-showreel-media');
if(host&&media){
  const {data}=await db.from('website_settings').select('presentation_video_url,presentation_video_type').eq('presentation_video_published',true).limit(1).maybeSingle();
  if(data?.presentation_video_url){
    const chrome=document.createElement('div');chrome.className='hero-showreel-chrome';chrome.innerHTML='<span><i aria-hidden="true"></i> Athar showreel</span><span>16:9</span>';
    host.prepend(chrome);
    if(data.presentation_video_type==='video/google-drive'){
      const frame=document.createElement('iframe');const url=new URL(data.presentation_video_url);url.searchParams.set('autoplay','1');frame.src=url.href;frame.title='Athar presentation video';frame.allow='autoplay; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';media.append(frame);
    }else{
      const video=document.createElement('video');video.src=data.presentation_video_url;video.controls=true;video.playsInline=true;video.preload='auto';video.autoplay=true;video.muted=true;video.loop=true;video.setAttribute('muted','');video.setAttribute('autoplay','');media.append(video);video.play().catch(()=>{});
    }
    host.hidden=false;
  }
}
