import {db} from './dataClient.js';

const host=document.getElementById('hero-showreel');
const media=document.getElementById('hero-showreel-media');
if(host&&media){
  const {data}=await db.from('website_settings').select('presentation_video_url,presentation_video_type').eq('presentation_video_published',true).limit(1).maybeSingle();
  if(data?.presentation_video_url){
    if(data.presentation_video_type==='video/google-drive'){
      const frame=document.createElement('iframe');frame.src=data.presentation_video_url;frame.title='Athar presentation video';frame.allow='autoplay; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';media.append(frame);
    }else{
      const video=document.createElement('video');video.src=data.presentation_video_url;video.controls=true;video.playsInline=true;video.preload='metadata';media.append(video);
    }
    host.hidden=false;
  }
}
