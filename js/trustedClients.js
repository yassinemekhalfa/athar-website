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
    const repeat=Math.max(1,Math.ceil(6/data.length));
    const sequence=Array.from({length:repeat},()=>data).flat();
    track.replaceChildren(...sequence.map(clientItem),...sequence.map(clientItem));
    section.hidden=false;
  }
}
