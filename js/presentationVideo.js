import {db} from './dataClient.js';

const host=document.getElementById('hero-showreel');
const media=document.getElementById('hero-showreel-media');
if(host&&media){
  const {data}=await db.from('website_settings').select('presentation_video_url,presentation_video_type').eq('presentation_video_published',true).limit(1).maybeSingle();
  if(data?.presentation_video_url){
    if(data.presentation_video_type==='video/google-drive'){
      const frame=document.createElement('iframe');const url=new URL(data.presentation_video_url);url.searchParams.set('autoplay','1');frame.src=url.href;frame.title='Athar presentation video';frame.allow='autoplay; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';media.append(frame);
    }else{
      const video=document.createElement('video');video.src=data.presentation_video_url;video.playsInline=true;video.preload='auto';video.autoplay=true;video.muted=true;video.loop=true;video.setAttribute('muted','');video.setAttribute('autoplay','');
      const controls=document.createElement('div');controls.className='hero-video-controls';
      const control=(label,icon)=>{const button=document.createElement('button');button.type='button';button.className='hero-video-button';button.setAttribute('aria-label',label);button.innerHTML=icon;return button;};
      const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5Z"/></svg>',pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7v10M15 7v10"/></svg>';
      const soundIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h3l4 3V7l-4 3H5Zm10.5-.5a4 4 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/></svg>',muteIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h3l4 3V7l-4 3H5Zm10 0 4 4m0-4-4 4"/></svg>';
      const play=control('Pause video',pauseIcon),sound=control('Turn sound on',muteIcon);controls.append(play,sound);media.append(video,controls);
      const sync=()=>{const paused=video.paused;play.innerHTML=paused?playIcon:pauseIcon;play.setAttribute('aria-label',paused?'Play video':'Pause video');sound.innerHTML=video.muted?muteIcon:soundIcon;sound.setAttribute('aria-label',video.muted?'Turn sound on':'Mute video');};
      play.addEventListener('click',()=>video.paused?video.play().catch(()=>{}):video.pause());sound.addEventListener('click',()=>{video.muted=!video.muted;sync();});video.addEventListener('click',()=>video.paused?video.play().catch(()=>{}):video.pause());video.addEventListener('play',sync);video.addEventListener('pause',sync);video.addEventListener('volumechange',sync);sync();video.play().catch(sync);
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
