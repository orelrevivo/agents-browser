const cursorId = "__groubot_agent_cursor__";

export function showAgentCursorScript(
  selector: string,
  action: "click" | "type",
): string {
  return `(()=>{
    const e=document.querySelector(${JSON.stringify(selector)});
    if(!e) throw new Error('Element not found');
    const r=e.getBoundingClientRect();
    if(!r.width && !r.height) throw new Error('Target element is not visible');
    document.getElementById(${JSON.stringify(cursorId)})?.remove();
    const cursor=document.createElement('div');
    cursor.id=${JSON.stringify(cursorId)};
    cursor.setAttribute('aria-hidden','true');
    cursor.style.cssText='position:fixed;z-index:2147483647;left:0;top:0;width:100%;height:100%;pointer-events:none;';
    const dot=document.createElement('div');
    dot.style.cssText='position:fixed;left:'+(r.left+r.width/2)+'px;top:'+(r.top+r.height/2)+'px;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #0099ff;border-radius:50%;box-shadow:0 0 0 4px rgba(0,153,255,.18),0 0 18px rgba(0,153,255,.7);background:rgba(0,153,255,.12);transition:left .18s ease,top .18s ease;';
    const label=document.createElement('div');
    label.textContent=${JSON.stringify(action === "click" ? "Agent clicking" : "Agent typing")};
    label.style.cssText='position:absolute;left:18px;top:-10px;white-space:nowrap;padding:3px 6px;border-radius:4px;background:rgba(15,23,42,.92);color:#dbeafe;font:11px sans-serif;';
    dot.appendChild(label); cursor.appendChild(dot); document.documentElement.appendChild(cursor);
    if(${JSON.stringify(action)}==='type'){
      e.focus();
      if(typeof e.select==='function') e.select();
      else if(e.isContentEditable){
        const selection=window.getSelection();
        const range=document.createRange();
        range.selectNodeContents(e);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),tag:e.tagName.toLowerCase()};
  })()`;
}

export function hideAgentCursorScript(): string {
  return `(()=>{document.getElementById(${JSON.stringify(cursorId)})?.remove();return {hidden:true};})()`;
}

export function typeTextScript(selector: string, text: string): string {
  return `(()=>{
    const e=document.querySelector(${JSON.stringify(selector)});
    if(!e) throw new Error('Element not found');
    if(e instanceof HTMLInputElement && e.type==='password') throw new Error('Password fields cannot be automated');
    const v=${JSON.stringify(text)};
    e.focus();
    if(e.isContentEditable || e.getAttribute('contenteditable')==='true'){
      const selection=window.getSelection();
      const range=document.createRange();
      range.selectNodeContents(e);
      selection?.removeAllRanges();
      selection?.addRange(range);
      const inserted=document.execCommand('insertText',false,v);
      if(!inserted){e.textContent=v;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:v}));}
      if(!(e.textContent||'').includes(v)){
        e.textContent=v;
        e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:v}));
      }
    }else{
      const prototype=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(prototype,'value')?.set;
      if(!setter) throw new Error('Target field is not editable');
      setter.call(e,v);
      e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:v}));
      e.dispatchEvent(new Event('change',{bubbles:true}));
    }
    const observed=e.isContentEditable?(e.textContent||''):e.value;
    if(!observed.includes(v)) throw new Error('Text was not inserted into the target field');
    return {typed:true,length:v.length};
  })()`;
}
