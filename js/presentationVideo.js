import {db} from './dataClient.js';
import {googleDriveDownload} from './drive-video.js?v=20261029-1';

const host=document.getElementById('hero-showreel');
const media=document.getElementById('hero-showreel-media');
if(host&&media){
  const {data}=await db.from('website_settings').select('presentation_video_url,presentation_video_type').eq('presentation_video_published',true).limit(1).maybeSingle();
  if(data?.presentation_video_url){
    {
      const driveVideo=data.presentation_video_type==='video/google-drive',video=document.createElement('video');video.src=driveVideo?googleDriveDownload(data.presentation_video_url):data.presentation_video_url;video.playsInline=true;video.preload='auto';video.autoplay=true;video.muted=true;video.loop=true;video.setAttribute('muted','');video.setAttribute('autoplay','');
      const controls=document.createElement('div');controls.className='hero-video-controls';
      const control=(label,icon)=>{const button=document.createElement('button');button.type='button';button.className='hero-video-button';button.setAttribute('aria-label',label);button.innerHTML=icon;return button;};
      const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5Z"/></svg>',pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7v10M15 7v10"/></svg>';
      const soundIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h3l4 3V7l-4 3H5Zm10.5-.5a4 4 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/></svg>',muteIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h3l4 3V7l-4 3H5Zm10 0 4 4m0-4-4 4"/></svg>';
      const play=control('Pause video',pauseIcon),sound=control('Turn sound on',muteIcon),progressWrap=document.createElement('div'),progress=document.createElement('input'),time=document.createElement('output');progressWrap.className='hero-video-progress';progress.type='range';progress.min='0';progress.max='1000';progress.value='0';progress.step='1';progress.setAttribute('aria-label','Video progress');time.className='hero-video-time';time.textContent='0:00';progressWrap.append(progress,time);controls.append(play,progressWrap,sound);media.append(video,controls);
      const format=value=>{if(!Number.isFinite(value))return'0:00';const minutes=Math.floor(value/60),seconds=Math.floor(value%60);return`${minutes}:${String(seconds).padStart(2,'0')}`;};
      const syncProgress=()=>{const duration=video.duration||0;progress.value=duration?String(Math.round(video.currentTime/duration*1000)):'0';progress.style.setProperty('--video-progress',`${duration?video.currentTime/duration*100:0}%`);time.textContent=`${format(video.currentTime)} / ${format(duration)}`;};
      const sync=()=>{const paused=video.paused;play.innerHTML=paused?playIcon:pauseIcon;play.setAttribute('aria-label',paused?'Play video':'Pause video');sound.innerHTML=video.muted?muteIcon:soundIcon;sound.setAttribute('aria-label',video.muted?'Turn sound on':'Mute video');syncProgress();};
      play.addEventListener('click',()=>video.paused?video.play().catch(()=>{}):video.pause());sound.addEventListener('click',()=>{video.muted=!video.muted;sync();});video.addEventListener('click',()=>video.paused?video.play().catch(()=>{}):video.pause());video.addEventListener('play',sync);video.addEventListener('pause',sync);video.addEventListener('volumechange',sync);sync();video.play().catch(sync);
      progress.addEventListener('input',()=>{if(Number.isFinite(video.duration))video.currentTime=Number(progress.value)/1000*video.duration;syncProgress();});video.addEventListener('timeupdate',syncProgress);video.addEventListener('durationchange',syncProgress);video.addEventListener('loadedmetadata',()=>{if(video.videoWidth&&video.videoHeight){host.style.setProperty('--video-aspect',`${video.videoWidth}/${video.videoHeight}`);host.classList.toggle('is-portrait',video.videoHeight>video.videoWidth);}syncProgress();});
      if(driveVideo)video.addEventListener('error',()=>{const frame=document.createElement('iframe'),url=new URL(data.presentation_video_url);url.searchParams.set('autoplay','1');frame.src=url.href;frame.title='Athar presentation video';frame.allow='autoplay; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';media.replaceChildren(frame);},{once:true});
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
