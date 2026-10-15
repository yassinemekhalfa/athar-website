const colors={red:'#dc4545',orange:'#d77a27',green:'#32845a',blue:'#3879cf',purple:'#8254c6'};
export function taskColorValue(value){return colors[value]||(/^#[\da-f]{6}$/i.test(value||'')?value:null);}
export function applyTaskColor(node,task){
  const color=taskColorValue(task.task_color);
  node.classList.toggle('has-custom-color',Boolean(color));
  const isDark=color&&relativeLuminance(color)<0.16;
  node.classList.toggle('has-dark-custom-color',Boolean(isDark));
  if(color){node.style.setProperty('--task-color',color);node.style.setProperty('--task-tint',color+'18');}
}
function relativeLuminance(hex){
  const channels=hex.slice(1).match(/.{2}/g).map(channel=>parseInt(channel,16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2);
  return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
}
export function createTaskColorControl(value='none'){
  const root=document.createElement('div');root.className='ap-task-color-control';
  const select=document.createElement('select');select.className='ap-select';select.setAttribute('aria-label','Task color');
  for(const [key,label] of [['none','No color'],['red','Red'],['orange','Orange'],['green','Green'],['blue','Blue'],['purple','Purple'],['custom','Custom color']]){const option=document.createElement('option');option.value=key;option.textContent=label;select.append(option);}
  const custom=document.createElement('input');custom.type='color';custom.setAttribute('aria-label','Custom task color');custom.value=taskColorValue(value)||'#64748b';
  select.value=colors[value]?value:/^#/.test(value||'')?'custom':'none';custom.hidden=select.value!=='custom';
  select.addEventListener('change',()=>{custom.hidden=select.value!=='custom';});
  Object.defineProperties(root,{value:{get:()=>select.value==='custom'?custom.value:select.value},disabled:{set:disabled=>{select.disabled=disabled;custom.disabled=disabled;}}});
  root.append(select,custom);return root;
}
