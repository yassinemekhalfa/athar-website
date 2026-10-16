import {db} from './dataClient.js';
import {googleDriveImage} from './drive-video.js';

const track=document.getElementById('trusted-client-track');
const section=document.getElementById('trusted-clients');

function clientItem(client){
  const content=document.createElement(client.website_url?'a':'span');
  content.className='trusted-client';
  if(client.website_url){content.href=client.website_url;content.target='_blank';content.rel='noopener';}
  const logo=googleDriveImage(client.logo_url)||client.logo_url;
  if(logo){const image=document.createElement('img');image.src=logo;image.alt=client.name;image.loading='lazy';content.append(image);}
  else{const name=document.createElement('strong');name.textContent=client.name;content.append(name);}
  return content;
}

if(track&&section){
  const {data,error}=await db.from('website_trusted_clients').select('id,name,logo_url,website_url,position').eq('published',true).order('position').order('created_at');
  if(!error&&data?.length){
    // Keep one complete sequence wider than the viewport. Two identical,
    // touching sequences can then cross the seam without exposing empty space.
    const cardWidth=228;
    const repeat=Math.max(2,Math.ceil((window.innerWidth+cardWidth*2)/(cardWidth*data.length)));
    const sequence=Array.from({length:repeat},()=>data).flat();
    const first=document.createElement('div'),second=document.createElement('div');first.className='trusted-client-sequence';second.className='trusted-client-sequence';second.setAttribute('aria-hidden','true');first.append(...sequence.map(clientItem));second.append(...sequence.map(clientItem));track.replaceChildren(first,second);
    const sizeLoop=()=>{const distance=first.getBoundingClientRect().width;track.style.setProperty('--trusted-loop-distance',`${distance}px`);track.style.setProperty('--trusted-loop-duration',`${Math.max(18,distance/62)}s`);};
    sizeLoop();new ResizeObserver(sizeLoop).observe(first);
    section.hidden=false;
  }
}
