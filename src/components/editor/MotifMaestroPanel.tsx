import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Lock, Shuffle, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store/useStore";
import { buildMotifTile, buildRepeatProof, critiqueMotif, type MotifCritique, type MotifDirection, type MotifSymmetry } from "@/engine/motifMaestro";
import { downloadBlob } from "@/engine/export";

const INITIAL: MotifCritique = { seamless: 1, composition: .72, contrast: .68, motif: .76 };

export function MotifMaestroPanel() {
  const forge = useStore(s=>s.forge), randomise=useStore(s=>s.randomiseForge), reseed=useStore(s=>s.reseedForge);
  const setIntensity=useStore(s=>s.setForgeIntensity), setMosaic=useStore(s=>s.setForgeMosaic), setDensity=useStore(s=>s.setForgeMosaicDensity), setOverlay=useStore(s=>s.setForgeOverlay), setBase=useStore(s=>s.setForgeBaseImage), setSeamless=useStore(s=>s.setForgeSeamless), setTileMode=useStore(s=>s.setTileMode);
  const [direction,setDirection]=useState<MotifDirection>("all"), [symmetry,setSymmetry]=useState<MotifSymmetry>("mirror"), [variation,setVariation]=useState(.58), [auto,setAuto]=useState(false), [critique,setCritique]=useState(INITIAL), [busy,setBusy]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);

  const analyze=useCallback(()=>{ const source=useStore.getState().glCanvas;if(!source)return;try{setCritique(critiqueMotif(buildMotifTile(source,512,direction,symmetry)));}catch{} },[direction,symmetry]);
  const generate=useCallback((evolve=false)=>{
    if(busy)return;setBusy(true);setSeamless(true);setTileMode(symmetry==="mirror"?"mirror":"seamless");
    if(evolve){ setIntensity(Math.max(.18,Math.min(1,forge.intensity+(Math.random()-.5)*variation*.32))); setDensity(Math.max(.1,Math.min(1,forge.mosaicDensity+(Math.random()-.5)*variation*.28))); }
    randomise(); window.setTimeout(()=>{analyze();setBusy(false);},520);
  },[analyze,busy,forge.intensity,forge.mosaicDensity,randomise,setDensity,setIntensity,setSeamless,setTileMode,symmetry,variation]);
  useEffect(()=>{setSeamless(true);setTileMode("mirror");if(!forge.stack.length)randomise();const id=window.setTimeout(analyze,700);return()=>window.clearTimeout(id);},[]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(!auto)return;const id=window.setInterval(()=>generate(true),8000);return()=>window.clearInterval(id);},[auto,generate]);

  const loadBase=(file:File)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{setBase(img,file.name);setMosaic(true);setOverlay(.62);URL.revokeObjectURL(url);generate();toast.success("Image dissected into Motif Maestro");};img.onerror=()=>toast.error("Couldn't read that image");img.src=url;};
  const exportMotif=async(repeat=false)=>{const src=useStore.getState().glCanvas;if(!src)return;setBusy(true);try{const tile=buildMotifTile(src,2048,direction,symmetry),out=repeat?buildRepeatProof(tile,3):tile;const blob=await new Promise<Blob>((res,rej)=>out.toBlob(b=>b?res(b):rej(new Error("encode")),"image/png"));downloadBlob(blob,`motif-maestro-${forge.seed.toString(16)}-${repeat?"repeat":"tile"}.png`);setCritique(critiqueMotif(tile));toast.success(repeat?"3×3 repeat proof saved":"Seamless motif tile saved");}catch{toast.error("Motif export failed");}finally{setBusy(false);}};

  return <div className="motif-maestro" aria-label="Motif Maestro workspace">
    <aside className="motif-maestro__rail">
      <header><Sparkles/><div><strong>MOTIF MAESTRO</strong><span>still pattern intelligence</span></div></header>
      <div className="motif-maestro__actions"><button onClick={()=>generate(false)} disabled={busy}><Sparkles/> {busy?"COMPOSING…":"GENERATE"}</button><button onClick={()=>generate(true)} disabled={busy}><Shuffle/> EVOLVE</button></div>
      <label className="motif-maestro__seed"><span>SEED</span><code>{forge.seed.toString(16).padStart(6,"0")}</code><button title="New seed" onClick={()=>{reseed();generate();}}><Lock/></button></label>
      <fieldset><legend>SOURCE</legend><div className="motif-maestro__segments"><button data-on={!forge.baseImage||!forge.mosaicEnabled||undefined} onClick={()=>setMosaic(false)}>FORGE</button><button data-on={!!forge.baseImage&&forge.mosaicEnabled||undefined} onClick={()=>forge.baseImage?setMosaic(true):fileRef.current?.click()}>UPLOAD</button><button onClick={()=>window.dispatchEvent(new CustomEvent("mosh:switch-mode",{detail:"camera"}))}>CAMERA</button><button title="Choose image" onClick={()=>fileRef.current?.click()}><Upload/></button></div>{forge.baseName&&<small>{forge.baseName}</small>}</fieldset>
      <fieldset><legend>DIRECTION</legend><div className="motif-maestro__segments">{(["all","horizontal","vertical"] as MotifDirection[]).map(v=><button key={v} data-on={direction===v||undefined} onClick={()=>setDirection(v)}>{v}</button>)}</div></fieldset>
      <fieldset><legend>SYMMETRY</legend><div className="motif-maestro__segments">{(["mirror","rotate","kaleidoscope"] as MotifSymmetry[]).map(v=><button key={v} data-on={symmetry===v||undefined} onClick={()=>setSymmetry(v)}>{v}</button>)}</div></fieldset>
      <Range label="DENSITY" value={forge.mosaicDensity} onChange={setDensity}/><Range label="VARIATION" value={variation} onChange={setVariation}/>
      <label className="motif-maestro__auto"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> AUTO-EVOLVE STILL STATES</label>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];if(f)loadBase(f);e.target.value="";}}/>
    </aside>
    <div className="motif-maestro__frame" aria-hidden><i/><b/><span>3×3 REPEAT PROOF</span></div>
    <aside className="motif-maestro__readout"><strong>READOUT</strong>{Object.entries(critique).map(([k,v])=><div key={k}><label><span>{k}</span><em>{Math.round(v*100)}%</em></label><progress max="1" value={v}/></div>)}<button onClick={()=>void exportMotif(false)} disabled={busy}><Download/> EXPORT TILE</button><button onClick={()=>void exportMotif(true)} disabled={busy}><Download/> EXPORT REPEAT</button></aside>
  </div>;
}

function Range({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void}){return <label className="motif-maestro__range"><span>{label}<em>{Math.round(value*100)}%</em></span><input type="range" min="0" max="1" step=".01" value={value} onChange={e=>onChange(+e.target.value)}/></label>}
