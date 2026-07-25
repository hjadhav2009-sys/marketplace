"use client";

import { useMemo, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { StatusBadge } from "@/components/StatusBadge";

type Variant = "desktop" | "mobile";
type Section = "image" | "identity" | "quantities" | "actions";

const INITIAL_ORDER: Section[] = ["image", "identity", "quantities", "actions"];

export function WorkCardLiveEditor() {
  const [direction, setDirection] = useState<"row" | "column">("row");
  const [columns, setColumns] = useState(2);
  const [order, setOrder] = useState<Section[]>(INITIAL_ORDER);
  const [gap, setGap] = useState(16);
  const [padding, setPadding] = useState(16);
  const [margin, setMargin] = useState(0);
  const [imageSize, setImageSize] = useState(112);
  const [imageAspect, setImageAspect] = useState("1 / 1");
  const [fontSize, setFontSize] = useState(18);
  const [buttonDirection, setButtonDirection] = useState<"row" | "column">("row");
  const [radius, setRadius] = useState(16);
  const [shadow, setShadow] = useState(true);
  const [visible, setVisible] = useState<Record<Section, boolean>>({ image: true, identity: true, quantities: true, actions: true });
  const [variant, setVariant] = useState<Variant>("desktop");
  const [approval, setApproval] = useState("");

  const specification = useMemo(() => ({
    targetComponent: "GroupedWorkCard / Pick card",
    viewport: variant === "mobile" ? "390x844" : "1440x900",
    sourceRoute: "/work/pick",
    sourceScenario: "PICK_READY",
    layout: { direction, columns, gap, padding, margin, imageSize, imageAspect, fontSize, buttonDirection, radius, shadow },
    tokens: { radius, shadow: shadow ? "card" : "none", spacing: { gap, padding, margin } },
    sectionOrder: order,
    visibilityRules: visible,
    desktopMobileRules: { activeVariant: variant, desktop: { direction }, mobile: { direction: "column", columns: 1 } },
    interactionNotes: "Preserve authoritative Pick actions and route-confirmation behavior.",
    dataRequirements: "Use immutable task and route snapshots only.",
    ownerNotes: "Approved from the private synthetic Live Component editor."
  }), [buttonDirection, columns, direction, fontSize, gap, imageAspect, imageSize, margin, order, padding, radius, shadow, variant, visible]);

  function move(section: Section, delta: number) {
    const index = order.indexOf(section);
    const target = Math.max(0, Math.min(order.length - 1, index + delta));
    if (target === index) return;
    const next = [...order];
    next.splice(index, 1);
    next.splice(target, 0, section);
    setOrder(next);
  }

  async function approve() {
    const response = await fetch("/api/qa/ui-audit/approved-designs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(specification)
    });
    const result = await response.json() as { privatePath?: string };
    setApproval(response.ok ? `Approved locally: ${result.privatePath}` : "Approval could not be saved.");
  }

  const sections: Record<Section, React.ReactNode> = {
    image: <ProductImage src={null} alt="Synthetic Pick product" size="lg" showBadge={false}/>,
    identity: <div className="min-w-0"><div className="flex flex-wrap gap-2"><StatusBadge value="READY"/><span className="rounded-full bg-slate-950 px-2 py-1 text-xs font-black text-white">ORDER</span></div><h3 className="mt-2 font-black" style={{ fontSize }}>Synthetic Pick Work Item</h3><p className="break-all text-xs text-slate-500">STAGE-TRACKING-LONG-IDENTIFIER-0001</p></div>,
    quantities: <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}><div className="rounded-lg bg-slate-50 p-2 text-center"><small>Required</small><b className="block text-xl">4</b></div><div className="rounded-lg bg-slate-50 p-2 text-center"><small>Completed</small><b className="block text-xl">1</b></div></div>,
    actions: <div className="flex gap-2" style={{ flexDirection: buttonDirection }}><button className="min-h-11 flex-1 rounded-lg bg-berry px-3 font-bold text-white">Picked All</button><button className="min-h-11 flex-1 rounded-lg border px-3 font-bold">Details</button></div>
  };

  return <section className="mt-8 grid gap-5 xl:grid-cols-[22rem_1fr]">
    <aside className="rounded-2xl border bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase text-violet-700">Live Component mode</p>
      <h2 className="text-xl font-black">Pick card controls</h2>
      <div className="mt-4 grid gap-3 text-sm">
        <Select label="Variant" value={variant} set={value => setVariant(value as Variant)} options={["desktop","mobile"]}/>
        <Select label="Layout direction" value={direction} set={value => setDirection(value as "row"|"column")} options={["row","column"]}/>
        <Range label="Grid columns" value={columns} min={1} max={4} set={setColumns}/>
        <Range label="Gap" value={gap} min={0} max={48} set={setGap}/>
        <Range label="Padding" value={padding} min={0} max={48} set={setPadding}/>
        <Range label="Margin" value={margin} min={0} max={48} set={setMargin}/>
        <Range label="Image size" value={imageSize} min={64} max={240} set={setImageSize}/>
        <Select label="Image aspect" value={imageAspect} set={setImageAspect} options={["1 / 1","4 / 3","16 / 9"]}/>
        <Range label="Typography" value={fontSize} min={14} max={32} set={setFontSize}/>
        <Select label="Button layout" value={buttonDirection} set={value => setButtonDirection(value as "row"|"column")} options={["row","column"]}/>
        <Range label="Radius" value={radius} min={0} max={32} set={setRadius}/>
        <label className="flex min-h-11 items-center gap-2 font-bold"><input type="checkbox" checked={shadow} onChange={event=>setShadow(event.target.checked)}/> Card shadow</label>
      </div>
      <h3 className="mt-5 font-black">Order and visibility</h3>
      <div className="mt-2 space-y-2">{order.map(section=><div key={section} className="flex items-center gap-1 rounded-lg border p-2"><input aria-label={`Show ${section}`} type="checkbox" checked={visible[section]} onChange={event=>setVisible(current=>({...current,[section]:event.target.checked}))}/><span className="min-w-0 flex-1 font-bold capitalize">{section}</span><button onClick={()=>move(section,-1)} className="min-h-10 rounded border px-2">↑</button><button onClick={()=>move(section,1)} className="min-h-10 rounded border px-2">↓</button></div>)}</div>
      <button onClick={()=>void approve()} className="mt-5 min-h-12 w-full rounded-xl bg-violet-700 px-4 font-black text-white">Approve Design</button>
      {approval ? <p role="status" className="mt-2 break-words text-xs font-bold text-teal-700">{approval}</p> : null}
    </aside>
    <div className="rounded-2xl border bg-slate-100 p-4">
      <p className="mb-3 text-sm font-bold">Immediate synthetic preview · {variant}</p>
      <div className={variant === "mobile" ? "mx-auto max-w-[390px]" : "max-w-5xl"}>
        <article className="flex border bg-white" style={{ flexDirection: variant === "mobile" ? "column" : direction, gap, padding, margin, borderRadius: radius, boxShadow: shadow ? "0 12px 30px rgba(15,23,42,.12)" : "none" }}>
          {order.filter(section=>visible[section]).map(section=><div key={section} style={section==="image"?{width:imageSize,aspectRatio:imageAspect,maxWidth:"100%"}:{flex:section==="identity"?1:undefined,minWidth:0}}>{sections[section]}</div>)}
        </article>
      </div>
    </div>
  </section>;
}

function Range({label,value,min,max,set}:{label:string;value:number;min:number;max:number;set:(value:number)=>void}) {
  return <label className="font-bold">{label}: {value}<input className="mt-1 w-full" type="range" min={min} max={max} value={value} onChange={event=>set(Number(event.target.value))}/></label>;
}
function Select({label,value,set,options}:{label:string;value:string;set:(value:string)=>void;options:string[]}) {
  return <label className="font-bold">{label}<select className="mt-1 min-h-11 w-full rounded-lg border px-2" value={value} onChange={event=>set(event.target.value)}>{options.map(option=><option key={option}>{option}</option>)}</select></label>;
}
