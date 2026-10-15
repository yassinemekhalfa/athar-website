import {db} from './dataClient.js';

const host=document.getElementById('hero-showreel');
const media=document.getElementById('hero-showreel-media');
if(host&&media){
  const {data}=await db.from('website_settings').select('presentation_video_url,presentation_video_type').eq('presentation_video_published',true).limit(1).maybeSingle();
  if(data?.presentation_video_url){
    if(data.presentation_video_type==='video/google-drive'){
      const frame=document.createElement('iframe');const url=new URL(data.presentation_video_url);url.searchParams.set('autoplay','1');frame.src=url.href;frame.title='Athar presentation video';frame.allow='autoplay; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';media.append(frame);
    }else{
      const video=document.createElement('video');video.src=data.presentation_video_url;video.controls=true;video.playsInline=true;video.preload='auto';video.autoplay=true;video.muted=true;video.loop=true;video.setAttribute('muted','');video.setAttribute('autoplay','');media.append(video);video.play().catch(()=>{});
    }
    host.hidden=false;
    const heroHome=host.parentElement,about=document.querySelector('#about .wrap'),statue=document.getElementById('statueStage'),desktop=matchMedia('(min-width: 901px)');
    const place=()=>{
      if(desktop.matches&&about&&statue){about.insertBefore(host,statue);about.classList.add('has-showreel');}
      else{heroHome.append(host);about?.classList.remove('has-showreel');}
    };
    place();desktop.addEventListener('change',place);
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
      host.addEventListener('pointermove',event=>{const box=host.getBoundingClientRect(),x=(event.clientX-box.left)/box.width-.5,y=(event.clientY-box.top)/box.height-.5;host.style.setProperty('--video-rx',`${(-y*7).toFixed(2)}deg`);host.style.setProperty('--video-ry',`${(x*9).toFixed(2)}deg`);});
      host.addEventListener('pointerleave',()=>{host.style.setProperty('--video-rx','0deg');host.style.setProperty('--video-ry','0deg');});
    }
  }
}
